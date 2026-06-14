/**
 * GET /api/instrukcje/[id]/pdf
 *
 * PDF dla niezależnego ProductManual. Multi-tenant scope per firma użytkownika.
 * Treść + ustawienia bierzemy z ProductManual, nie z Product.
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

  const manual = await db.productManual.findFirst({
    where: { id, companyId },
    select: {
      id: true,
      name: true,
      manualJson: true,
      template: true,
      pageSize: true,
      kind: true,
      headerLang: true,
      headerTitle: true,
      headerRanges: true,
      footerCustom: true,
      fontFamily: true,
      bodyFontSize: true,
      h1FontSize: true,
      h2FontSize: true,
      h3FontSize: true,
      logoImageUrl: true,
      logoHeightPt: true,
      coverSubtitle: true,
      company: { select: { name: true, websiteUrl: true } },
      // Pierwszy przypisany produkt dostarcza nazwę produktu / SKU / EAN /
      // primary image dla cover page i headera. Jeśli brak — używamy nazwy
      // samej instrukcji jako product.name.
      productAssignments: {
        take: 1,
        orderBy: { createdAt: "asc" },
        select: {
          product: {
            select: {
              name: true,
              productCode: true,
              eanCode: true,
              code128: true,
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
  if (!manual) {
    return NextResponse.json(
      { error: "Instrukcja nie istnieje." },
      { status: 404 },
    );
  }

  const normalized = normalizeManualDocument(manual.manualJson);
  const pages = normalized
    ? normalized.pages.map((p) => ({
        id: p.id,
        // Lang per strona — używany w `manual-pdf.tsx` do nadpisania
        // header pill (wcześniej zależnego tylko od `headerRanges`).
        lang: p.lang ?? null,
        content: p.content as Parameters<
          typeof buildManualPdfDocument
        >[0]["pages"][number]["content"],
      }))
    : [];

  // Product context — z pierwszego przypisanego produktu (jeśli jest)
  const firstProduct = manual.productAssignments[0]?.product ?? null;
  const productContext = firstProduct
    ? {
        name: firstProduct.name,
        productCode: firstProduct.productCode,
        eanCode: firstProduct.eanCode,
        code128: firstProduct.code128,
        primaryImageUrl: firstProduct.images[0]?.url ?? null,
        companyName: manual.company?.name ?? null,
      }
    : {
        name: manual.name,
        productCode: "—",
        eanCode: null,
        code128: null,
        primaryImageUrl: null,
        companyName: manual.company?.name ?? null,
      };

  const element = (await buildManualPdfDocument({
    template: manual.template,
    pageSize: manual.pageSize,
    kind: manual.kind,
    headerLang: manual.headerLang,
    headerTitle: manual.headerTitle,
    headerRanges: parseHeaderRanges(manual.headerRanges),
    footerCustom: manual.footerCustom,
    fontFamily: manual.fontFamily,
    bodyFontSize: manual.bodyFontSize,
    h1FontSize: manual.h1FontSize,
    h2FontSize: manual.h2FontSize,
    h3FontSize: manual.h3FontSize,
    logoImageUrl: manual.logoImageUrl,
    logoHeightPt: manual.logoHeightPt,
    coverSubtitle: manual.coverSubtitle,
    companyWebsiteUrl: manual.company?.websiteUrl ?? null,
    pages,
    product: productContext,
    activeLanguages: normalized?.activeLanguages ?? null,
    alignmentContent: (() => {
      // Treść strony „Wyrównanie" z manualJson — opcjonalna, jeśli null/empty
      // PDF renderuje pustą stronę.
      if (!manual.manualJson || typeof manual.manualJson !== "object")
        return null;
      const obj = manual.manualJson as Record<string, unknown>;
      if (obj.alignmentContent && typeof obj.alignmentContent === "object") {
        return obj.alignmentContent as {
          type?: string;
          content?: Parameters<
            typeof buildManualPdfDocument
          >[0]["pages"][number]["content"]["content"];
        };
      }
      return null;
    })(),
  })) as ReactElement<DocumentProps>;

  const buffer = await renderToBuffer(element);

  const safeName = manual.name.replace(/[^A-Za-z0-9_-]/g, "_") || "instrukcja";

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safeName}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
