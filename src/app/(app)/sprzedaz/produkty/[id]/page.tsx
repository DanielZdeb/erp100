/**
 * Karta sprzedażowa produktu.
 *
 *  - Header: zdjęcie + nazwa + SKU + EAN + kategoria + waga + kolor + kod
 *  - Galeria grafik (jeśli są)
 *  - Wybór szablonu opisu (dropdown)
 *  - Po wybraniu szablonu — wypełnianie poszczególnych sekcji (slot left/right)
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Package } from "lucide-react";

import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";
import { Card } from "@/components/ui/card";
import { SalesCardEditor } from "./_components/sales-card-editor";
import { ProductGalleryClickable } from "./_components/product-gallery-clickable";

export const dynamic = "force-dynamic";

export default async function SprzedazProduktDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const companyId = await getCurrentCompanyId();
  const product = await db.product.findFirst({
    where: { id, companyId },
    select: {
      id: true,
      name: true,
      productCode: true,
      eanCode: true,
      color: true,
      colorCode: true,
      weightKg: true,
      compositionMode: true,
      descriptionTemplateId: true,
      descriptionContentJson: true,
      category: { select: { name: true } },
      images: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          url: true,
          alt: true,
          thumbnailWebpUrl: true,
          isPrimary: true,
        },
      },
    },
  });
  if (!product) notFound();

  const templates = await db.descriptionTemplate.findMany({
    where: { companyId, archived: false },
    orderBy: { name: "asc" },
    include: {
      sections: { orderBy: { sortOrder: "asc" } },
    },
  });
  const selectedTemplate =
    templates.find((t) => t.id === product.descriptionTemplateId) ?? null;

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-center gap-2 text-xs">
        <Link
          href="/sprzedaz/produkty"
          className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="size-3.5" />
          Wszystkie produkty
        </Link>
      </div>

      {/* Header z grafiką + danymi */}
      <Card className="p-5">
        <div className="flex gap-5 flex-wrap">
          <div className="size-32 shrink-0 rounded-lg ring-1 ring-slate-200 overflow-hidden bg-slate-50 grid place-items-center">
            {product.images[0]?.thumbnailWebpUrl ?? product.images[0]?.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={
                  product.images[0]?.thumbnailWebpUrl ?? product.images[0]?.url
                }
                alt={product.name}
                className="size-full object-cover"
              />
            ) : (
              <Package className="size-10 text-slate-300" />
            )}
          </div>
          <div className="flex-1 min-w-[280px] space-y-2">
            <div className="text-[11px] uppercase tracking-wide font-bold text-emerald-700">
              Sprzedaż → Karta produktu
            </div>
            <h1 className="text-2xl font-bold tracking-tight leading-tight">
              {product.name}
            </h1>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-xs">
              <KV label="SKU" value={product.productCode} mono />
              <KV label="EAN" value={product.eanCode ?? "—"} mono />
              <KV label="Kategoria" value={product.category?.name ?? "—"} />
              <KV
                label="Waga"
                value={
                  product.weightKg != null
                    ? `${product.weightKg.toFixed(2)} kg`
                    : "—"
                }
              />
              <KV label="Kolor" value={product.color ?? "—"} />
              <KV label="Kod koloru" value={product.colorCode ?? "—"} mono />
              <KV
                label="Typ"
                value={
                  product.compositionMode === "ZESTAW"
                    ? "Zestaw"
                    : product.compositionMode === "KOMPONENTOWY"
                      ? "Komponentowy"
                      : "Całościowy"
                }
              />
              <KV label="Grafik" value={String(product.images.length)} />
            </div>
          </div>
        </div>
      </Card>

      {/* Galeria miniatur — klikalne, edycja AI promptem przez Nano Banana Pro */}
      {product.images.length > 0 && (
        <Card className="p-4 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
            Grafiki produktowe ({product.images.length})
            <span className="ml-2 text-[10px] font-normal normal-case text-slate-500">
              · klik aby edytować przez AI
            </span>
          </h2>
          <ProductGalleryClickable
            images={product.images.map((img) => ({
              id: img.id,
              url: img.url,
              alt: img.alt,
              thumbnailWebpUrl: img.thumbnailWebpUrl,
            }))}
          />
        </Card>
      )}

      {/* Edytor szablonu + zawartości */}
      <SalesCardEditor
        productId={product.id}
        initialTemplateId={product.descriptionTemplateId}
        initialContent={
          (product.descriptionContentJson as Record<
            string,
            {
              leftText?: string | null;
              rightText?: string | null;
              leftImageUrl?: string | null;
              rightImageUrl?: string | null;
            }
          > | null) ?? {}
        }
        templates={templates.map((t) => ({
          id: t.id,
          name: t.name,
          sections: t.sections.map((s) => ({
            id: s.id,
            name: s.name,
            layout: s.layout,
            leftHint: s.leftHint,
            rightHint: s.rightHint,
          })),
        }))}
        selectedTemplateSections={
          selectedTemplate?.sections.map((s) => ({
            id: s.id,
            name: s.name,
            layout: s.layout,
            leftHint: s.leftHint,
            rightHint: s.rightHint,
          })) ?? null
        }
        availableImages={product.images.map((img) => ({
          url: img.url,
          thumbnailWebpUrl: img.thumbnailWebpUrl,
          alt: img.alt,
        }))}
      />
    </div>
  );
}

function KV({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] uppercase tracking-wide font-bold text-slate-500">
        {label}
      </div>
      <div className={mono ? "font-mono text-slate-800" : "text-slate-800"}>
        {value}
      </div>
    </div>
  );
}
