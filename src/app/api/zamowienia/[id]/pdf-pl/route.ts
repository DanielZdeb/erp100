/**
 * PDF generator dla zamówień PL — kolorowy wydruk z:
 *  • Nagłówek (numer zamówienia, data, firma)
 *  • Lista pozycji z miniaturą, SKU, ilością + barcode CODE128
 *  • Per kolor: wizualizacja belek (cięcia) i statystyki
 *
 * Endpoint zwraca application/pdf; user otwiera w nowej karcie lub
 * pobiera Save As.
 */

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { renderToBuffer } from "@react-pdf/renderer";
import { ensureFontsRegistered, OrderPlPdf } from "@/lib/zamowienie-pl-pdf";
import {
  analyzeBolts,
  parseMaterialSku,
  type MaterialItem,
} from "@/lib/material-bolts";
import path from "node:path";
import { promises as fs } from "node:fs";
import bwipjs from "bwip-js/node";
import type { BarcodeVector, BarcodePath } from "@/lib/zamowienie-pl-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Parsuje SVG z bwip-js (`toSVG`) na listę path'ów + viewBox, do renderowania
 *  wektorowo w react-pdf (Svg/Path). Każdy path zachowuje fill/stroke/width
 *  z oryginału. Pozwala na nieskończony zoom bez utraty jakości. */
function parseBwipSvg(svg: string, _label: string): BarcodeVector | null {
  const viewBoxMatch = svg.match(/viewBox="([\d.\s-]+)"/);
  if (!viewBoxMatch) return null;
  const [vx, vy, vw, vh] = viewBoxMatch[1].split(/\s+/).map(Number);

  const paths: BarcodePath[] = [];
  // Każdy <path ... d="..." /> — wyciągamy d, fill, stroke, stroke-width.
  const re = /<path\s+([^>]+?)\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg))) {
    const attrs = m[1];
    const d = /\bd="([^"]+)"/.exec(attrs)?.[1];
    if (!d) continue;
    const fill = /\bfill="([^"]+)"/.exec(attrs)?.[1] ?? "none";
    const stroke = /\bstroke="([^"]+)"/.exec(attrs)?.[1];
    const strokeWidth = /\bstroke-width="([\d.]+)"/.exec(attrs)?.[1];
    paths.push({
      d,
      fill,
      stroke: stroke ?? undefined,
      strokeWidth: strokeWidth ? Number(strokeWidth) : undefined,
    });
  }
  if (paths.length === 0) return null;
  return {
    viewBox: { x: vx, y: vy, width: vw, height: vh },
    paths,
  };
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  // Tryb generowania: ?tryb=fabryka — wersja dla fabryki (bez rozkładu
  // cięcia, tylko zbiorcza ilość belek per kolor). Default krajalnia.
  const url = new URL(req.url);
  const mode: "krajalnia" | "fabryka" =
    url.searchParams.get("tryb") === "fabryka" ? "fabryka" : "krajalnia";

  const { id } = await ctx.params;
  const order = await db.importOrder.findFirst({
    where: { id },
    select: {
      id: true,
      orderNumber: true,
      name: true,
      pdfDescription: true,
      notes: true,
      createdAt: true,
      country: true,
      vatRate: true,
      companyId: true,
      company: {
        select: {
          name: true,
          street: true,
          postalCode: true,
          city: true,
          nip: true,
          krs: true,
          representativeName: true,
          deliveryAddress: true,
          logoColorUrl: true,
        },
      },
      items: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          quantity: true,
          unitPricePln: true,
          product: {
            select: {
              productCode: true,
              name: true,
              eanCode: true,
              defaultUnitPricePln: true,
              defaultPricePerMeterPln: true,
              lengthM: true,
              images: {
                where: { isPrimary: true },
                take: 1,
                select: { url: true },
              },
            },
          },
        },
      },
    },
  });
  if (!order) return new Response("Not found", { status: 404 });

  // Załaduj miniaturę produktu jako data URI (PdfImage potrzebuje DataURI
  // albo absolutnego URL — local file path nie zawsze działa w prod buildzie).
  const projectRoot = process.cwd();
  async function loadImage(url: string | undefined): Promise<string | null> {
    if (!url || !url.startsWith("/uploads/")) return null;
    const filePath = path.join(projectRoot, "public", url);
    try {
      const buffer = await fs.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase().substring(1);
      const mime =
        ext === "png"
          ? "image/png"
          : ext === "jpg" || ext === "jpeg"
            ? "image/jpeg"
            : ext === "webp"
              ? "image/webp"
              : "image/png";
      return `data:${mime};base64,${buffer.toString("base64")}`;
    } catch {
      return null;
    }
  }

  /** Generuje EAN13 barcode jako WEKTOR — parsowany do listy prostokątów
   *  + cyfry pod kodem. Wektor = nieskończony zoom bez utraty jakości. */
  function makeEanBarcodeVector(
    ean: string | null,
  ): BarcodeVector | null {
    if (!ean) return null;
    const cleaned = ean.replace(/\s+/g, "");
    if (!/^\d{13}$/.test(cleaned)) return null;
    try {
      const svg = bwipjs.toSVG({
        bcid: "ean13",
        text: cleaned,
        scale: 2,
        height: 10,
        includetext: true,
        textsize: 7,
        backgroundcolor: "FFFFFF",
      });
      return parseBwipSvg(svg, cleaned);
    } catch {
      return null;
    }
  }

  // Sekcje pobierane LIVE z szablonu firmy (per kind + target) — każda
  // edycja szablonu od razu wpływa na PDF. Nie używamy ImportOrderPdfSection
  // (legacy clone-based model) — tylko OrderTemplateSection.
  const templateSections = order.companyId
    ? await db.orderTemplateSection.findMany({
        where: {
          companyId: order.companyId,
          kind: "MATERIAL_SZARFY",
          target: mode === "fabryka" ? "FABRYKA" : "KRAJALNIA",
        },
        orderBy: { sortOrder: "asc" },
        include: { images: { orderBy: { sortOrder: "asc" } } },
      })
    : [];

  // Pre-load grafik sekcji jako base64 data URIs (PdfImage wymaga URI).
  const sectionsForPdf = await Promise.all(
    templateSections.map(async (s) => ({
      title: s.title,
      content: s.content ?? null,
      images: (
        await Promise.all(
          s.images.map(async (img) => {
            const dataUri = await loadImage(img.url);
            return dataUri
              ? { dataUri, alt: img.alt ?? null }
              : null;
          }),
        )
      ).filter((x): x is { dataUri: string; alt: string | null } => !!x),
    })),
  );

  const itemsForPdf = await Promise.all(
    order.items.map(async (it) => ({
      sku: it.product.productCode,
      name: it.product.name,
      ean: it.product.eanCode ?? null,
      quantity: it.quantity,
      unitPricePln: it.unitPricePln ?? it.product.defaultUnitPricePln ?? 0,
      pricePerMeterPln: it.product.defaultPricePerMeterPln ?? null,
      lengthM: it.product.lengthM ?? null,
      imageFsPath: await loadImage(it.product.images[0]?.url),
      barcodeVector: makeEanBarcodeVector(it.product.eanCode ?? null),
    })),
  );

  // Wylicz analizę belek z pozycji materiałowych.
  const materialItems: MaterialItem[] = [];
  for (const it of order.items) {
    const parsed = parseMaterialSku(it.product.productCode);
    if (!parsed) continue;
    materialItems.push({
      itemId: it.id,
      sku: it.product.productCode,
      name: it.product.name,
      lengthM: parsed.lengthM,
      color: parsed.color,
      quantity: it.quantity,
    });
  }
  const boltsAnalysis = analyzeBolts(materialItems);

  await ensureFontsRegistered();

  const pdfBuffer = await renderToBuffer(
    OrderPlPdf({
      mode,
      orderNumber: order.orderNumber,
      orderName: order.name ?? null,
      createdAt: order.createdAt,
      companyName: order.company?.name ?? "",
      companyLogoDataUri: await loadImage(
        order.company?.logoColorUrl ?? undefined,
      ),
      buyer: {
        name: order.company?.name ?? "",
        street: order.company?.street ?? null,
        postalCode: order.company?.postalCode ?? null,
        city: order.company?.city ?? null,
        nip: order.company?.nip ?? null,
        krs: order.company?.krs ?? null,
        representativeName: order.company?.representativeName ?? null,
        deliveryAddress: order.company?.deliveryAddress ?? null,
      },
      pdfDescription: order.pdfDescription ?? null,
      sections: sectionsForPdf,
      items: itemsForPdf,
      bolts: boltsAnalysis,
    }),
  );

  const filenameSuffix = mode === "fabryka" ? "-fabryka" : "-krajalnia";
  return new Response(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="zamowienie-${order.orderNumber}${filenameSuffix}.pdf"`,
    },
  });
}
