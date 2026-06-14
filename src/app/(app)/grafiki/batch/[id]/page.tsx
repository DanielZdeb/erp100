import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Wand2 } from "lucide-react";

import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";

import { BatchResultsGrid } from "./_components/batch-results-grid";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Czeka", cls: "bg-slate-100 text-slate-700" },
  RUNNING: { label: "Generuje…", cls: "bg-indigo-100 text-indigo-700" },
  COMPLETED: { label: "Gotowe", cls: "bg-emerald-100 text-emerald-700" },
  PARTIAL: { label: "Częściowo", cls: "bg-amber-100 text-amber-700" },
  FAILED: { label: "Błąd", cls: "bg-rose-100 text-rose-700" },
};

export default async function BatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const companyId = await getCurrentCompanyId();

  const batch = await db.productPhotoBatch.findFirst({
    where: { id, companyId },
    include: {
      template: { include: { shots: { orderBy: { sortOrder: "asc" } } } },
      images: true,
    },
  });
  if (!batch) notFound();

  // Pobierz produkty (z koszyka)
  const products = await db.product.findMany({
    where: { id: { in: batch.productIds } },
    select: {
      id: true,
      name: true,
      productCode: true,
      color: true,
      images: {
        where: { isPrimary: true },
        take: 1,
        select: { url: true },
      },
    },
  });
  const productById = new Map(products.map((p) => [p.id, p]));
  // Zachowaj kolejność z batch.productIds (snapshot przy tworzeniu)
  const orderedProducts = batch.productIds
    .map((pid) => productById.get(pid))
    .filter((p): p is NonNullable<typeof p> => p != null);

  const shots = batch.template.shots.filter((s) =>
    batch.shotIds.includes(s.id),
  );

  const st = STATUS_LABEL[batch.status] ?? STATUS_LABEL.PENDING;

  return (
    <div className="p-6 space-y-4">
      <Link
        href="/grafiki"
        className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1"
      >
        <ArrowLeft className="size-3" />
        Generator grafik
      </Link>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-heading font-bold tracking-tight inline-flex items-center gap-2">
            <Wand2 className="size-6 text-violet-600" />
            {batch.name}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Template:{" "}
            <Link
              href={`/grafiki/template/${batch.templateId}`}
              className="text-violet-700 hover:underline"
            >
              {batch.template.name}
            </Link>{" "}
            · Jakość: <strong>{batch.quality}</strong> · Format:{" "}
            <strong>{batch.template.aspectRatio}</strong>
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span
            className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded ${st.cls}`}
          >
            {st.label}
          </span>
          <span className="text-muted-foreground">
            {batch.generatedImages} / {batch.totalImages} obrazów
            {batch.failedImages > 0 && (
              <span className="text-rose-600 ml-1">
                ({batch.failedImages} błędów)
              </span>
            )}
            {batch.estimatedCostUsd != null && (
              <span className="ml-1">· ${batch.estimatedCostUsd.toFixed(2)}</span>
            )}
          </span>
        </div>
      </div>

      <BatchResultsGrid
        batchId={batch.id}
        batchStatus={batch.status}
        products={orderedProducts.map((p) => ({
          id: p.id,
          name: p.name,
          productCode: p.productCode,
          color: p.color,
          primaryImageUrl: p.images[0]?.url ?? null,
        }))}
        shots={shots.map((s) => ({
          id: s.id,
          name: s.name,
          iconName: s.iconName,
        }))}
        images={batch.images.map((img) => ({
          id: img.id,
          productId: img.productId,
          shotId: img.shotId,
          storageUrl: img.storageUrl,
          status: img.status,
          errorMessage: img.errorMessage,
          customOverride: img.customOverride,
          retryCount: img.retryCount,
        }))}
      />
    </div>
  );
}
