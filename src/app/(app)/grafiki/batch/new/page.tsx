import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Rocket } from "lucide-react";

import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";

import { BatchWizard } from "./_components/batch-wizard";

export const dynamic = "force-dynamic";

export default async function NewBatchPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string }>;
}) {
  const { template: templateId } = await searchParams;
  if (!templateId) {
    redirect("/grafiki");
  }
  const companyId = await getCurrentCompanyId();

  const [template, products, categories] = await Promise.all([
    db.productPhotoTemplate.findFirst({
      where: { id: templateId, companyId },
      include: {
        shots: {
          orderBy: { sortOrder: "asc" },
        },
      },
    }),
    db.product.findMany({
      where: { companyId, archived: false },
      orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        productCode: true,
        color: true,
        widthCm: true,
        heightCm: true,
        depthCm: true,
        weightKg: true,
        shortDescription: true,
        categoryId: true,
        // WSZYSTKIE obrazki produktu — używane jako pickable references
        // w ReferencesCell ("Wybierz z galerii"). primaryImageUrl wyliczamy
        // potem z pierwszej w sortOrder + isPrimary.
        images: {
          orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
          select: {
            url: true,
            thumbnailWebpUrl: true,
            isPrimary: true,
          },
        },
        category: { select: { name: true } },
      },
    }),
    db.category.findMany({
      where: { companyId },
      orderBy: [{ level: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        parentId: true,
        level: true,
        _count: { select: { products: true } },
      },
    }),
  ]);

  if (!template) notFound();

  return (
    <div className="p-6 space-y-4">
      <Link
        href="/grafiki"
        className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1"
      >
        <ArrowLeft className="size-3" />
        Generator grafik
      </Link>
      <h1 className="text-2xl font-heading font-bold tracking-tight inline-flex items-center gap-2">
        <Rocket className="size-6 text-violet-600" />
        Nowa kampania
      </h1>
      <p className="text-sm text-muted-foreground">
        Template: <strong>{template.name}</strong> · Jakość domyślna:{" "}
        <strong>{template.defaultQuality}</strong>
      </p>

      <BatchWizard
        templateId={template.id}
        defaultQuality={template.defaultQuality}
        shots={template.shots.map((s) => ({
          id: s.id,
          name: s.name,
          iconName: s.iconName,
          referenceImageUrl: s.referenceImageUrl,
        }))}
        products={products.map((p) => {
          const dims: string[] = [];
          if (p.widthCm && p.heightCm && p.depthCm) {
            dims.push(`${p.widthCm}×${p.heightCm}×${p.depthCm}cm`);
          }
          if (p.weightKg) dims.push(`${p.weightKg}kg`);
          const paramsLine = [
            ...dims,
            p.shortDescription?.slice(0, 80),
          ]
            .filter(Boolean)
            .join("\n");
          return {
            id: p.id,
            name: p.name,
            productCode: p.productCode,
            color: p.color,
            categoryId: p.categoryId,
            primaryImageUrl: p.images[0]?.url ?? null,
            // Galeria — wszystkie zdjęcia produktu, używane jako pickable refs.
            // Preferujemy thumbnailWebpUrl do podglądu (~5KB) — kliknięcie i tak
            // doda pełny `url` do referenceImages (Imagen/Nano Banana dostają
            // oryginał, nie thumb).
            galleryImages: p.images.map((img) => ({
              url: img.url,
              thumbnailUrl: img.thumbnailWebpUrl ?? img.url,
            })),
            categoryName: p.category?.name ?? null,
            paramsLine,
          };
        })}
        categoryTree={categories.map((c) => ({
          id: c.id,
          name: c.name,
          parentId: c.parentId,
          level: c.level,
        }))}
      />
    </div>
  );
}
