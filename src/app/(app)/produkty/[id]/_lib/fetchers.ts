import { cache } from "react";

import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";

/**
 * Cached fetchery dla karty produktu. Dzięki React `cache()` te same
 * wywołania w obrębie jednego requestu (layout + section page) zwrócą
 * ten sam wynik bez duplikatu query do bazy.
 *
 * Multi-tenant: scope per companyId — produkt cudzej firmy zwraca null
 * (caller wywołuje notFound()).
 */

export const getProductHeader = cache(async (id: string) => {
  const companyId = await getCurrentCompanyId();
  return db.product.findFirst({
    where: { id, companyId },
    select: {
      id: true,
      name: true,
      productCode: true,
      eanCode: true,
      code128: true,
      status: true,
      archived: true,
      isComponent: true,
      compositionMode: true,
      color: true,
      categoryId: true,
      // Łańcuch kategorii: bieżąca + 4 poziomy w górę (UI badge pokazuje
      // przypisanie instrukcji do dowolnego przodka z includeDescendants).
      category: {
        select: {
          id: true,
          name: true,
          parentId: true,
          manualAssignments: { select: { manualId: true, includeDescendants: true } },
          parent: {
            select: {
              id: true,
              parentId: true,
              manualAssignments: { select: { manualId: true, includeDescendants: true } },
              parent: {
                select: {
                  id: true,
                  parentId: true,
                  manualAssignments: { select: { manualId: true, includeDescendants: true } },
                  parent: {
                    select: {
                      id: true,
                      manualAssignments: { select: { manualId: true, includeDescendants: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      // ── Pola używane w obliczeniu badge'y X/Y per tab ──
      weightKg: true,
      widthCm: true,
      heightCm: true,
      depthCm: true,
      customsDutyPct: true,
      importMode: true,
      boxWidthCm: true,
      boxHeightCm: true,
      boxDepthCm: true,
      boxWeightKg: true,
      unitsPerBox: true,
      unitsPerContainer: true,
      referenceContainerM3: true,
      defaultUnitPriceUsd: true,
      defaultUnitPriceCny: true,
      productManualJson: true,
      shortDescription: true,
      producer: true,
      unit: true,
      // ZESTAW (bundle) ma osobne pola wysyłki — używamy ich w liczniku
      // Pakowanie zamiast SHIPPING/FACTORY pinów (te nie dotyczą zestawu).
      bundleShippingMode: true,
      bundleShippingBoxId: true,
      // Przypisania instrukcji — do liczenia badge'a „Instrukcja X/1".
      // Relacja na Product nazywa się `manualAssignments` (m2m do
      // ProductManualProduct). Wystarczy nam wiedzieć, że jest ≥1 wpis.
      manualAssignments: {
        select: { manualId: true },
        take: 1,
      },
      components: {
        select: { id: true },
      },
      shippingBoxes: {
        // Liczniki kompletności (Import / Pakowanie) korzystają z wymiarów
        // i wagi kartonu, oraz unitsPerBox z pinu. Bez tych pól w select
        // shipping pin był „niewidoczny" dla badge'ów X/Y.
        select: {
          id: true,
          purpose: true,
          isPrimary: true,
          unitsPerBox: true,
          box: {
            select: {
              widthCm: true,
              heightCm: true,
              depthCm: true,
              weightKg: true,
            },
          },
        },
      },
      priceHistory: {
        select: { id: true },
      },
      courierRecommendations: {
        select: { id: true },
      },
      preferredShippingServices: true,
      images: {
        where: { isPrimary: true },
        take: 1,
        select: { url: true, alt: true },
      },
    },
  });
});

export type ProductHeaderData = NonNullable<
  Awaited<ReturnType<typeof getProductHeader>>
>;

export const getProductFull = cache(async (id: string) => {
  const companyId = await getCurrentCompanyId();
  return db.product.findFirst({
    where: { id, companyId },
    include: {
      category: { select: { id: true, name: true } },
      images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }] },
      files: { orderBy: { createdAt: "desc" } },
      priceHistory: { orderBy: { recordedAt: "desc" } },
      courierRecommendations: {
        orderBy: { priority: "asc" },
        include: {
          courier: { select: { id: true, name: true } },
        },
      },
      stageCompletions: true,
      stageChecklistItems: { orderBy: { sortOrder: "asc" } },
      shippingBoxes: {
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        include: {
          box: {
            select: {
              id: true,
              name: true,
              internalCode: true,
              packagingType: true,
              widthCm: true,
              heightCm: true,
              depthCm: true,
              weightKg: true,
              cardboardLayers: true,
              purchasePricePln: true,
            },
          },
        },
      },
      // Karton zestawu (SINGLE_CARTON mode) — żeby Pakowanie tab mogło pokazać
      // wybrany karton.
      bundleShippingBox: {
        select: {
          id: true,
          name: true,
          internalCode: true,
          widthCm: true,
          heightCm: true,
          depthCm: true,
          weightKg: true,
          purchasePricePln: true,
        },
      },
      stocks: {
        include: {
          warehouse: {
            select: { id: true, name: true, externalId: true, sortOrder: true },
          },
        },
      },
      components: {
        orderBy: { sortOrder: "asc" },
        include: {
          component: {
            select: {
              id: true,
              name: true,
              productCode: true,
              categoryId: true,
              category: { select: { id: true, name: true } },
              images: {
                where: { isPrimary: true },
                take: 1,
                select: { url: true, alt: true },
              },
              // Waga produktu — do wyceny kuriera (waga paczki = weightKg + boxWeight)
              weightKg: true,
              // Pakowanie wysyłkowe komponentu — potrzebne dla ZESTAW w trybie
              // INDIVIDUAL_PACKAGING (suma kartonów per komponent).
              // Pobieramy SHIPPING i FACTORY — bundle-packaging.ts wybiera
              // primary SHIPPING, a w fallbacku akceptuje FACTORY (produkt
              // przychodzi już zapakowany — karton z Chin nadaje się do
              // wysyłki kurierem). Bez fallbacka komponenty z samym FACTORY
              // pokazywały „—" w sumarycznej tabeli pakowania zestawu.
              unitsPerShippingBox: true,
              shippingBoxes: {
                orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
                select: {
                  unitsPerBox: true,
                  purpose: true,
                  isPrimary: true,
                  box: {
                    select: {
                      id: true,
                      name: true,
                      widthCm: true,
                      heightCm: true,
                      depthCm: true,
                      weightKg: true,
                      purchasePricePln: true,
                    },
                  },
                },
              },
            },
          },
          poolCategories: { select: { id: true, name: true } },
          poolProducts: { select: { id: true, name: true, productCode: true } },
        },
      },
    },
  });
});
