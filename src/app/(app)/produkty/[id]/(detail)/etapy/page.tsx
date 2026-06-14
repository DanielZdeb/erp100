import { notFound } from "next/navigation";

import type { ProductStageT } from "@/lib/product-stages";

import { getProductFull } from "../../_lib/fetchers";
import { StagesStepper } from "../../stages-stepper";
import { StagesTab } from "../../stages-tab";

export const dynamic = "force-dynamic";

const emptyByStage = <T,>(): Record<ProductStageT, T[]> => ({
  PRODUKCJA: [],
  IMPORT: [],
  DOKUMENTACJA: [],
  WYSYLKA: [],
  OPIS: [],
  GRAFIKI: [],
});

export default async function EtapyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await getProductFull(id);
  if (!product) notFound();

  const completedStages = new Set<ProductStageT>(
    product.stageCompletions.map((s) => s.stage as ProductStageT),
  );

  const checklistByStage =
    emptyByStage<(typeof product.stageChecklistItems)[number]>();
  for (const c of product.stageChecklistItems) {
    checklistByStage[c.stage as ProductStageT].push(c);
  }

  const stageImagesByStage = emptyByStage<(typeof product.images)[number]>();
  const generalImages: typeof product.images = [];
  for (const img of product.images) {
    if (img.stage) {
      stageImagesByStage[img.stage as ProductStageT].push(img);
    } else {
      generalImages.push(img);
    }
  }

  const stageFilesByStage = emptyByStage<(typeof product.files)[number]>();
  const generalFiles: typeof product.files = [];
  for (const f of product.files) {
    if (f.stage) {
      stageFilesByStage[f.stage as ProductStageT].push(f);
    } else {
      generalFiles.push(f);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-heading font-semibold">
        Etapy wdrożenia produktu
      </h2>
      <StagesStepper completedStages={completedStages} />
      <StagesTab
        productId={product.id}
        stages={product.stageCompletions.map((s) => ({
          stage: s.stage as ProductStageT,
          completedAt: s.completedAt,
          notes: s.notes,
        }))}
        product={{
          productionGuidelines: product.productionGuidelines,
          importGuidelines: product.importGuidelines,
          userManual: product.userManual,
          shopDescription: product.shopDescription,
          eanCode: product.eanCode,
          color: product.color,
          shippingBoxWidthCm: product.shippingBoxWidthCm,
          shippingBoxHeightCm: product.shippingBoxHeightCm,
          shippingBoxDepthCm: product.shippingBoxDepthCm,
          imagesCount: generalImages.length,
          filesCount: generalFiles.length,
        }}
        checklist={
          Object.fromEntries(
            Object.entries(checklistByStage).map(([k, items]) => [
              k,
              items.map((i) => ({
                id: i.id,
                title: i.title,
                done: i.done,
                sortOrder: i.sortOrder,
              })),
            ]),
          ) as Record<
            ProductStageT,
            { id: string; title: string; done: boolean; sortOrder: number }[]
          >
        }
        stageImages={
          Object.fromEntries(
            Object.entries(stageImagesByStage).map(([k, images]) => [
              k,
              images.map((i) => ({ id: i.id, url: i.url, alt: i.alt })),
            ]),
          ) as Record<
            ProductStageT,
            { id: string; url: string; alt: string | null }[]
          >
        }
        stageFiles={
          Object.fromEntries(
            Object.entries(stageFilesByStage).map(([k, files]) => [
              k,
              files.map((f) => ({
                id: f.id,
                url: f.url,
                filename: f.filename,
                sizeBytes: f.sizeBytes,
                contentType: f.contentType,
              })),
            ]),
          ) as Record<
            ProductStageT,
            {
              id: string;
              url: string;
              filename: string;
              sizeBytes: number | null;
              contentType: string | null;
            }[]
          >
        }
      />
    </div>
  );
}
