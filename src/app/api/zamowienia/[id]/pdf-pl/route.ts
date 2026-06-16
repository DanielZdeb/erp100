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
import sharp from "sharp";
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
          deliveryAddressFabryka: true,
          deliveryAddressSzwalnia: true,
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
              colorCode: true,
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
  async function loadImage(
    url: string | undefined,
    opts: { large?: boolean; flattenBg?: string } = {},
  ): Promise<string | null> {
    if (!url || !url.startsWith("/uploads/")) return null;
    const filePath = path.join(projectRoot, "public", url);
    try {
      const buffer = await fs.readFile(filePath);
      // @react-pdf/renderer (libpng) wywala się na 16-bit / interlaced /
      // progressive PNG-ach ("Incomplete or corrupt PNG file") i nie wspiera
      // WebP. Przepuszczamy więc WSZYSTKO przez sharp.
      //
      // Rozmiar:
      //   - large (grafiki sekcji w PDF, np. zdjęcia kroków produkcji): 1400 px
      //     i q=88 — w pełnej szerokości A4 to ~150 DPI, ostry detal
      //   - default (miniatury produktów, logo itp.): 400 px, q=80, ~30 KB
      // flattenBg: gdy PNG ma transparency a JPEG nie wspiera alpha — sharp
      // bez flatten zmienia transparent na CZARNY. Dla loga ustawiamy biały.
      const maxSize = opts.large ? 1400 : 400;
      const quality = opts.large ? 88 : 80;
      let pipeline = sharp(buffer, { failOn: "none" });
      if (opts.flattenBg) {
        pipeline = pipeline.flatten({ background: opts.flattenBg });
      }
      const jpgBuffer = await pipeline
        .resize(maxSize, maxSize, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality })
        .toBuffer();
      return `data:image/jpeg;base64,${jpgBuffer.toString("base64")}`;
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
            // Grafiki sekcji renderowane sa na pelnej szerokosci A4 — wymagaja
            // wyzszej rozdzielczosci niz default 400 px (rozmazuja sie).
            const dataUri = await loadImage(img.url, { large: true });
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

  // Mapa color (SKU suffix, np. „BLACK") → kod fabryczny koloru z Product
  // (np. „RAL 6018"). Pierwszy znaleziony wpis wygrywa — wszystkie produkty
  // tego samego koloru powinny mieć identyczny colorCode i tak, ale gdyby
  // ktoś wpisał różne, bierzemy ten z pierwszej pozycji w order.items.
  const colorCodes: Record<string, string> = {};
  for (const it of order.items) {
    const parsed = parseMaterialSku(it.product.productCode);
    if (!parsed) continue;
    if (colorCodes[parsed.color]) continue;
    if (it.product.colorCode && it.product.colorCode.trim() !== "") {
      colorCodes[parsed.color] = it.product.colorCode.trim();
    }
  }

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
        // Logo to zwykle PNG/SVG z transparency. JPEG nie wspiera alpha —
        // bez flatten transparentne piksele staja sie CZARNE w PDF.
        { flattenBg: "#ffffff" },
      ),
      buyer: {
        name: order.company?.name ?? "",
        street: order.company?.street ?? null,
        postalCode: order.company?.postalCode ?? null,
        city: order.company?.city ?? null,
        nip: order.company?.nip ?? null,
        krs: order.company?.krs ?? null,
        representativeName: order.company?.representativeName ?? null,
        // Wybor adresu dostawy wg trybu PDF:
        //   mode='fabryka'    -> deliveryAddressFabryka
        //   mode='krajalnia'  -> deliveryAddressSzwalnia (szwalnia/krajalnia)
        // Z fallback do legacy deliveryAddress gdy specyficzny pusty.
        deliveryAddress:
          (mode === "fabryka"
            ? order.company?.deliveryAddressFabryka
            : order.company?.deliveryAddressSzwalnia) ||
          order.company?.deliveryAddress ||
          null,
      },
      pdfDescription: order.pdfDescription ?? null,
      sections: sectionsForPdf,
      items: itemsForPdf,
      bolts: boltsAnalysis,
      colorCodes,
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
