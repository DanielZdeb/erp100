/**
 * Pobiera wszystkie aktywne grafiki produktu (status=READY, !archived) i
 * zwraca jako ZIP. Server-side fetch — omija CORS dla obrazów hostowanych
 * na innych domenach (np. zdebu.pl). Pliki w ZIP: {SKU}-NNN.{ext}.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";
import JSZip from "jszip";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Brak autoryzacji" }, { status: 401 });
  }
  const { id } = await params;
  const companyId = await getCurrentCompanyId();

  const product = await db.product.findFirst({
    where: { id, companyId },
    select: {
      productCode: true,
      descriptionContentJson: true,
      images: {
        where: { archived: false, status: "READY" },
        orderBy: { sortOrder: "asc" },
        select: { url: true },
      },
    },
  });
  if (!product) {
    return NextResponse.json({ error: "Produkt nie istnieje" }, { status: 404 });
  }

  // Dodatkowe URL-e z descriptionContentJson — grafiki sekcji szablonu
  // sprzedazowego, ktore mogly nie trafic do galerii (silent failure
  // auto-add albo legacy przed backfillem). Dedup wzgledem gallery URL-i.
  const sectionUrls: string[] = [];
  const seen = new Set(product.images.map((i) => i.url));
  const dc = product.descriptionContentJson as
    | Record<string, { leftImageUrl?: string | null; rightImageUrl?: string | null }>
    | null;
  if (dc && typeof dc === "object") {
    for (const sec of Object.values(dc)) {
      for (const u of [sec?.leftImageUrl, sec?.rightImageUrl]) {
        if (u && typeof u === "string" && !seen.has(u)) {
          sectionUrls.push(u);
          seen.add(u);
        }
      }
    }
  }

  const allImages: { url: string }[] = [
    ...product.images,
    ...sectionUrls.map((u) => ({ url: u })),
  ];

  if (allImages.length === 0) {
    return NextResponse.json({ error: "Brak grafik" }, { status: 404 });
  }

  // Resolve URL — względne /uploads/X → absolutne (file system albo proxy)
  function resolveUrl(u: string): string {
    if (u.startsWith("http://") || u.startsWith("https://")) return u;
    const origin =
      process.env.NEXT_PUBLIC_APP_URL ??
      process.env.NEXTAUTH_URL ??
      "https://erp100.pl";
    return `${origin.replace(/\/$/, "")}${u.startsWith("/") ? "" : "/"}${u}`;
  }

  const zip = new JSZip();
  let ok = 0;
  const failures: { idx: number; url: string; reason: string }[] = [];

  // Helper: ext z URL fallback gdy brak content-type
  function extFromUrl(u: string, ct?: string): string {
    if (ct) {
      if (ct.includes("png")) return "png";
      if (ct.includes("webp")) return "webp";
      if (ct.includes("jpeg")) return "jpg";
    }
    const m = u.match(/\.([a-z0-9]{3,4})(?:\?|$)/i);
    return m ? m[1].toLowerCase() : "jpg";
  }

  // Sekwencyjnie — gentle na serwer i upstream hosty
  for (let idx = 0; idx < allImages.length; idx++) {
    const img = allImages[idx];
    const isLocal = img.url.startsWith("/uploads/");
    const num = String(idx + 1).padStart(3, "0");

    try {
      let buf: Uint8Array;
      let ext: string;

      if (isLocal) {
        // Czytamy z dysku — szybciej i bez HTTP layer (proxy/timeout).
        const fsPath = path.join(process.cwd(), "public", img.url);
        const data = await fs.readFile(fsPath);
        buf = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        ext = extFromUrl(img.url);
      } else {
        const targetUrl = resolveUrl(img.url);
        const res = await fetch(targetUrl, { redirect: "follow" });
        if (!res.ok) {
          failures.push({
            idx: idx + 1,
            url: targetUrl,
            reason: `HTTP ${res.status}`,
          });
          continue;
        }
        const ab = await res.arrayBuffer();
        buf = new Uint8Array(ab);
        ext = extFromUrl(img.url, res.headers.get("content-type") ?? "");
      }

      zip.file(`${product.productCode}-${num}.${ext}`, buf);
      ok++;
    } catch (e) {
      failures.push({
        idx: idx + 1,
        url: img.url,
        reason: e instanceof Error ? e.message : "unknown",
      });
      // eslint-disable-next-line no-console
      console.error(
        `[images-zip] FAIL #${idx + 1} url=${img.url} reason=${
          e instanceof Error ? e.message : "unknown"
        }`,
      );
    }
  }

  if (ok === 0) {
    return NextResponse.json(
      { error: "Wszystkie pobrania nie powiodły się", failures },
      { status: 502 },
    );
  }

  const zipBuf = await zip.generateAsync({ type: "uint8array" });
  // Header X-Download-Stats — klient może to wyświetlić w toaście
  const stats = JSON.stringify({ ok, total: allImages.length, failures: failures.length });
  return new NextResponse(zipBuf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${product.productCode}-grafiki.zip"`,
      "Content-Length": String(zipBuf.length),
      "X-Download-Stats": stats,
      "Cache-Control": "no-store",
    },
  });
}
