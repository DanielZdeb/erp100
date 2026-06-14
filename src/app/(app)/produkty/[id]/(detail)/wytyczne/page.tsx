import { notFound } from "next/navigation";

import { db } from "@/lib/db";

import { getProductFull } from "../../_lib/fetchers";
import { GuidelineSectionCard } from "../../_components/guideline-section-card";
import type {
  GuidelineKindT,
  GuidelinePoint,
} from "../../_components/guideline-section";
import { GuidelineFilesPanel } from "./_components/guideline-files-panel";

export const dynamic = "force-dynamic";

/**
 * Strona „Wytyczne produkcyjne" zawiera 3 sekcje (każda = osobna karta z
 * intro, punktami i grafikami) + panel załączników PDF na dole:
 *  - PRODUCTION   → „Wytyczne produkcyjne" (lewa kolumna, amber)
 *  - IMPORT       → „Skład produktu"        (prawa kolumna, blue)
 *  - USER_MANUAL  → „Zabezpieczenie paczek" (lewa kolumna 2 rząd, violet)
 *  - załączniki   → PDF/dokumenty z `ProductFile kind=GUIDELINES`
 *
 * Sekcje IMPORT i USER_MANUAL są semantycznie przemianowane — pierwotnie
 * były „wytyczne importowe" i „instrukcja obsługi", ale instrukcję
 * przeniesiono do osobnej zakładki, więc tu reużywamy te kindy do innych celów.
 */
export default async function WytycznePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [product, guidelinePoints, guidelineImages] = await Promise.all([
    getProductFull(id),
    db.productGuidelinePoint.findMany({
      where: { productId: id },
      orderBy: [{ kind: "asc" }, { sortOrder: "asc" }],
      include: {
        images: {
          orderBy: { sortOrder: "asc" },
          select: { id: true, url: true, alt: true },
        },
      },
    }),
    db.productGuidelineImage.findMany({
      where: { productId: id, pointId: null },
      orderBy: { sortOrder: "asc" },
      select: { id: true, url: true, alt: true, kind: true },
    }),
  ]);
  if (!product) notFound();

  const pointsByKind = new Map<GuidelineKindT, GuidelinePoint[]>();
  for (const p of guidelinePoints) {
    const arr = pointsByKind.get(p.kind as GuidelineKindT) ?? [];
    arr.push({
      id: p.id,
      text: p.text,
      sortOrder: p.sortOrder,
      images: p.images,
    });
    pointsByKind.set(p.kind as GuidelineKindT, arr);
  }
  const imagesByKind = new Map<
    GuidelineKindT,
    { id: string; url: string; alt: string | null }[]
  >();
  for (const img of guidelineImages) {
    const arr = imagesByKind.get(img.kind as GuidelineKindT) ?? [];
    arr.push({ id: img.id, url: img.url, alt: img.alt });
    imagesByKind.set(img.kind as GuidelineKindT, arr);
  }

  const guidelineFiles = product.files
    .filter((f) => f.kind === "GUIDELINES")
    .map((f) => ({
      id: f.id,
      url: f.url,
      filename: f.filename,
      contentType: f.contentType,
      sizeBytes: f.sizeBytes,
      createdAt: f.createdAt,
    }));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-heading font-semibold">
          Wytyczne produkcyjne
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Wszystko co dotyczy produkcji i wysyłki: wytyczne dla fabryki, skład
          produktu, zabezpieczenie paczek oraz załączniki PDF. Każda sekcja ma
          własne intro, punkty (drag&drop) i grafiki.
        </p>
      </div>

      {/* 2-kolumnowy grid — sekcje obok siebie. Stack na mobile. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <GuidelineSectionCard
          productId={product.id}
          kind={"PRODUCTION" as GuidelineKindT}
          title="Wytyczne produkcyjne"
          description="Dla fabryki / producenta — materiały, wykończenie, jakość, znakowanie, kontrola jakości."
          color="amber"
          icon="ScrollText"
          introField="productionGuidelines"
          introValue={product.productionGuidelines}
          points={pointsByKind.get("PRODUCTION") ?? []}
          sectionImages={imagesByKind.get("PRODUCTION") ?? []}
        />

        <GuidelineSectionCard
          productId={product.id}
          kind={"IMPORT" as GuidelineKindT}
          title="Skład produktu"
          description="Z czego się składa produkt — elementy, części, akcesoria. Dodaj punkty z opisem i zdjęciami każdego komponentu."
          color="blue"
          icon="Component"
          introField="importGuidelines"
          introValue={product.importGuidelines}
          points={pointsByKind.get("IMPORT") ?? []}
          sectionImages={imagesByKind.get("IMPORT") ?? []}
        />

        <GuidelineSectionCard
          productId={product.id}
          kind={"USER_MANUAL" as GuidelineKindT}
          title="Zabezpieczenie paczek"
          description="Jak zabezpieczyć paczkę przed wysyłką — folia bąbelkowa, narożniki, etykiety FRAGILE, taśmy, wypełniacze."
          color="violet"
          icon="ShieldCheck"
          introField="userManual"
          introValue={product.userManual}
          points={pointsByKind.get("USER_MANUAL") ?? []}
          sectionImages={imagesByKind.get("USER_MANUAL") ?? []}
        />

        <GuidelineFilesPanel productId={product.id} files={guidelineFiles} />
      </div>
    </div>
  );
}
