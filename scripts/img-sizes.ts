import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { promises as fs } from "node:fs";
import * as path from "node:path";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const imgs = await db.productImage.findMany({
    where: { isPrimary: true },
    select: { url: true, productId: true },
  });
  console.log(`Lacznie primary images: ${imgs.length}`);
  let local = 0,
    cdn = 0,
    totalBytes = 0,
    sampled = 0,
    errors = 0;
  let maxKb = 0;
  let maxUrl = "";
  for (const img of imgs) {
    if (!img.url) continue;
    if (img.url.startsWith("/uploads/")) {
      local++;
      try {
        const abs = path.join(process.cwd(), "public", img.url);
        const s = await fs.stat(abs);
        totalBytes += s.size;
        sampled++;
        const kb = s.size / 1024;
        if (kb > maxKb) {
          maxKb = kb;
          maxUrl = img.url;
        }
      } catch {
        errors++;
      }
    } else {
      cdn++;
    }
  }
  console.log(`  Lokalne /uploads/: ${local}, CDN/inne: ${cdn}`);
  if (sampled > 0) {
    console.log(
      `  Sampled ${sampled} plikow: razem ${(totalBytes / 1024 / 1024).toFixed(1)} MB`,
    );
    console.log(
      `  Srednio na obrazek: ${(totalBytes / sampled / 1024).toFixed(0)} KB`,
    );
    console.log(`  Max: ${maxKb.toFixed(0)} KB - ${maxUrl}`);
  }
  if (errors) console.log(`  Niedostepne pliki: ${errors}`);
}
main()
  .catch(console.error)
  .finally(() => db.$disconnect());
