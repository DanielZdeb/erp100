"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";

async function requireUser() {
  const session = await auth();
  if (!session?.user) throw new Error("Brak autoryzacji");
  return session.user;
}

function intOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

const componentSchema = z.object({
  componentId: z.string().min(1, "Wybierz produkt"),
  quantity: z.union([z.string(), z.number()]).optional(),
  notes: z.string().optional().nullable(),
  /** Czy slot dopuszcza podmianę na warianty. */
  allowVariants: z.boolean().optional(),
  /** Lista ID kategorii w puli (każda + descendants). */
  poolCategoryIds: z.array(z.string()).optional(),
  /** Lista ID produktów dodanych explicite do puli. */
  poolProductIds: z.array(z.string()).optional(),
});

/**
 * Resolwuje pełny zestaw produktów w puli wariantów slotu.
 * Zwraca tablicę {productId, categoryId} produktów dopuszczalnych jako warianty.
 *
 * Algorytm:
 *  - Jeśli `allowVariants=false` → zwraca pusty zestaw (tylko domyślny dozwolony)
 *  - Jeśli ustawione `poolCategories` lub `poolProducts` → łączy oba źródła
 *  - Else fallback: pool = kategoria domyślnego komponentu + descendants
 */
export async function resolveSlotPoolProductIds(
  slotId: string,
): Promise<Set<string>> {
  const slot = await db.productComponent.findUnique({
    where: { id: slotId },
    select: {
      allowVariants: true,
      component: { select: { id: true, categoryId: true } },
      poolCategories: { select: { id: true } },
      poolProducts: { select: { id: true } },
    },
  });
  if (!slot) return new Set();
  if (!slot.allowVariants) return new Set([slot.component.id]);

  const explicitProductIds = slot.poolProducts.map((p) => p.id);
  const categoryRoots = slot.poolCategories.map((c) => c.id);

  // Fallback: gdy nic nie ustawione, użyj kategorii defaultowego komponentu
  if (categoryRoots.length === 0 && explicitProductIds.length === 0) {
    if (slot.component.categoryId) categoryRoots.push(slot.component.categoryId);
  }

  const allCategoryIds = await collectAllDescendantCategoryIds(categoryRoots);
  const productsFromCategories =
    allCategoryIds.length > 0
      ? await db.product.findMany({
          where: { categoryId: { in: allCategoryIds }, archived: false },
          select: { id: true },
        })
      : [];

  const pool = new Set<string>();
  for (const p of productsFromCategories) pool.add(p.id);
  for (const pid of explicitProductIds) pool.add(pid);
  // Default komponent zawsze w puli
  pool.add(slot.component.id);
  return pool;
}

async function collectAllDescendantCategoryIds(
  rootIds: string[],
): Promise<string[]> {
  if (rootIds.length === 0) return [];
  const all: string[] = [];
  let frontier = rootIds.slice();
  const safety = 5;
  let depth = 0;
  while (frontier.length > 0 && depth < safety) {
    all.push(...frontier);
    const children = await db.category.findMany({
      where: { parentId: { in: frontier } },
      select: { id: true },
    });
    frontier = children.map((c) => c.id);
    depth++;
  }
  return all;
}

/**
 * Bulk assign: ten komponent ma pasować do wszystkich produktów w wybranych
 * kategoriach (rekurencyjnie: kategoria główna obejmuje wszystkie podkategorie
 * i typy produktów pod nią). Pomija produkty już połączone z tym komponentem.
 *
 * Zapisuje też **trwałą regułę** (`ComponentCategoryRule`) — dzięki temu nowe
 * produkty dodane później do tych kategorii automatycznie dostaną ten
 * komponent (przez `ensureComponentLinksForProduct` w create/update produktu).
 *
 * Reguła zastępuje poprzednią: kategorie nie w `categoryIds` są usuwane z reguł
 * dla tego komponentu. Istniejące powiązania `ProductComponent` nie są usuwane
 * (akcja jest addytywna na poziomie linków).
 */
export async function bulkAssignComponentToCategoriesAction(
  componentId: string,
  categoryIds: string[],
  quantityPerProduct: number = 1,
) {
  await requireUser();

  const component = await db.product.findUnique({
    where: { id: componentId },
    select: { id: true, isComponent: true },
  });
  if (!component) throw new Error("Komponent nie istnieje.");

  const qty = Math.max(1, Math.trunc(quantityPerProduct));

  // 1. Sync reguł: usuń te, których nie ma w nowej liście; upsert pozostałych
  const existingRules = await db.componentCategoryRule.findMany({
    where: { componentId },
    select: { categoryId: true },
  });
  const existingRuleCatIds = new Set(existingRules.map((r) => r.categoryId));
  const newRuleCatIds = new Set(categoryIds);
  const toRemoveRuleCats = [...existingRuleCatIds].filter(
    (id) => !newRuleCatIds.has(id),
  );
  if (toRemoveRuleCats.length > 0) {
    await db.componentCategoryRule.deleteMany({
      where: { componentId, categoryId: { in: toRemoveRuleCats } },
    });
  }
  for (const categoryId of newRuleCatIds) {
    await db.componentCategoryRule.upsert({
      where: {
        componentId_categoryId: { componentId, categoryId },
      },
      create: { componentId, categoryId, quantity: qty },
      update: { quantity: qty },
    });
  }

  if (categoryIds.length === 0) {
    revalidatePath(`/produkty/${componentId}`);
    return { ok: true as const, created: 0 };
  }

  // 2. Fan-out na istniejące produkty: rozwiń wybrane kategorie o wszystkich
  //    potomków (BFS po drzewie) i dopisz brakujące linki.
  const allCategoryIds = new Set<string>(categoryIds);
  let frontier = [...categoryIds];
  while (frontier.length > 0) {
    const children = await db.category.findMany({
      where: { parentId: { in: frontier } },
      select: { id: true },
    });
    frontier = [];
    for (const c of children) {
      if (!allCategoryIds.has(c.id)) {
        allCategoryIds.add(c.id);
        frontier.push(c.id);
      }
    }
  }

  const products = await db.product.findMany({
    where: {
      categoryId: { in: Array.from(allCategoryIds) },
      id: { not: componentId },
      isComponent: false,
      archived: false,
    },
    select: { id: true },
  });

  if (products.length === 0) {
    revalidatePath(`/produkty/${componentId}`);
    return { ok: true as const, created: 0 };
  }

  const existing = await db.productComponent.findMany({
    where: {
      componentId,
      productId: { in: products.map((p) => p.id) },
    },
    select: { productId: true },
  });
  const existingSet = new Set(existing.map((e) => e.productId));
  const toCreate = products.filter((p) => !existingSet.has(p.id));

  if (toCreate.length === 0) {
    revalidatePath(`/produkty/${componentId}`);
    return { ok: true as const, created: 0 };
  }

  const maxOrders = await db.productComponent.groupBy({
    by: ["productId"],
    where: { productId: { in: toCreate.map((p) => p.id) } },
    _max: { sortOrder: true },
  });
  const maxByProduct = new Map<string, number>(
    maxOrders.map((m) => [m.productId, m._max.sortOrder ?? -1]),
  );

  await db.productComponent.createMany({
    data: toCreate.map((p) => ({
      productId: p.id,
      componentId,
      quantity: qty,
      sortOrder: (maxByProduct.get(p.id) ?? -1) + 1,
    })),
  });

  for (const p of toCreate) {
    revalidatePath(`/produkty/${p.id}`);
  }
  revalidatePath(`/produkty/${componentId}`);
  return { ok: true as const, created: toCreate.length };
}

export async function addProductComponentAction(
  productId: string,
  input: unknown,
) {
  await requireUser();
  const data = componentSchema.parse(input);

  if (data.componentId === productId) {
    throw new Error("Produkt nie może być komponentem samego siebie.");
  }

  const component = await db.product.findUnique({
    where: { id: data.componentId },
    select: { id: true },
  });
  if (!component) throw new Error("Komponent nie istnieje.");

  const existing = await db.productComponent.findUnique({
    where: { productId_componentId: { productId, componentId: data.componentId } },
  });
  if (existing) {
    throw new Error("Ten komponent jest już dodany.");
  }

  const last = await db.productComponent.findFirst({
    where: { productId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  await db.productComponent.create({
    data: {
      productId,
      componentId: data.componentId,
      allowVariants: data.allowVariants ?? true,
      poolCategories:
        data.poolCategoryIds && data.poolCategoryIds.length > 0
          ? { connect: data.poolCategoryIds.map((id) => ({ id })) }
          : undefined,
      poolProducts:
        data.poolProductIds && data.poolProductIds.length > 0
          ? { connect: data.poolProductIds.map((id) => ({ id })) }
          : undefined,
      quantity: Math.max(1, intOrNull(data.quantity) ?? 1),
      sortOrder: (last?.sortOrder ?? -1) + 1,
      notes: data.notes?.trim() || null,
    },
  });

  revalidatePath(`/produkty/${productId}`);
  return { ok: true as const };
}

export async function updateProductComponentAction(
  componentLinkId: string,
  input: unknown,
) {
  await requireUser();
  const data = componentSchema.partial({ componentId: true }).parse(input);

  const link = await db.productComponent.findUnique({
    where: { id: componentLinkId },
    select: { id: true, productId: true },
  });
  if (!link) throw new Error("Powiązanie komponentu nie istnieje.");

  await db.productComponent.update({
    where: { id: componentLinkId },
    data: {
      quantity:
        data.quantity != null
          ? Math.max(1, intOrNull(data.quantity) ?? 1)
          : undefined,
      notes: data.notes?.trim() || null,
    },
  });

  revalidatePath(`/produkty/${link.productId}`);
  return { ok: true as const };
}

/**
 * Ustawia pulę wariantów dla slotu bundla — multi-select.
 *  - `poolCategoryIds`: lista kategorii (każda + descendants)
 *  - `poolProductIds`: lista konkretnych produktów (poza kategoriami)
 *  - obie puste → pool dziedziczy się z `component.categoryId` (fallback)
 *  - `allowVariants=false` → tylko domyślny komponent dopuszczalny
 */
const setSlotPoolSchema = z.object({
  allowVariants: z.boolean(),
  poolCategoryIds: z.array(z.string()),
  poolProductIds: z.array(z.string()),
});

export async function setComponentSlotPoolAction(
  componentLinkId: string,
  input: unknown,
) {
  await requireUser();
  const data = setSlotPoolSchema.parse(input);

  const link = await db.productComponent.findUnique({
    where: { id: componentLinkId },
    select: { id: true, productId: true },
  });
  if (!link) throw new Error("Slot komponentu nie istnieje.");

  // Walidacja — wszystkie kategorie + produkty muszą istnieć
  if (data.poolCategoryIds.length > 0) {
    const cats = await db.category.findMany({
      where: { id: { in: data.poolCategoryIds } },
      select: { id: true },
    });
    if (cats.length !== data.poolCategoryIds.length) {
      throw new Error("Któraś z kategorii puli nie istnieje.");
    }
  }
  if (data.poolProductIds.length > 0) {
    const prods = await db.product.findMany({
      where: { id: { in: data.poolProductIds } },
      select: { id: true },
    });
    if (prods.length !== data.poolProductIds.length) {
      throw new Error("Któryś z produktów puli nie istnieje.");
    }
  }

  // Replace-all: set relacji M2M na nowy zestaw
  await db.productComponent.update({
    where: { id: componentLinkId },
    data: {
      allowVariants: data.allowVariants,
      poolCategories: {
        set: data.poolCategoryIds.map((id) => ({ id })),
      },
      poolProducts: {
        set: data.poolProductIds.map((id) => ({ id })),
      },
    },
  });

  revalidatePath(`/produkty/${link.productId}`);
  return { ok: true as const };
}

export async function removeProductComponentAction(componentLinkId: string) {
  await requireUser();
  const link = await db.productComponent.findUnique({
    where: { id: componentLinkId },
    select: { id: true, productId: true },
  });
  if (!link) return { ok: true as const };
  await db.productComponent.delete({ where: { id: componentLinkId } });
  revalidatePath(`/produkty/${link.productId}`);
  return { ok: true as const };
}
