/**
 * Storage abstraction — lokalnie zapisuje pliki do `public/uploads/`,
 * w produkcji (gdy BLOB_READ_WRITE_TOKEN ustawione) używa Vercel Blob.
 *
 * Frontend powinien używać tylko URL-i zwracanych przez `uploadFile`.
 * URL może być względny ("/uploads/...") albo absolutny (Vercel Blob).
 */

import { promises as fs } from "node:fs";
import path from "node:path";

export interface UploadResult {
  url: string;
  filename: string;
  contentType: string | null;
  sizeBytes: number;
}

const useVercelBlob = !!process.env.BLOB_READ_WRITE_TOKEN;

export async function uploadFile(
  file: File,
  options: { folder: string },
): Promise<UploadResult> {
  const safeName = sanitizeFilename(file.name);
  const stamped = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
  const key = `${options.folder}/${stamped}`;

  if (useVercelBlob) {
    const { put } = await import("@vercel/blob");
    const blob = await put(key, file, { access: "public" });
    return {
      url: blob.url,
      filename: file.name,
      contentType: file.type || null,
      sizeBytes: file.size,
    };
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const dir = path.join(process.cwd(), "public", "uploads", options.folder);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, stamped), buf);
  return {
    url: `/uploads/${key}`,
    filename: file.name,
    contentType: file.type || null,
    sizeBytes: file.size,
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
