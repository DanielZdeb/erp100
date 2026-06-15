/**
 * Storage abstraction — lokalnie zapisuje pliki do `public/uploads/`,
 * w produkcji (gdy BLOB_READ_WRITE_TOKEN ustawione) używa Vercel Blob.
 *
 * Frontend powinien używać tylko URL-i zwracanych przez `uploadFile`.
 * URL może być względny ("/uploads/...") albo absolutny (Vercel Blob).
 *
 * Dla obrazków (JPG/PNG/WEBP) automatycznie generuje miniaturkę 144×144 WebP
 * (~5 KB) przez sharp. Zwracane w polach `thumbnailWebpUrl` i
 * `thumbnailBlurDataUrl`. Caller (np. server action zapisujący ProductImage)
 * powinien zapisać te wartości w kolumnach DB.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";

export interface UploadResult {
  url: string;
  filename: string;
  contentType: string | null;
  sizeBytes: number;
  /** URL miniaturki WebP 144×144 (null jeśli plik nie jest obrazkiem). */
  thumbnailWebpUrl: string | null;
  /** Base64 data URL dla `<Image placeholder="blur">` (4×4 px WebP, null jak wyżej). */
  thumbnailBlurDataUrl: string | null;
}

const useVercelBlob = !!process.env.BLOB_READ_WRITE_TOKEN;

/** Rozmiar miniaturki w px — 2× design size (72px na 36px ikonkę) dla retina. */
const THUMB_SIZE = 144;
/** Quality WebP — 80 to dobry balans rozmiar/jakość dla miniaturek. */
const THUMB_QUALITY = 80;
/** Rozmiar blur placeholdera w px. */
const BLUR_SIZE = 4;

/** Rozpoznajemy obrazki po Content-Type (najpewniej) z fallbackiem na rozszerzenie. */
function isImage(file: File): boolean {
  if (file.type && file.type.startsWith("image/")) return true;
  const ext = path.extname(file.name).toLowerCase();
  return [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"].includes(ext);
}

/** Generuje miniaturkę + blur placeholder z bufora oryginalnego obrazka.
 *  Zwraca `{thumbBuffer, blurDataUrl}` lub `null` gdy sharp nie umie tego
 *  rozpakować (np. niewspierany format). */
async function generateThumb(
  buf: Buffer,
): Promise<{ thumb: Buffer; blurDataUrl: string } | null> {
  try {
    const img = sharp(buf, { failOn: "none" });
    const [thumb, blur] = await Promise.all([
      img
        .clone()
        .resize(THUMB_SIZE, THUMB_SIZE, { fit: "cover" })
        .webp({ quality: THUMB_QUALITY })
        .toBuffer(),
      img
        .clone()
        .resize(BLUR_SIZE, BLUR_SIZE, { fit: "cover" })
        .webp({ quality: 50 })
        .toBuffer(),
    ]);
    return {
      thumb,
      blurDataUrl: `data:image/webp;base64,${blur.toString("base64")}`,
    };
  } catch {
    return null;
  }
}

export async function uploadFile(
  file: File,
  options: { folder: string },
): Promise<UploadResult> {
  const safeName = sanitizeFilename(file.name);
  const stamped = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
  const key = `${options.folder}/${stamped}`;
  const buf = Buffer.from(await file.arrayBuffer());

  // Generowanie thumb tylko dla plików, które wyglądają na obrazki —
  // PDF/MP4/CSV idą jak były.
  const thumbData = isImage(file) ? await generateThumb(buf) : null;
  // Nazwa pliku thumb: ten sam stamped basename + sufix `.thumb.webp`.
  const thumbKey = thumbData ? `${key}.thumb.webp` : null;

  if (useVercelBlob) {
    const { put } = await import("@vercel/blob");
    const [blob, thumbBlob] = await Promise.all([
      put(key, file, { access: "public" }),
      thumbData && thumbKey
        ? put(thumbKey, thumbData.thumb, {
            access: "public",
            contentType: "image/webp",
          })
        : Promise.resolve(null),
    ]);
    return {
      url: blob.url,
      filename: file.name,
      contentType: file.type || null,
      sizeBytes: file.size,
      thumbnailWebpUrl: thumbBlob?.url ?? null,
      thumbnailBlurDataUrl: thumbData?.blurDataUrl ?? null,
    };
  }

  const dir = path.join(process.cwd(), "public", "uploads", options.folder);
  await fs.mkdir(dir, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(dir, stamped), buf),
    thumbData && thumbKey
      ? fs.writeFile(path.join(dir, `${stamped}.thumb.webp`), thumbData.thumb)
      : Promise.resolve(),
  ]);
  return {
    url: `/uploads/${key}`,
    filename: file.name,
    contentType: file.type || null,
    sizeBytes: file.size,
    thumbnailWebpUrl: thumbKey ? `/uploads/${thumbKey}` : null,
    thumbnailBlurDataUrl: thumbData?.blurDataUrl ?? null,
  };
}

export async function deleteFile(url: string): Promise<void> {
  if (useVercelBlob && /^https?:\/\//.test(url)) {
    const { del } = await import("@vercel/blob");
    await del(url);
    return;
  }
  if (url.startsWith("/uploads/")) {
    const rel = url.replace(/^\/uploads\//, "");
    const filePath = path.join(process.cwd(), "public", "uploads", rel);
    await fs.unlink(filePath).catch(() => undefined);
    // Spróbuj też usunąć thumb (best-effort; jeśli go nie ma — OK).
    await fs.unlink(`${filePath}.thumb.webp`).catch(() => undefined);
  }
}

function sanitizeFilename(name: string): string {
  const ext = path.extname(name).toLowerCase().slice(0, 16);
  const base = path.basename(name, path.extname(name));
  const cleanBase = base
    .normalize("NFKD")
    .replace(/[^\w\-.]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return `${cleanBase || "plik"}${ext}`;
}
