/**
 * Lista produktów w widoku Sprzedażowym.
 *
 * Dwa widoki (toggle u góry):
 *  - PARAMETRY: tabela (Grafika, Nazwa, Kategoria, SKU, EAN, Kolor+Kod, Waga, Szablon)
 *  - GALERIA: kafelki per produkt z nazwą, SKU i wszystkimi zdjęciami z galerii
 *             + lightbox po kliknięciu zdjęcia
 *
 * Plus filtr kategoria + szukajka.
 *
 * Klik na wiersz/kafelek → `/sprzedaz/produkty/[id]` (karta sprzedażowa).
 */
import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";

import { ProductsListClient } from "./_components/products-list-client";

export const dynamic = "force-dynamic";

export default async function SprzedazProduktyPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cat?: string; view?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const categoryId = sp.cat?.trim() || null;
  const view: "params" | "gallery" =
    sp.view === "gallery" ? "gallery" : "params";
  const companyId = await getCurrentCompanyId();

  // Wszystkie kategorie firmy do dropdowna filtru
  const allCategories = await db.category.findMany({
    where: { companyId },
    orderBy: [{ level: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, parentId: true, level: true },
  });

  // Zbierz potomków wybranej kategorii (filtr rozszerza się na wszystkich)
  const categoryFilter = (() => {
    if (!categoryId) return undefined;
    const ids: string[] = [categoryId];
    let frontier: string[] = [categoryId];
    const safety = 20;
    let depth = 0;
    while (frontier.length > 0 && depth < safety) {
      const next = allCategories
        .filter((c) => c.parentId != null && frontier.includes(c.parentId))
        .map((c) => c.id);
      if (next.length === 0) break;
      ids.push(...next);
      frontier = next;
      depth++;
    }
    return { categoryId: { in: ids } };
  })();

  const products = await db.product.findMany({
    where: {
      companyId,
      archived: false,
      isComponent: false,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { productCode: { contains: q, mode: "insensitive" as const } },
              { eanCode: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
      ...(categoryFilter ?? {}),
    },
    orderBy: [{ compositionMode: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      productCode: true,
      eanCode: true,
      color: true,
      colorCode: true,
      weightKg: true,
      compositionMode: true,
      category: { select: { id: true, name: true } },
      images: {
        // W widoku galeria potrzebujemy WSZYSTKIE READY (max 12), w param. wystarczy 1
        where: { archived: false, status: "READY" },
        orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
        take: view === "gallery" ? 12 : 1,
        select: { id: true, url: true, thumbnailWebpUrl: true, alt: true },
      },
      descriptionTemplate: { select: { id: true, name: true } },
    },
  });

  return (
    <ProductsListClient
      view={view}
      q={q}
      selectedCategoryId={categoryId}
      categories={allCategories}
      products={products.map((p) => ({
        id: p.id,
        name: p.name,
        productCode: p.productCode,
        eanCode: p.eanCode,
        color: p.color,
        colorCode: p.colorCode,
        weightKg: p.weightKg,
        compositionMode: p.compositionMode,
        categoryName: p.category?.name ?? null,
        templateName: p.descriptionTemplate?.name ?? null,
        images: p.images.map((i) => ({
          id: i.id,
          url: i.url,
          thumbnailWebpUrl: i.thumbnailWebpUrl,
          alt: i.alt,
        })),
      }))}
    />
  );
}
