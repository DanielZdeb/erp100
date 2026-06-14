// Wewnętrzny helper serwerowy — NIE jest server action.
// Sprawdza reguły `ComponentCategoryRule` dla kategorii produktu (i wszystkich
// kategorii nadrzędnych) i auto-dopina brakujące komponenty.

import { db } from "@/lib/db";

const MAX_ANCESTOR_DEPTH = 10;

/**
 * Zbiera id kategorii produktu + wszystkich jej przodków (do `parent`).
 * Pusta tablica jeśli produkt nie ma kategorii.
 */
async function collectCategoryAndAncestors(
  startCategoryId: string,
): Promise<string[]> {
  const ids: string[] = [];
  let currentId: string | null = startCategoryId;
  let depth = 0;
  while (currentId && depth < MAX_ANCESTOR_DEPTH) {
    ids.push(currentId);
    const cat: { parentId: string | null } | null = await db.category.findUnique(
      {
        where: { id: currentId },
        select: { parentId: true },
      },
    );
    currentId = cat?.parentId ?? null;
    depth++;
  }
  return ids;
}

/**
 * Dopisuje brakujące komponenty do produktu na podstawie zapisanych reguł
 * `ComponentCategoryRule`. Wywoływane przy tworzeniu nowego produktu i przy
 * zmianie kategorii produktu istniejącego.
 *
 * Nie usuwa istniejących powiązań — działa tylko addytywnie.
 *
 * Zwraca liczbę nowo dodanych powiązań.
 */
export async function ensureComponentLinksForProduct(
  productId: string,
): Promise<number> {
  const product = await db.product.findUnique({
    where: { id: productId },
    select: { id: true, categoryId: true },
  });
  if (!product || !product.categoryId) return 0;

  const categoryIds = await collectCategoryAndAncestors(product.categoryId);
  if (categoryIds.length === 0) return 0;

  const rules = await db.componentCategoryRule.findMany({
    where: { categoryId: { in: categoryIds } },
    select: { componentId: true, quantity: true },
  });
  if (rules.length === 0) return 0;

  // De-dup po componentId (jeśli ten sam komponent ma regułę na różnych
  // poziomach drzewa — bierzemy max quantity).
  const byComponent = new Map<string, number>();
  for (const r of rules) {
    if (r.componentId === productId) continue; // self-loop
    const prev = byComponent.get(r.componentId) ?? 0;
    if (r.quantity > prev) byComponent.set(r.componentId, r.quantity);
  }
  if (byComponent.size === 0) return 0;

  const componentIds = [...byComponent.keys()];
  const existing = await db.productComponent.findMany({
    where: { productId, componentId: { in: componentIds } },
    select: { componentId: true },
  });
  const existingSet = new Set(existing.map((e) => e.componentId));
  const toCreate = componentIds.filter((id) => !existingSet.has(id));
  if (toCreate.length === 0) return 0;

  // Następny sortOrder dla tego produktu
  const max = await db.productComponent.aggregate({
    where: { productId },
    _max: { sortOrder: true },
  });
  let nextOrder = (max._max.sortOrder ?? -1) + 1;

  await db.productComponent.createMany({
    data: toCreate.map((componentId) => ({
      productId,
      componentId,
      quantity: byComponent.get(componentId) ?? 1,
      sortOrder: nextOrder++,
    })),
  });

  return toCreate.length;
}
