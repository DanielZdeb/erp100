import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  PRODUCT_STATUS_BADGE,
  PRODUCT_STATUS_SHORT,
  type ProductStatusT,
} from "@/lib/product-status";

import { ArchiveButton } from "../archive-button";
import { DeleteProductButton } from "../delete-button";
import { ProductDetailTabs } from "../_components/detail-tabs";
import { getProductHeader } from "../_lib/fetchers";

export const dynamic = "force-dynamic";

export default async function ProductDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await getProductHeader(id);
  if (!product) notFound();

  const shippingBoxCount = product.shippingBoxes.filter(
    (pb) => pb.purpose === "SHIPPING",
  ).length;
  const factoryBoxCount = product.shippingBoxes.filter(
    (pb) => pb.purpose === "FACTORY",
  ).length;

  // ─── Liczniki uzupełnienia X/Y per tab (jak w zamówieniach) ──────────
  // Helper: 1 jeśli wartość non-null/non-empty/non-zero, inaczej 0.
  const has = (v: unknown): number => {
    if (v == null) return 0;
    if (typeof v === "string") return v.trim() === "" ? 0 : 1;
    if (typeof v === "number") return v === 0 ? 0 : 1;
    return 1;
  };

  // PODSTAWOWE: nazwa, kod, kategoria, status, kolor, EAN-lub-CODE128,
  // waga sztuki, cło importowe.
  // ZESTAW (wirtualny produkt) NIE ma własnego CODE128 ani stawki cła —
  // kody mają poszczególne składniki, cło naliczane jest na poziomie
  // składników w kalkulatorze kontenera. Łącznie 7 zamiast 8.
  const isZestaw = product.compositionMode === "ZESTAW";
  const basicFilled =
    has(product.name) +
    has(product.productCode) +
    has(product.categoryId) +
    has(product.status) +
    has(product.color) +
    (isZestaw
      ? has(product.eanCode)
      : has(product.eanCode) || has(product.code128)
        ? 1
        : 0) +
    has(product.weightKg) +
    (isZestaw ? 0 : has(product.customsDutyPct));
  const basicTotal = isZestaw ? 7 : 8;

  // Wyłuskaj pin FACTORY (preferowany primary, jeśli go nie ma — pierwszy).
  // Wymiary i waga kartonu z Chin mogą żyć w 2 miejscach: w polach produktu
  // (legacy: product.boxWidthCm/...) lub w przypiętym shippingBox (FACTORY).
  // Liczniki kompletności muszą widzieć obie ścieżki.
  const factoryPin =
    product.shippingBoxes.find(
      (pb) => pb.purpose === "FACTORY" && pb.isPrimary,
    ) ??
    product.shippingBoxes.find((pb) => pb.purpose === "FACTORY") ??
    null;
  const effBoxW = product.boxWidthCm ?? factoryPin?.box.widthCm ?? null;
  const effBoxH = product.boxHeightCm ?? factoryPin?.box.heightCm ?? null;
  const effBoxD = product.boxDepthCm ?? factoryPin?.box.depthCm ?? null;
  const effBoxWeight =
    product.boxWeightKg ?? factoryPin?.box.weightKg ?? null;
  const effUnitsPerBox =
    product.unitsPerBox ?? factoryPin?.unitsPerBox ?? null;

  // PAKOWANIE:
  //  • ZESTAW (wirtualny) → wystarczy tryb pakowania i pudełko zbiorcze
  //    (bundleShippingMode + bundleShippingBoxId). Wymiary i preferowane
  //    usługi kurierskie naliczane są na poziomie składników → 1/1.
  //  • Zwykły produkt → SHIPPING/FACTORY pin + preferowana usługa +
  //    wymiary produktu (W×H×D, lub z FACTORY kartonu) → 3/3.
  const dimsFilled =
    (has(product.widthCm) && has(product.heightCm) && has(product.depthCm)) ||
    (has(effBoxW) && has(effBoxH) && has(effBoxD))
      ? 1
      : 0;
  const isBundleForPackaging = product.compositionMode === "ZESTAW";
  const packagingFilled = isBundleForPackaging
    ? // SINGLE_CARTON wymaga wybranego kartonu (bundleShippingBoxId).
      // INDIVIDUAL_PACKAGING nie potrzebuje wspolnego kartonu — uzywa
      // pudel kazdego komponentu. Wystarczy ze tryb jest wybrany.
      product.bundleShippingMode === "INDIVIDUAL_PACKAGING" ||
      (product.bundleShippingMode === "SINGLE_CARTON" &&
        product.bundleShippingBoxId != null)
      ? 1
      : 0
    : (shippingBoxCount > 0 || factoryBoxCount > 0 ? 1 : 0) +
      (product.preferredShippingServices.length > 0 ? 1 : 0) +
      dimsFilled;
  const packagingTotal = isBundleForPackaging ? 1 : 3;

  // IMPORT (3): wymiary kartonu (W×H×D), waga kartonu, szt./karton
  // (lub: sztuk/kontener jeśli LUZEM). Waga sztuki + cło są w „Podstawowe".
  // Akceptujemy dane z product.box* LUB z przypiętego FACTORY pudełka.
  // Waga: null = niewpisane, 0 = wpisane jako zero (akceptujemy).
  const importBoxOk =
    has(effBoxW) && has(effBoxH) && has(effBoxD) ? 1 : 0;
  const importUnits =
    product.importMode === "LUZEM"
      ? has(product.unitsPerContainer)
      : has(effUnitsPerBox);
  const importWeightOk = effBoxWeight != null ? 1 : 0;
  const importFilled = importBoxOk + importWeightOk + importUnits;
  const importTotal = 3;

  // INSTRUKCJA (1): produkt ma instrukcję jeśli spełniony JEDEN z warunków:
  //   • legacy productManualJson zdefiniowany (deprecated, ale ciągle wspierany),
  //   • istnieje bezpośrednie przypisanie ProductManualProduct,
  //   • w łańcuchu kategorii (bieżąca → 4 poziomy w górę) jest jakieś
  //     ProductManualCategory: direct match na bieżącej, LUB na przodku
  //     z includeDescendants=true.
  type Cat = {
    id: string;
    parentId?: string | null;
    manualAssignments: { manualId: string; includeDescendants: boolean }[];
    parent?: Cat | null;
  } | null;
  const hasManualInCategoryChain = (cat: Cat, isDirect: boolean): boolean => {
    if (!cat) return false;
    const matches = cat.manualAssignments.some(
      (a) => isDirect || a.includeDescendants,
    );
    if (matches) return true;
    return hasManualInCategoryChain(cat.parent ?? null, false);
  };
  const instrukcjaFilled =
    product.productManualJson != null ||
    product.manualAssignments.length > 0 ||
    hasManualInCategoryChain(product.category as Cat, true)
      ? 1
      : 0;
  const instrukcjaTotal = 1;

  // Struktura zakładek 1:1 z krokami wizarda nowego produktu:
  // 1. Podstawowe (z cenami + komponentami inline)
  // 2. Pakowanie (mirror wizard step 2 — pudełka wysyłkowe + kurierzy)
  // 3. Import (mirror wizard step 3 — master karton / factory / bulk + waga, cło)
  // dalej standardowe zakładki detail-page.
  // ZESTAW nie ma własnego importu — składniki przychodzą niezależnie.
  // Ukrywamy zakładkę „Import" dla produktów typu ZESTAW.
  const isBundle = product.compositionMode === "ZESTAW";
  const items = [
    {
      slug: "podstawowe",
      label: "Podstawowe",
      badge: `${basicFilled}/${basicTotal}`,
    },
    {
      slug: "pakowanie",
      label: "Pakowanie",
      badge: `${packagingFilled}/${packagingTotal}`,
    },
    ...(isBundle
      ? []
      : [
          {
            slug: "import",
            label: "Import",
            badge: `${importFilled}/${importTotal}`,
          },
        ]),
    {
      slug: "instrukcja",
      label: "Instrukcja",
      badge: `${instrukcjaFilled}/${instrukcjaTotal}`,
    },
    { slug: "wytyczne", label: "Wytyczne prod." },
    { slug: "zamowienia", label: "Zamówienia" },
  ];

  return (
    <div className="p-6 space-y-4 min-h-screen bg-slate-50/60">
      {/* Header — title, status, action buttons, sub-actions */}
      <div className="space-y-3">
        <Link
          href="/produkty"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3" />
          Wstecz do listy produktów
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-heading font-bold tracking-tight">
                {product.name}
              </h1>
              <Badge
                variant="secondary"
                className={cn(
                  "text-[10px]",
                  PRODUCT_STATUS_BADGE[product.status as ProductStatusT],
                )}
              >
                {PRODUCT_STATUS_SHORT[product.status as ProductStatusT]}
              </Badge>
              {product.archived && (
                <Badge variant="outline" className="text-[10px]">
                  Zarchiwizowany
                </Badge>
              )}
              {product.isComponent && (
                <Badge
                  variant="secondary"
                  className="text-[10px] bg-violet-100 text-violet-800"
                >
                  komponent
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1">
              <span>
                Kod: <code>{product.productCode}</code>
              </span>
              {product.eanCode && (
                <span>
                  EAN: <code>{product.eanCode}</code>
                </span>
              )}
              {product.category && (
                <span>Kategoria: {product.category.name}</span>
              )}
              {product.color && <span>Kolor: {product.color}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/produkty/${product.id}/jedna-karta`}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border rounded-md px-2.5 py-1.5"
              title="Pokaż wszystkie sekcje na jednej karcie"
            >
              <ExternalLink className="size-3.5" />
              Wyświetl na jednej karcie
            </Link>
            <ArchiveButton id={product.id} archived={product.archived} />
            <DeleteProductButton
              id={product.id}
              name={product.name}
              isComponent={product.isComponent}
            />
          </div>
        </div>
      </div>

      {/* Sidebar (sticky) + body — 2-kolumnowy layout. Sidebar ma własną kartę
          z gradientem (slate), content jest osadzony w białej karcie z ring
          + cieniem — wyraźna separacja od tła strony. Na mobile sidebar
          zwija się nad treścią. */}
      <div className="flex flex-col lg:flex-row gap-4 items-start">
        <aside className="w-full lg:w-56 lg:shrink-0 lg:sticky lg:top-4">
          <ProductDetailTabs
            productId={product.id}
            items={items}
            orientation="vertical"
          />
        </aside>
        <div className="flex-1 min-w-0 relative">
          <div className="animate-in fade-in-0 slide-in-from-bottom-1 duration-300 rounded-xl bg-white ring-1 ring-slate-200 shadow-sm p-5">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
