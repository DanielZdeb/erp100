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
import { CategoryNav, type CategoryNavItem } from "@/components/category-nav";

import { ProductsListClient } from "./_components/products-list-client";

export const dynamic = "force-dynamic";

export default async function SprzedazProduktyPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    cat?: string;
    view?: string;
    type?: string;
    archived?: string;
  }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const categoryId = sp.cat?.trim() || null;
  const view: "params" | "gallery" =
    sp.view === "gallery" ? "gallery" : "params";
  // Typ produktu: product = tylko produkty, component = tylko komponenty,
  // all = oba razem (przydatne np. dla baz wiedzy o materialach)
  const type: "product" | "component" | "all" =
    sp.type === "component"
      ? "component"
      : sp.type === "all"
        ? "all"
        : "product";
  const showArchived = sp.archived === "1";
  const companyId = await getCurrentCompanyId();

  // Wszystkie kategorie firmy + bezposrednie liczniki produktow (respektujac
  // aktualny typeFilter + archived) — uzywane przez CategoryNav (3 kolumny).
  const allCategories = await db.category.findMany({
    where: { companyId },
    orderBy: [{ level: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      parentId: true,
      level: true,
      _count: {
        select: {
          products: {
            where: {
              archived: showArchived,
              ...(type === "product"
                ? { isComponent: false }
                : type === "component"
                  ? { isComponent: true }
                  : {}),
            },
          },
        },
      },
    },
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

  const typeFilter =
    type === "product"
      ? { isComponent: false }
      : type === "component"
        ? { isComponent: true }
        : {};

  // Lazy load — przy wejsciu na /sprzedaz/produkty bez zadnego filtra
  // nie ladujemy 1000+ produktow. Pokazujemy nawigator kategorii i hint
  // 'Wybierz kategorie'. Next.js Link prefetch sciaga kategorie w tle,
  // wiec klik po pierwszym zaladowaniu nawigatora jest natychmiastowy.
  const shouldLoadProducts = !!(
    categoryId || q || showArchived || type !== "product"
  );
  const skipFilter = shouldLoadProducts
    ? {}
    : { id: { equals: "__skip_no_filter__" } };
  const products = await db.product.findMany({
    where: {
      companyId,
      archived: showArchived,
      ...typeFilter,
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
      ...skipFilter,
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
      isComponent: true,
      archived: true,
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

  // Liczniki dla zakladki typu (product / component / all) — zawsze nieaktywne
  // archiwum w licznikach (pokazuj ile aktywnych jest w kazdej kategorii).
  const [productCount, componentCount, archivedCount] = await Promise.all([
    db.product.count({
      where: { companyId, archived: false, isComponent: false },
    }),
    db.product.count({
      where: { companyId, archived: false, isComponent: true },
    }),
    db.product.count({
      where: { companyId, archived: true, ...typeFilter },
    }),
  ]);

  // Cumulative count per kategoria (subtree).
  const childrenMap = new Map<string | null, typeof allCategories>();
  for (const c of allCategories) {
    const k = c.parentId ?? null;
    childrenMap.set(k, [...(childrenMap.get(k) ?? []), c]);
  }
  const cumulative = new Map<string, number>();
  function cumCount(id: string): number {
    const cached = cumulative.get(id);
    if (cached !== undefined) return cached;
    const cat = allCategories.find((c) => c.id === id);
    if (!cat) return 0;
    let total = cat._count.products;
    for (const child of childrenMap.get(id) ?? []) total += cumCount(child.id);
    cumulative.set(id, total);
    return total;
  }
  for (const c of allCategories) cumCount(c.id);

  const navItems: CategoryNavItem[] = allCategories.map((c) => ({
    id: c.id,
    name: c.name,
    parentId: c.parentId,
    level: c.level,
    directCount: c._count.products,
    cumulativeCount: cumulative.get(c.id) ?? 0,
  }));

  const totalForNav =
    type === "product"
      ? productCount
      : type === "component"
        ? componentCount
        : productCount + componentCount;

  function buildHref(catId: string | null): string {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (view !== "params") sp.set("view", view);
    if (type !== "product") sp.set("type", type);
    if (showArchived) sp.set("archived", "1");
    if (catId) sp.set("cat", catId);
    const qs = sp.toString();
    return qs ? `/sprzedaz/produkty?${qs}` : "/sprzedaz/produkty";
  }

  const categoryNavSlot = (
    <CategoryNav
      categories={navItems}
      totalCount={totalForNav}
      selectedId={categoryId}
      buildHref={buildHref}
    />
  );

  return (
    <ProductsListClient
      view={view}
      q={q}
      shouldLoadProducts={shouldLoadProducts}
      totalProductCount={totalForNav}
      categoryNavSlot={categoryNavSlot}
      type={type}
      showArchived={showArchived}
      counts={{
        product: productCount,
        component: componentCount,
        archived: archivedCount,
      }}
      products={products.map((p) => ({
        id: p.id,
        name: p.name,
        productCode: p.productCode,
        eanCode: p.eanCode,
        color: p.color,
        colorCode: p.colorCode,
        weightKg: p.weightKg,
        compositionMode: p.compositionMode,
        isComponent: p.isComponent,
        archived: p.archived,
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
