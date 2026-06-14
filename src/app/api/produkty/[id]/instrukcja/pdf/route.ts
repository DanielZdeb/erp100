/**
 * GET /api/produkty/[id]/instrukcja/pdf
 *
 * Generuje PDF instrukcji obsługi produktu z `productManualJson` + szablon
 * `manualTemplate`. Cover page dla BRANDED zawiera zdjęcie produktu.
 *
 * Tenant safety: wymaga sesji + sprawdza że produkt należy do firmy usera.
 */
import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import type { DocumentProps } from "@react-pdf/renderer";
import type { ReactElement } from "react";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";
import { buildManualPdfDocument } from "@/lib/manual-pdf";
import {
  normalizeManualDocument,
  parseHeaderRanges,
} from "@/lib/manual-document";

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
      id: true,
      name: true,
      productCode: true,
      eanCode: true,
      code128: true,
      productManualJson: true,
      manualTemplate: true,
      manualPageSize: true,
      manualHeaderLang: true,
      manualHeaderTitle: true,
      manualHeaderRanges: true,
      manualFooterCustom: true,
      images: {
        where: { isPrimary: true },
        take: 1,
        select: { url: true },
      },
      company: { select: { name: true } },
    },
  });
  if (!product) {
    return NextResponse.json(
      { error: "Produkt nie istnieje." },
      { status: 404 },
    );
  }

  // Znormalizuj productManualJson do nowej struktury wieloprzejazdowej.
  // Stary format (jeden `doc`) jest wrappowany w `pages: [{ content: doc }]`.
  const normalized = normalizeManualDocument(product.productManualJson);
  const pages = normalized
    ? normalized.pages.map((p) => ({
        id: p.id,
        content: p.content as Parameters<
          typeof buildManualPdfDocument
        >[0]["pages"][number]["content"],
      }))
    : [];

  const element = (await buildManualPdfDocument({
    template: product.manualTemplate,
    pageSize: product.manualPageSize,
    headerLang: product.manualHeaderLang,
    headerTitle: product.manualHeaderTitle,
    headerRanges: parseHeaderRanges(product.manualHeaderRanges),
    footerCustom: product.manualFooterCustom,
    pages,
    product: {
      name: product.name,
      productCode: product.productCode,
      eanCode: product.eanCode,
      code128: product.code128,
      primaryImageUrl: product.images[0]?.url ?? null,
      companyName: product.company?.name ?? null,
    },
  })) as ReactElement<DocumentProps>;

  const buffer = await renderToBuffer(element);

  const safeName =
    product.productCode.replace(/[^A-Za-z0-9_-]/g, "_") || "instrukcja";

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="instrukcja-${safeName}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
