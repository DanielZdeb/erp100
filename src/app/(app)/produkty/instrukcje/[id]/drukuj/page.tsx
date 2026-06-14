/**
 * Print view instrukcji — render HTML w pełnym rozmiarze strony (A4/A5/A6 mm).
 *
 * Cel: PDF generowany przez przeglądarkę (Ctrl+P → Zapisz jako PDF) wygląda
 * PIXEL-PERFECT jak edytor — bo używa tego samego silnika renderowania (Chrome).
 *
 * Struktura:
 *  - Strona 1: cover (logo wycentrowany + podtytuł)
 *  - Strona 2: spis treści (auto z header rangów)
 *  - Strona 3+: body pages z TipTap JSON renderowanym jako HTML
 *
 * CSS: `@page` rule ustawia rozmiar papieru, `.page` ma dokładne wymiary mm,
 * `page-break-after: always` zapewnia że każda strona to osobny arkusz w PDF.
 */
import { notFound } from "next/navigation";

import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";
import {
  computeTotalPhysicalPages,
  generateToc,
  normalizeManualDocument,
  parseHeaderRanges,
  resolveHeaderForPage,
} from "@/lib/manual-document";

import { PrintManual } from "./print-manual";

export const dynamic = "force-dynamic";

export default async function DrukujInstrukcjaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const companyId = await getCurrentCompanyId();

  const manual = await db.productManual.findFirst({
    where: { id, companyId },
    select: {
      id: true,
      name: true,
      manualJson: true,
      pageSize: true,
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
      kind: true,
      company: { select: { name: true } },
    },
  });
  if (!manual) notFound();

  // Prisma 7 Json fields → plain object przez JSON clone
  const cleanManualJson =
    manual.manualJson != null
      ? (JSON.parse(JSON.stringify(manual.manualJson)) as object)
      : null;
  const normalized = normalizeManualDocument(cleanManualJson);
  const bodyPages = normalized?.pages ?? [];
  const headerRanges = parseHeaderRanges(manual.headerRanges);

  // Liczymy poprawnie z extras (wyrównanie + ostatnia per sekcja językowa) —
  // bez tego strona wyrównania (mająca własny header range) wypadała z TOC.
  const totalPhysicalPages = computeTotalPhysicalPages(
    bodyPages,
    normalized?.activeLanguages,
    manual.kind,
  );
  const tocEntries =
    manual.pageSize === "A6" ? [] : generateToc(headerRanges, totalPhysicalPages);

  // Per body page — resolved header (lang + title)
  const bodyHeaders = bodyPages.map((_, idx) => {
    const physicalPage = idx + 3;
    const matched =
      headerRanges.length > 0
        ? resolveHeaderForPage(physicalPage, headerRanges)
        : null;
    return {
      lang: matched?.lang ?? (headerRanges.length === 0 ? manual.headerLang : null),
      title: matched?.title ?? (headerRanges.length === 0 ? manual.headerTitle : null),
    };
  });

  return (
    <PrintManual
      manualName={manual.name}
      pageSize={manual.pageSize}
      fontFamily={manual.fontFamily ?? "Roboto"}
      bodyFontSize={manual.bodyFontSize ?? 11}
      h1FontSize={manual.h1FontSize ?? 22}
      h2FontSize={manual.h2FontSize ?? 16}
      h3FontSize={manual.h3FontSize ?? 13}
      logoImageUrl={manual.logoImageUrl}
      logoHeightPt={manual.logoHeightPt ?? 60}
      coverSubtitle={manual.coverSubtitle ?? ""}
      footerCustom={manual.footerCustom ?? ""}
      companyName={manual.company?.name ?? ""}
      tocEntries={tocEntries}
      bodyPages={bodyPages.map((p, idx) => ({
        id: p.id,
        content: p.content,
        header: bodyHeaders[idx],
      }))}
    />
  );
}
