/**
 * Generuje miniaturki WebP 144×144 + blur dla wszystkich istniejących
 * ProductImage (głównie legacy upload sprzed thumbnail feature'a).
 *
 * Idempotentne — pomija rekordy, które już mają `thumbnailWebpUrl`.
 * Działa równolegle (PARALLELISM rekordów na raz).
 *
 * Pliki źródłowe:
 *   - lokalnie (`/uploads/...`)  → czyta z dysku w `public/`
 *   - remote (`http(s)://...`)   → fetch + buffer
 *
 * Thumb zapisywany obok oryginału jako `<oryginal>.thumb.webp`,
 * URL zapisywany w kolumnie `thumbnailWebpUrl`. Blur (4×4 base64) w
 * `thumbnailBlurDataUrl`.
 *
 *   npx tsx scripts/generate-all-thumbnails.ts            # dry-run
 *   npx tsx scripts/generate-all-thumbnails.ts --apply    # rzeczywiste zapisy
 */
import "dotenv/config";
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const THUMB_SIZE = 144;
const BLUR_SIZE = 4;
const PARALLELISM = 6;

interface Job {
  id: string;
  url: string;
}

async function readSource(url: string): Promise<Buffer | null> {
  if (url.startsWith("/uploads/")) {
    const abs = path.join(process.cwd(), "public", url);
    try {
      return await fs.readFile(abs);
    } catch {
      return null;
    }
  }
  if (/^https?:\/\//.test(url)) {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    } catch {
      return null;
    }
  }
  return null;
}

async function writeThumb(url: string, thumb: Buffer): Promise<string | null> {
  if (url.startsWith("/uploads/")) {
    const abs = path.join(process.cwd(), "public", `${url}.thumb.webp`);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, thumb);
    return `${url}.thumb.webp`;
  }
  // Remote (Vercel Blob etc.) — nie obsługujemy w batch-script bo wymagałby
  // re-upload do tego samego storage. Caller na produkcji powinien upewnić się,
  // że wszystkie obrazki są lokalne (po migracji z Vercel Blob na local).
  return null;
}

async function processOne(
  job: Job,
  apply: boolean,
): Promise<"ok" | "skip" | "fail"> {
  const src = await readSource(job.url);
  if (!src) return "fail";
  let thumb: Buffer;
  let blurDataUrl: string;
  try {
    const img = sharp(src, { failOn: "none" });
    const [t, b] = await Promise.all([
      img
        .clone()
        .resize(THUMB_SIZE, THUMB_SIZE, { fit: "cover" })
        .webp({ quality: 80 })
        .toBuffer(),
      img
        .clone()
        .resize(BLUR_SIZE, BLUR_SIZE, { fit: "cover" })
        .webp({ quality: 50 })
        .toBuffer(),
    ]);
    thumb = t;
    blurDataUrl = `data:image/webp;base64,${b.toString("base64")}`;
  } catch {
    return "fail";
  }

  if (!apply) return "ok"; // dry-run

  const thumbUrl = await writeThumb(job.url, thumb);
  if (!thumbUrl) return "skip"; // remote, nie zapisujemy

  await db.productImage.update({
    where: { id: job.id },
    data: { thumbnailWebpUrl: thumbUrl, thumbnailBlurDataUrl: blurDataUrl },
  });
  return "ok";
}

async function runInParallel<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<"ok" | "skip" | "fail">,
): Promise<{ ok: number; skip: number; fail: number }> {
  let i = 0;
  const counts = { ok: 0, skip: 0, fail: 0 };
  const workers = Array.from({ length: limit }, async () => {
    while (i < items.length) {
      const idx = i++;
      const result = await fn(items[idx]);
      counts[result]++;
      if ((counts.ok + counts.skip + counts.fail) % 10 === 0) {
        console.log(
          `  → ok ${counts.ok}, skip ${counts.skip}, fail ${counts.fail}`,
        );
      }
    }
  });
  await Promise.all(workers);
  return counts;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const jobs = await db.productImage.findMany({
    where: { thumbnailWebpUrl: null },
    select: { id: true, url: true },
  });
  console.log(`Znaleziono ${jobs.length} ProductImage bez thumb.`);
  if (jobs.length === 0) {
    console.log("Nic do roboty.");
    return;
  }
  console.log(`Przetwarzam równolegle (${PARALLELISM})...\n`);
  const t0 = Date.now();
  const counts = await runInParallel(jobs, PARALLELISM, (j) =>
    processOne(j, apply),
  );
  const dt = Date.now() - t0;
  console.log(
    `\nPodsumowanie: ok ${counts.ok}, skip ${counts.skip}, fail ${counts.fail} w ${dt}ms`,
  );
  if (!apply) {
    console.log(
      "\nTO BYŁ DRY-RUN. Aby zapisać: npx tsx scripts/generate-all-thumbnails.ts --apply",
    );
  }
}

main()
  .catch((e) => console.error(e))
  .finally(() => db.$disconnect());
