/**
 * Dynamic file server dla `/uploads/*` — czyta plik z dysku i zwraca z
 * właściwym Content-Type.
 *
 * Dlaczego osobny handler zamiast natywnego Next.js static serving z `public/`:
 *  - Next.js prerenderuje pulę statycznych ścieżek przy buildzie. Pliki dodane
 *    runtime (volume mount, upload, batch generation) NIE są w tej puli i
 *    zwracają 404 z cache prerender, dopóki kontener nie zostanie zrestartowany.
 *  - Ten handler obchodzi prerenderowanie — czyta plik z FS przy każdym żądaniu,
 *    z cache HTTP po stronie klienta przez nagłówek Cache-Control.
 *
 * Bezpieczeństwo:
 *  - Path traversal: odrzucamy „..", absolutne i kontrolowane znaki.
 *  - Whitelist: tylko podkatalogi `public/uploads/`.
 */
import { NextRequest } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
};

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await ctx.params;
  if (!segments || segments.length === 0) {
    return new Response("Not found", { status: 404 });
  }

  // Path traversal — odrzucamy `..`, znaki kontrolne, ścieżki absolutne.
  for (const s of segments) {
    if (
      !s ||
      s === ".." ||
      s.includes("\0") ||
      s.startsWith("/") ||
      s.startsWith("\\")
    ) {
      return new Response("Bad request", { status: 400 });
    }
  }

  const rel = segments.join("/");
  const filePath = path.join(process.cwd(), "public", "uploads", rel);

  // Dodatkowa walidacja: rozwiązana ścieżka MUSI być wewnątrz public/uploads.
  const uploadsRoot = path.join(process.cwd(), "public", "uploads");
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(uploadsRoot))) {
    return new Response("Forbidden", { status: 403 });
  }

  let stat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stat = await fs.stat(filePath);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  if (!stat.isFile()) {
    return new Response("Not found", { status: 404 });
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext] ?? "application/octet-stream";

  // ETag z mtime + size — pozwala klientowi cache'ować i revalidate.
  const etag = `"${stat.mtimeMs.toString(36)}-${stat.size.toString(36)}"`;

  const ifNoneMatch = _req.headers.get("if-none-match");
  if (ifNoneMatch === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }

  const data = await fs.readFile(filePath);
  // Body type: Uint8Array (Node Buffer extends Uint8Array) — fits Response BodyInit.
  return new Response(new Uint8Array(data), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(stat.size),
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: etag,
    },
  });
}
