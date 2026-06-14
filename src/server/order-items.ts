"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { cbmFromBox, cbmFromBulk } from "@/lib/kalkulacje";
import { calculateShipping } from "@/lib/shipping-calc";
import { quoteShippingForProduct } from "@/lib/courier-pricing/product-quote";
import {
  getFulfillmentSettings,
  getSaleChannelDefaults,
} from "@/server/system-settings";
import { resolveSlotPoolProductIds } from "@/server/product-components";
import { maybeSnapshotOrderPrices } from "@/server/orders";

async function requireUser() {
  const session = await auth();
  if (!session?.user) throw new Error("Brak autoryzacji");
  return session.user;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function intOrNull(v: unknown): number | null {
  const n = num(v);
  return n != null ? Math.trunc(n) : null;
}

// ─── Items ───────────────────────────────────────────────────────────

const itemSchema = z.object({
  productId: z.string().min(1, "Wybierz produkt"),
  quantity: z.union([z.string(), z.number()]),
  unitPriceUsd: z.union([z.string(), z.number()]).optional().nullable(),
  unitPriceCny: z.union([z.string(), z.number()]).optional().nullable(),
  unitPricePln: z.union([z.string(), z.number()]).optional().nullable(),
  cnyToPlnRate: z.union([z.string(), z.number()]).optional().nullable(),
  usdToPlnRate: z.union([z.string(), z.number()]).optional().nullable(),
  unitPriceIsBrutto: z.boolean().optional(),
  cbmPerUnit: z.union([z.string(), z.number()]).optional().nullable(),
  expectedMonthlySales: z.union([z.string(), z.number()]).optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function addOrderItemAction(orderId: string, input: unknown) {
  await requireUser();
  const data = itemSchema.parse(input);

  const product = await db.product.findUnique({
    where: { id: data.productId },
    select: {
      compositionMode: true,
      cbmPerUnit: true,
      unitsPerPallet: true,
      // Pola do fallback wyliczenia CBM gdy `cbmPerUnit` na produkcie puste
      importMode: true,
      boxWidthCm: true,
      boxHeightCm: true,
      boxDepthCm: true,
      unitsPerBox: true,
      referenceContainerM3: true,
      unitsPerContainer: true,
      defaultUnitPriceUsd: true,
      defaultUnitPriceCny: true,
      defaultUnitPricePln: true,
      defaultSalePriceAllegroPln: true,
      defaultSalePriceSklepPln: true,
      defaultAllegroCommissionPct: true,
      defaultSklepCommissionPct: true,
      defaultAllegroOtherCostPln: true,
      defaultSklepOtherCostPln: true,
      defaultAllegroCustomerShippingPln: true,
      defaultSklepCustomerShippingPln: true,
      defaultSklepAdCostPln: true,
      preferredShippingServices: true,
      // Do auto-fillu opakowania (cena primary box / unitsPerBox)
      // + do kalkulacji kuriera (wymiary + waga pudełka)
      shippingBoxes: {
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        select: {
          isPrimary: true,
          unitsPerBox: true,
          purpose: true,
          box: {
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
        },
      },
      weightKg: true,
      // Do liczenia liczby SKU (KOMPONENTOWY)
      _count: { select: { components: true } },
    },
  });
  if (!product) throw new Error("Produkt nie istnieje.");

  // Blokuj powielanie — ten sam produkt nie może występować w zamówieniu w
  // dwóch osobnych pozycjach. User powinien edytować ilość istniejącej.
  const duplicate = await db.importOrderItem.findFirst({
    where: { orderId, productId: data.productId },
    select: { id: true, quantity: true },
  });
  if (duplicate) {
    throw new Error(
      `Ten produkt jest już w zamówieniu (${duplicate.quantity} szt). Edytuj ilość istniejącej pozycji zamiast dodawać kolejną.`,
    );
  }

  // Zestawy to wirtualne produkty (compositionMode=ZESTAW) złożone z istniejących
  // produktów/komponentów — nie są importowane samodzielnie. Do zamówienia
  // importowego z Chin można dodawać tylko produkty (CALOSCIOWY/KOMPONENTOWY)
  // i komponenty.
  if (product.compositionMode === "ZESTAW") {
    throw new Error(
      "Nie można dodać zestawu do zamówienia importowego. Zestawy to wirtualne produkty — importuj ich składniki (produkty/komponenty) osobno.",
    );
  }

  const last = await db.importOrderItem.findFirst({
    where: { orderId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  // Cena zakupu — preferuj wpisaną, fallback do defaulta z produktu
  const unitPriceUsd = num(data.unitPriceUsd) ?? product.defaultUnitPriceUsd;
  const unitPriceCny = num(data.unitPriceCny) ?? product.defaultUnitPriceCny;
  const unitPricePln = num(data.unitPricePln) ?? product.defaultUnitPricePln;

  // CBM/szt: preferuj wpisane w formularzu, potem zapisane na produkcie,
  // a w ostateczności policz z wymiarów kartonu (KARTON) lub pojemności
  // kontenera referencyjnego (LUZEM). Bez tego pozycje z produktów, na
  // których user nie zapisał ręcznie cbmPerUnit, lądowały z CBM=null —
  // przez co cała kalkulacja kontenera leciała na 0.
  let productCbm: number | null = product.cbmPerUnit;
  if (productCbm == null || productCbm <= 0) {
    productCbm =
      product.importMode === "KARTON"
        ? cbmFromBox(
            product.boxWidthCm,
            product.boxHeightCm,
            product.boxDepthCm,
            product.unitsPerBox,
          )
        : cbmFromBulk(
            product.referenceContainerM3,
            product.unitsPerContainer,
          );
  }

  const item = await db.importOrderItem.create({
    data: {
      orderId,
      productId: data.productId,
      quantity: Math.max(0, intOrNull(data.quantity) ?? 1),
      unitPriceUsd,
      unitPriceCny,
      unitPricePln,
      cbmPerUnit: num(data.cbmPerUnit) ?? productCbm,
      expectedMonthlySales: intOrNull(data.expectedMonthlySales),
      notes: data.notes?.trim() || null,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
  });

  // Auto-fill fulfillment + opakowanie + kurier per szt.
  const fulfillmentSettings = await getFulfillmentSettings();
  const saleDefaults = await getSaleChannelDefaults();

  // Karton: SHIPPING z purchasePricePln → cena/qty; tylko FACTORY → 0; brak → null
  const shippingPinsForBox = product.shippingBoxes.filter(
    (b) => b.purpose === "SHIPPING",
  );
  const factoryPinsForBox = product.shippingBoxes.filter(
    (b) => b.purpose === "FACTORY",
  );
  const primaryBoxLink =
    shippingPinsForBox.find(
      (b) => b.isPrimary && b.box.purchasePricePln != null,
    ) ??
    shippingPinsForBox.find((b) => b.box.purchasePricePln != null) ??
    null;
  const packagingPerUnit = primaryBoxLink
    ? primaryBoxLink.box.purchasePricePln != null &&
      primaryBoxLink.unitsPerBox > 0
      ? primaryBoxLink.box.purchasePricePln / primaryBoxLink.unitsPerBox
      : null
    : factoryPinsForBox.length > 0
      ? 0
      : null;

  // Kurier per szt — silnik InPost+DHL z fallbackiem SHIPPING → FACTORY.
  const primaryBoxForCourier =
    shippingPinsForBox.find((b) => b.isPrimary) ??
    shippingPinsForBox[0] ??
    factoryPinsForBox.find((b) => b.isPrimary) ??
    factoryPinsForBox[0] ??
    null;
  let shippingCostPerUnit: number | null = null;
  if (primaryBoxForCourier) {
    const quote = quoteShippingForProduct({
      productWeightKg: product.weightKg,
      primaryBox: {
        widthCm: primaryBoxForCourier.box.widthCm,
        heightCm: primaryBoxForCourier.box.heightCm,
        depthCm: primaryBoxForCourier.box.depthCm,
        weightKg: primaryBoxForCourier.box.weightKg,
      },
      preferredServiceCodes: product.preferredShippingServices,
    });
    shippingCostPerUnit = quote?.primary?.totalNetPln ?? null;
  }
  // Fallback legacy z CourierRate gdy silnik nie zwrócił.
  if (shippingCostPerUnit == null && shippingPinsForBox.length > 0) {
    const courierRates = await db.courierRate.findMany({
      where: { courier: { active: true } },
      include: { courier: { select: { id: true, name: true } } },
      orderBy: { pricePln: "asc" },
    });
    const legacyOptions = calculateShipping(
      { weightKg: product.weightKg },
      1,
      shippingPinsForBox.map((pb) => ({
        box: pb.box,
        unitsPerBox: pb.unitsPerBox,
        isPrimary: pb.isPrimary,
      })),
      courierRates,
    );
    const primaryShipping =
      legacyOptions.find((o) => o.isPrimary && o.cheapest) ??
      legacyOptions.find((o) => o.cheapest) ??
      null;
    shippingCostPerUnit =
      primaryShipping?.cheapest && primaryShipping.unitsPerBox > 0
        ? primaryShipping.cheapest.pricePerBox / primaryShipping.unitsPerBox
        : null;
  }

  // Fulfillment per szt — model umowy E-Packman (otwarcie + SKU × n +
  // perSztuka + własna umowa kuriera + magazyn palety / unitsPerPallet).
  const skuCount = Math.max(1, product._count.components || 1);
  const palletPerUnit =
    product.unitsPerPallet && product.unitsPerPallet > 0
      ? fulfillmentSettings.palletStorageCostPerMonth / product.unitsPerPallet
      : 0;
  const fulfillmentRaw =
    fulfillmentSettings.orderOpeningCost +
    fulfillmentSettings.shippingCostPerSku * skuCount +
    fulfillmentSettings.perPiecePln +
    fulfillmentSettings.ownCarrierPln +
    palletPerUnit;
  const fulfillmentPerUnit = fulfillmentRaw > 0 ? fulfillmentRaw : null;

  // Zawsze tworzymy Allegro + Sklep — nawet bez ustawionej ceny sprzedaży —
  // bo musimy zapamiętać shipping/fulfillment/packaging z produktu (user
  // wpisze cenę później, koszty już są).
  const channelsToCreate: {
    channel: string;
    salePricePln: number;
    commissionPct: number | null;
    otherCostPln: number | null;
    customerShippingPln: number | null;
    adCostPln: number | null;
  }[] = [
    {
      channel: "Allegro",
      salePricePln: product.defaultSalePriceAllegroPln ?? 0,
      commissionPct:
        product.defaultAllegroCommissionPct ??
        saleDefaults.allegroCommissionPct,
      // INNE (otherCost) dla Allegro fallback do `allegroAdCostPln` z defaultów
      // — domyślne koszty marketing/reklama wpadają tu (a NIE w adCostPln),
      // żeby kalkulator zamówień nie odejmował ich podwójnie. Lista produktów
      // dla Allegro też odejmuje TYLKO otherCost (nie adCost).
      otherCostPln:
        product.defaultAllegroOtherCostPln ?? saleDefaults.allegroAdCostPln,
      customerShippingPln:
        product.defaultAllegroCustomerShippingPln ??
        saleDefaults.allegroCustomerShippingPln,
      // adCost Allegro = null — kalkulator listy produktów go nie odejmuje,
      // więc zamówienia muszą się tym samym matchować. Wartość marketingowa
      // siedzi w otherCostPln (powyżej).
      adCostPln: null,
    },
    {
      channel: "Sklep",
      salePricePln: product.defaultSalePriceSklepPln ?? 0,
      commissionPct:
        product.defaultSklepCommissionPct ?? saleDefaults.sklepCommissionPct,
      otherCostPln: product.defaultSklepOtherCostPln,
      customerShippingPln:
        product.defaultSklepCustomerShippingPln ??
        saleDefaults.sklepCustomerShippingPln,
      adCostPln:
        product.defaultSklepAdCostPln ?? saleDefaults.sklepAdCostPln,
    },
  ];
  await db.itemSaleChannel.createMany({
    data: channelsToCreate.map((c) => ({
      itemId: item.id,
      shippingCostPln: shippingCostPerUnit,
      fulfillmentPln: fulfillmentPerUnit,
      packagingCostPln: packagingPerUnit,
      channel: c.channel,
      salePricePln: c.salePricePln,
      commissionPct: c.commissionPct,
      otherCostPln: c.otherCostPln,
      customerShippingPln: c.customerShippingPln,
      adCostPln: c.adCostPln,
    })),
  });

  revalidatePath(`/zamowienia/${orderId}`);
  await maybeSnapshotOrderPrices(orderId);
  return { ok: true as const, id: item.id };
}

export async function updateOrderItemAction(itemId: string, input: unknown) {
  await requireUser();
  const data = itemSchema.partial().parse(input);

  const item = await db.importOrderItem.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      orderId: true,
      order: { select: { status: true } },
    },
  });
  if (!item) throw new Error("Pozycja nie istnieje.");

  // Lock: zamówienie „W magazynie" zamraża ceny zakupu (USD/CNY + kursy +
  // brutto flag). Reszta pól (ilość, CBM, notatki, monthly sales) edytowalna.
  if (item.order.status === "W_MAGAZYNIE") {
    const lockedFields = [
      "unitPriceUsd",
      "unitPriceCny",
      "cnyToPlnRate",
      "usdToPlnRate",
      "unitPriceIsBrutto",
    ] as const;
    for (const f of lockedFields) {
      if ((data as Record<string, unknown>)[f] !== undefined) {
        throw new Error(
          'Zamówienie jest „W magazynie" — ceny zakupu zamrożone. Cofnij status żeby edytować.',
        );
      }
    }
  }

  // Aktualizuj TYLKO pola obecne w inpucie — pominięte zostają nietknięte.
  // (Dzięki temu inline-edit ilości nie wymazuje ceny/CBM/notatek.)
  const updateData: Record<string, unknown> = {};
  if (data.quantity !== undefined) {
    // Dopuszczamy 0 szt — pozycja zostaje w zamówieniu jako placeholder
    // (po sugestii belek 0×, lub user świadomie chce mieć pozycję 0 szt).
    updateData.quantity = Math.max(0, intOrNull(data.quantity) ?? 0);
  }
  if (data.unitPriceUsd !== undefined) {
    updateData.unitPriceUsd = num(data.unitPriceUsd);
  }
  if (data.unitPriceCny !== undefined) {
    updateData.unitPriceCny = num(data.unitPriceCny);
  }
  if (data.unitPricePln !== undefined) {
    updateData.unitPricePln = num(data.unitPricePln);
  }
  if (data.cnyToPlnRate !== undefined) {
    updateData.cnyToPlnRate = num(data.cnyToPlnRate);
  }
  if (data.usdToPlnRate !== undefined) {
    updateData.usdToPlnRate = num(data.usdToPlnRate);
  }
  if (data.unitPriceIsBrutto !== undefined) {
    updateData.unitPriceIsBrutto = !!data.unitPriceIsBrutto;
  }
  if (data.cbmPerUnit !== undefined) {
    updateData.cbmPerUnit = num(data.cbmPerUnit);
  }
  if (data.expectedMonthlySales !== undefined) {
    updateData.expectedMonthlySales = intOrNull(data.expectedMonthlySales);
  }
  if (data.notes !== undefined) {
    updateData.notes = data.notes?.trim() || null;
  }

  await db.importOrderItem.update({
    where: { id: itemId },
    data: updateData,
  });

  revalidatePath(`/zamowienia/${item.orderId}`);
  await maybeSnapshotOrderPrices(item.orderId);
  return { ok: true as const };
}

export async function deleteOrderItemAction(itemId: string) {
  await requireUser();
  const item = await db.importOrderItem.findUnique({
    where: { id: itemId },
    select: { id: true, orderId: true },
  });
  if (!item) return { ok: true as const };
  await db.importOrderItem.delete({ where: { id: itemId } });
  revalidatePath(`/zamowienia/${item.orderId}`);
  await maybeSnapshotOrderPrices(item.orderId);
  return { ok: true as const };
}

// ─── Variant splits dla bundli (Compositionmode=KOMPONENTOWY) ────────

const variantSplitInputSchema = z.object({
  productComponentId: z.string().min(1),
  splits: z
    .array(
      z.object({
        variantProductId: z.string().min(1),
        units: z.coerce.number().int().min(1),
      }),
    )
    .min(1),
});

/**
 * Zapisuje rozbicie wariantów dla JEDNEGO slotu bundla na linii zamówienia.
 * Replace-all: usuwa stare splity dla tego (orderItem, slot) i wstawia nowe.
 *
 * Walidacja:
 *  - produkt linii musi być KOMPONENTOWY
 *  - slot (`productComponentId`) musi należeć do produktu linii
 *  - każdy `variantProductId` musi być w tej samej kategorii co domyślny
 *    komponent slotu (pool wariantów)
 *  - suma `units` musi równać się `orderItem.quantity` (bo na 1 bundle
 *    przypada `slot.quantity` szt, więc dla slotu obowiązuje "po wybranym
 *    wariancie ile bundli skompletowano")
 */
export async function setOrderItemVariantSplitsAction(
  orderItemId: string,
  input: unknown,
) {
  await requireUser();
  const data = variantSplitInputSchema.parse(input);

  const item = await db.importOrderItem.findUnique({
    where: { id: orderItemId },
    select: {
      id: true,
      orderId: true,
      quantity: true,
      product: { select: { id: true, compositionMode: true } },
    },
  });
  if (!item) throw new Error("Linia zamówienia nie istnieje.");
  if (item.product.compositionMode !== "KOMPONENTOWY") {
    throw new Error(
      "Warianty można konfigurować tylko dla produktów składania KOMPONENTOWY.",
    );
  }

  const slot = await db.productComponent.findUnique({
    where: { id: data.productComponentId },
    select: {
      id: true,
      productId: true,
      componentId: true,
      allowVariants: true,
    },
  });
  if (!slot) throw new Error("Slot bundla nie istnieje.");
  if (slot.productId !== item.product.id) {
    throw new Error("Slot nie należy do produktu tej linii.");
  }

  if (!slot.allowVariants) {
    // Slot oznaczony jako "Tylko ten produkt" — jedyny dopuszczalny wariant
    // to domyślny komponent slotu.
    for (const sp of data.splits) {
      if (sp.variantProductId !== slot.componentId) {
        throw new Error(
          "Slot nie dopuszcza wariantów — wszystkie sztuki muszą być z domyślnego komponentu.",
        );
      }
    }
  }

  const totalUnits = data.splits.reduce((s, x) => s + x.units, 0);
  if (totalUnits !== item.quantity) {
    throw new Error(
      `Suma sztuk wariantów (${totalUnits}) musi się równać ilości bundli (${item.quantity}).`,
    );
  }

  // Walidacja puli wariantów (multi-source: poolCategories + descendants + poolProducts + fallback)
  if (slot.allowVariants) {
    const allowedIds = await resolveSlotPoolProductIds(slot.id);
    for (const sp of data.splits) {
      if (!allowedIds.has(sp.variantProductId)) {
        throw new Error(
          `Wariant ${sp.variantProductId} nie należy do puli slotu.`,
        );
      }
    }
  }

  // Replace-all w transakcji
  await db.$transaction([
    db.orderItemVariantSplit.deleteMany({
      where: {
        orderItemId,
        productComponentId: data.productComponentId,
      },
    }),
    db.orderItemVariantSplit.createMany({
      data: data.splits.map((s) => ({
        orderItemId,
        productComponentId: data.productComponentId,
        variantProductId: s.variantProductId,
        units: s.units,
      })),
    }),
  ]);

  revalidatePath(`/zamowienia/${item.orderId}`);
  return { ok: true as const };
}

/** Resetuje warianty slotu do domyślu — usuwa wszystkie splity. */
export async function clearOrderItemVariantSplitsAction(
  orderItemId: string,
  productComponentId: string,
) {
  await requireUser();
  const item = await db.importOrderItem.findUnique({
    where: { id: orderItemId },
    select: { id: true, orderId: true },
  });
  if (!item) return { ok: true as const };

  await db.orderItemVariantSplit.deleteMany({
    where: { orderItemId, productComponentId },
  });
  revalidatePath(`/zamowienia/${item.orderId}`);
  return { ok: true as const };
}

/**
 * Reorder pozycji zamówienia drag-and-dropem. Zapisuje sortOrder
 * w kolejności podanej w `itemIds` (od 0).
 */
export async function reorderOrderItemsAction(
  orderId: string,
  itemIds: string[],
): Promise<{ ok: true }> {
  await requireUser();
  // Walidacja: wszystkie pozycje muszą należeć do tego zamówienia.
  const owned = await db.importOrderItem.findMany({
    where: { orderId, id: { in: itemIds } },
    select: { id: true },
  });
  const ownedIds = new Set(owned.map((i) => i.id));
  const validIds = itemIds.filter((id) => ownedIds.has(id));
  // Interactive transaction (callback form) — driver-adapter Prisma 7 nie
  // przyjmuje tablicy promes z driver-adapter w sposób stabilny.
  await db.$transaction(async (tx) => {
    for (let i = 0; i < validIds.length; i++) {
      await tx.importOrderItem.update({
        where: { id: validIds[i] },
        data: { sortOrder: i },
      });
    }
  });
  revalidatePath(`/zamowienia/${orderId}`);
  return { ok: true as const };
}

/**
 * Lazy backfill — uzupełnia w kanałach Allegro/Sklep pola, które są puste
 * (null), używając aktualnych defaultów z produktu + ustawień fulfillmentu.
 * Wartości ustawione przez usera (≠ null) NIE są nadpisywane.
 *
 * Wołane przy każdym otwarciu /zamowienia/[id] — pozycje dodane wcześniej
 * (przed uzupełnieniem defaultów na produkcie) zaczynają korzystać z aktualnych
 * danych bez ręcznego klikania.
 */
export async function backfillOrderItemDefaults(orderId: string): Promise<void> {
  const fulfillmentSettings = await getFulfillmentSettings();
  const saleDefaults = await getSaleChannelDefaults();
  const courierRates = await db.courierRate.findMany({
    where: { courier: { active: true } },
    include: { courier: { select: { id: true, name: true } } },
    orderBy: { pricePln: "asc" },
  });

  const items = await db.importOrderItem.findMany({
    where: { orderId },
    include: {
      product: {
        select: {
          weightKg: true,
          unitsPerPallet: true,
          preferredShippingServices: true,
          defaultSalePriceAllegroPln: true,
          defaultSalePriceSklepPln: true,
          defaultAllegroCommissionPct: true,
          defaultSklepCommissionPct: true,
          defaultAllegroOtherCostPln: true,
          defaultSklepOtherCostPln: true,
          defaultAllegroCustomerShippingPln: true,
          defaultSklepCustomerShippingPln: true,
          defaultSklepAdCostPln: true,
          shippingBoxes: {
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
            select: {
              isPrimary: true,
              unitsPerBox: true,
              purpose: true,
              box: {
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
            },
          },
          _count: { select: { components: true } },
        },
      },
      saleChannels: true,
    },
  });

  for (const item of items) {
    const product = item.product;
    const shippingPins = product.shippingBoxes.filter(
      (b) => b.purpose === "SHIPPING",
    );
    const factoryPins = product.shippingBoxes.filter(
      (b) => b.purpose === "FACTORY",
    );
    // Karton — tylko SHIPPING z purchasePricePln liczy się w koszt.
    // Gdy nie ma SHIPPING ale jest FACTORY → koszt 0 (produkt w fabrycznym).
    const primaryBoxLink =
      shippingPins.find(
        (b) => b.isPrimary && b.box.purchasePricePln != null,
      ) ??
      shippingPins.find((b) => b.box.purchasePricePln != null) ??
      null;
    const packagingPerUnit = primaryBoxLink
      ? primaryBoxLink.box.purchasePricePln != null &&
        primaryBoxLink.unitsPerBox > 0
        ? primaryBoxLink.box.purchasePricePln / primaryBoxLink.unitsPerBox
        : null
      : factoryPins.length > 0
        ? 0
        : null;

    // Kurier — silnik InPost+DHL. Preferowane SHIPPING isPrimary, fallback
    // SHIPPING any → FACTORY isPrimary → FACTORY any (produkt wysyłany w pudle
    // z Chin gdy nie ma osobnego wysyłkowego).
    const primaryBoxForCourier =
      shippingPins.find((b) => b.isPrimary) ??
      shippingPins[0] ??
      factoryPins.find((b) => b.isPrimary) ??
      factoryPins[0] ??
      null;
    let shippingCostPerUnit: number | null = null;
    if (primaryBoxForCourier) {
      const quote = quoteShippingForProduct({
        productWeightKg: product.weightKg,
        primaryBox: {
          widthCm: primaryBoxForCourier.box.widthCm,
          heightCm: primaryBoxForCourier.box.heightCm,
          depthCm: primaryBoxForCourier.box.depthCm,
          weightKg: primaryBoxForCourier.box.weightKg,
        },
        preferredServiceCodes: product.preferredShippingServices,
      });
      shippingCostPerUnit = quote?.primary?.totalNetPln ?? null;
    }
    // Fallback legacy (gdy silnik nie zwrócił wyniku) — z CourierRate.
    if (shippingCostPerUnit == null && shippingPins.length > 0) {
      const legacyOptions = calculateShipping(
        { weightKg: product.weightKg },
        1,
        shippingPins.map((pb) => ({
          box: pb.box,
          unitsPerBox: pb.unitsPerBox,
          isPrimary: pb.isPrimary,
        })),
        courierRates,
      );
      const primaryShipping =
        legacyOptions.find((o) => o.isPrimary && o.cheapest) ??
        legacyOptions.find((o) => o.cheapest) ??
        null;
      shippingCostPerUnit =
        primaryShipping?.cheapest && primaryShipping.unitsPerBox > 0
          ? primaryShipping.cheapest.pricePerBox / primaryShipping.unitsPerBox
          : null;
    }
    // Fulfillment — model umowy E-Packman (otwarcie + SKU × n + perSztuka
    // + własna umowa kuriera + magazyn palety / unitsPerPallet).
    const skuCount = Math.max(1, product._count.components || 1);
    const palletPerUnit =
      product.unitsPerPallet && product.unitsPerPallet > 0
        ? fulfillmentSettings.palletStorageCostPerMonth / product.unitsPerPallet
        : 0;
    const fulfillmentRaw =
      fulfillmentSettings.orderOpeningCost +
      fulfillmentSettings.shippingCostPerSku * skuCount +
      fulfillmentSettings.perPiecePln +
      fulfillmentSettings.ownCarrierPln +
      palletPerUnit;
    const fulfillmentPerUnit = fulfillmentRaw > 0 ? fulfillmentRaw : null;

    // Per kanał — uzupełnij brakujące pola, zachowując ustawienia usera.
    const channelDefaults: Record<
      string,
      {
        salePrice: number | null;
        commissionPct: number | null;
        otherCost: number | null;
        customerShipping: number | null;
        adCost: number | null;
      }
    > = {
      Allegro: {
        salePrice: product.defaultSalePriceAllegroPln,
        commissionPct:
          product.defaultAllegroCommissionPct ??
          saleDefaults.allegroCommissionPct,
        // INNE Allegro fallback do allegroAdCostPln (marketing/reklama
        // wpadają tu, nie do adCost). Konsystencja z listą produktów.
        otherCost:
          product.defaultAllegroOtherCostPln ?? saleDefaults.allegroAdCostPln,
        customerShipping:
          product.defaultAllegroCustomerShippingPln ??
          saleDefaults.allegroCustomerShippingPln,
        // adCost Allegro = null — match z formułą listy produktów (nie odejmuje
        // adCost). Wartość marketingowa siedzi w otherCost (powyżej).
        adCost: null,
      },
      Sklep: {
        salePrice: product.defaultSalePriceSklepPln,
        commissionPct:
          product.defaultSklepCommissionPct ?? saleDefaults.sklepCommissionPct,
        otherCost: product.defaultSklepOtherCostPln,
        customerShipping:
          product.defaultSklepCustomerShippingPln ??
          saleDefaults.sklepCustomerShippingPln,
        adCost:
          product.defaultSklepAdCostPln ?? saleDefaults.sklepAdCostPln,
      },
    };

    // Zapewniamy istnienie obu kanałów dla starych pozycji
    const existingChannels = new Set(item.saleChannels.map((c) => c.channel));
    for (const channelName of ["Allegro", "Sklep"]) {
      if (!existingChannels.has(channelName)) {
        const defs = channelDefaults[channelName];
        await db.itemSaleChannel.create({
          data: {
            itemId: item.id,
            channel: channelName,
            salePricePln: defs.salePrice ?? 0,
            commissionPct: defs.commissionPct,
            shippingCostPln: shippingCostPerUnit,
            fulfillmentPln: fulfillmentPerUnit,
            packagingCostPln: packagingPerUnit,
            otherCostPln: defs.otherCost,
            customerShippingPln: defs.customerShipping,
            adCostPln: defs.adCost,
          },
        });
      }
    }

    // Update istniejących — tylko pola obecnie puste (null lub 0 dla ceny)
    for (const ch of item.saleChannels) {
      const defs = channelDefaults[ch.channel];
      if (!defs) continue;
      const updates: Record<string, number | null> = {};
      // Sale price: tylko jeśli 0 (default produktu nie jest ustawiony to też 0
      // i nic się nie zmieni)
      if (
        (ch.salePricePln == null || ch.salePricePln === 0) &&
        defs.salePrice != null &&
        defs.salePrice > 0
      ) {
        updates.salePricePln = defs.salePrice;
      }
      if (ch.commissionPct == null && defs.commissionPct != null) {
        updates.commissionPct = defs.commissionPct;
      }
      if (ch.otherCostPln == null && defs.otherCost != null) {
        updates.otherCostPln = defs.otherCost;
      }
      if (ch.customerShippingPln == null && defs.customerShipping != null) {
        updates.customerShippingPln = defs.customerShipping;
      }
      if (ch.adCostPln == null && defs.adCost != null) {
        updates.adCostPln = defs.adCost;
      }
      // Wspólne (z produktu / settings).
      // 0 traktujemy jak null — to są wartości z poprzedniego backfillu który
      // nie znalazł boxa; teraz mamy fallback do FACTORY i silnik InPost+DHL,
      // więc nadpisujemy.
      if (
        (ch.shippingCostPln == null || ch.shippingCostPln === 0) &&
        shippingCostPerUnit != null &&
        shippingCostPerUnit > 0
      ) {
        updates.shippingCostPln = shippingCostPerUnit;
      }
      if (ch.fulfillmentPln == null && fulfillmentPerUnit != null) {
        updates.fulfillmentPln = fulfillmentPerUnit;
      }
      // Packaging: 0 to legitne wartość (FACTORY box → 0 zł), więc nie nadpisuj 0.
      if (ch.packagingCostPln == null && packagingPerUnit != null) {
        updates.packagingCostPln = packagingPerUnit;
      }
      if (Object.keys(updates).length > 0) {
        await db.itemSaleChannel.update({
          where: { id: ch.id },
          data: updates,
        });
      }
    }
  }
}

// ─── Sale channels (Allegro / Sklep / …) ────────────────────────────

const channelSchema = z.object({
  channel: z.string().min(1, "Podaj nazwę kanału"),
  salePricePln: z.union([z.string(), z.number()]),
  commissionPct: z.union([z.string(), z.number()]).optional().nullable(),
  commissionFlat: z.union([z.string(), z.number()]).optional().nullable(),
  shippingCostPln: z.union([z.string(), z.number()]).optional().nullable(),
  fulfillmentPln: z.union([z.string(), z.number()]).optional().nullable(),
  adCostPln: z.union([z.string(), z.number()]).optional().nullable(),
  otherCostPln: z.union([z.string(), z.number()]).optional().nullable(),
  shareOfQty: z.union([z.string(), z.number()]).optional().nullable(),
});

export async function addItemSaleChannelAction(
  itemId: string,
  input: unknown,
) {
  await requireUser();
  const data = channelSchema.parse(input);

  const item = await db.importOrderItem.findUnique({
    where: { id: itemId },
    select: { id: true, orderId: true },
  });
  if (!item) throw new Error("Pozycja nie istnieje.");

  // shareOfQty wyrażone w % (0..100) → zapisujemy 0..1
  const sharePct = num(data.shareOfQty);
  const share = sharePct != null ? clamp01(sharePct / 100) : null;

  await db.itemSaleChannel.create({
    data: {
      itemId,
      channel: data.channel.trim(),
      salePricePln: num(data.salePricePln) ?? 0,
      commissionPct:
        num(data.commissionPct) != null ? (num(data.commissionPct) as number) / 100 : null,
      commissionFlat: num(data.commissionFlat),
      shippingCostPln: num(data.shippingCostPln),
      fulfillmentPln: num(data.fulfillmentPln),
      adCostPln: num(data.adCostPln),
      otherCostPln: num(data.otherCostPln),
      shareOfQty: share,
    },
  });

  revalidatePath(`/zamowienia/${item.orderId}`);
  return { ok: true as const };
}

export async function updateItemSaleChannelAction(
  channelId: string,
  input: unknown,
) {
  await requireUser();
  const data = channelSchema.parse(input);

  const channel = await db.itemSaleChannel.findUnique({
    where: { id: channelId },
    include: { item: { select: { orderId: true } } },
  });
  if (!channel) throw new Error("Kanał nie istnieje.");

  const sharePct = num(data.shareOfQty);
  await db.itemSaleChannel.update({
    where: { id: channelId },
    data: {
      channel: data.channel.trim(),
      salePricePln: num(data.salePricePln) ?? 0,
      commissionPct:
        num(data.commissionPct) != null ? (num(data.commissionPct) as number) / 100 : null,
      commissionFlat: num(data.commissionFlat),
      shippingCostPln: num(data.shippingCostPln),
      fulfillmentPln: num(data.fulfillmentPln),
      adCostPln: num(data.adCostPln),
      otherCostPln: num(data.otherCostPln),
      shareOfQty: sharePct != null ? clamp01(sharePct / 100) : null,
    },
  });

  revalidatePath(`/zamowienia/${channel.item.orderId}`);
  return { ok: true as const };
}

/** Aktualizuje pojedyncze pole numeryczne na ItemSaleChannel — używane przez
 *  EditablePriceInput popover. Wszystkie pola PLN trzymamy w NETTO. */
export async function updateChannelFieldAction(
  channelId: string,
  field:
    | "salePricePln"
    | "shippingCostPln"
    | "fulfillmentPln"
    | "adCostPln"
    | "otherCostPln"
    | "packagingCostPln"
    | "customerShippingPln"
    | "commissionPct",
  // PLN: netto value. commissionPct: fraction 0..1 (np. 0.045 = 4.5%).
  rawValue: number | null,
) {
  await requireUser();
  const channel = await db.itemSaleChannel.findUnique({
    where: { id: channelId },
    include: { item: { select: { orderId: true } } },
  });
  if (!channel) throw new Error("Kanał nie istnieje.");
  // salePricePln nie może być null (kolumna NOT NULL) — fallback do 0
  const value = field === "salePricePln" ? (rawValue ?? 0) : rawValue;
  await db.itemSaleChannel.update({
    where: { id: channelId },
    data: { [field]: value },
  });
  revalidatePath(`/zamowienia/${channel.item.orderId}`);
  return { ok: true as const };
}

export async function deleteItemSaleChannelAction(channelId: string) {
  await requireUser();
  const channel = await db.itemSaleChannel.findUnique({
    where: { id: channelId },
    include: { item: { select: { orderId: true } } },
  });
  if (!channel) return { ok: true as const };
  await db.itemSaleChannel.delete({ where: { id: channelId } });
  revalidatePath(`/zamowienia/${channel.item.orderId}`);
  return { ok: true as const };
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * Upsert kanału sprzedaży po nazwie (Allegro/Sklep) — używane do inline
 * edycji w tabeli pozycji.
 */
export async function upsertItemChannelAction(
  itemId: string,
  channelName: string,
  patch: {
    salePricePln?: number | string | null;
    commissionPct?: number | string | null;
    shippingCostPln?: number | string | null;
    fulfillmentPln?: number | string | null;
    adCostPln?: number | string | null;
    otherCostPln?: number | string | null;
    customerShippingPln?: number | string | null;
    shareOfQty?: number | string | null;
  },
) {
  await requireUser();
  const item = await db.importOrderItem.findUnique({
    where: { id: itemId },
    select: { id: true, orderId: true },
  });
  if (!item) throw new Error("Pozycja nie istnieje.");

  const existing = await db.itemSaleChannel.findFirst({
    where: { itemId, channel: channelName },
  });

  // Konwertujemy procenty UI (0-100) na 0..1
  const commissionPctInput = num(patch.commissionPct);
  const commissionPct =
    commissionPctInput != null ? commissionPctInput / 100 : null;
  const shareOfQtyInput = num(patch.shareOfQty);
  const shareOfQty =
    shareOfQtyInput != null ? clamp01(shareOfQtyInput / 100) : null;

  const data = {
    salePricePln: num(patch.salePricePln) ?? 0,
    commissionPct,
    shippingCostPln: num(patch.shippingCostPln),
    fulfillmentPln: num(patch.fulfillmentPln),
    adCostPln: num(patch.adCostPln),
    otherCostPln: num(patch.otherCostPln),
    customerShippingPln: num(patch.customerShippingPln),
    shareOfQty,
  };

  if (existing) {
    await db.itemSaleChannel.update({
      where: { id: existing.id },
      data,
    });
  } else {
    await db.itemSaleChannel.create({
      data: {
        itemId,
        channel: channelName,
        ...data,
      },
    });
  }

  revalidatePath(`/zamowienia/${item.orderId}`);
  return { ok: true as const };
}

/**
 * Wspólna wysyłka — ta sama wartość dla Allegro i Sklep.
 * Tworzy kanały jeśli nie istnieją.
 */
export async function setItemShippingAction(
  itemId: string,
  shippingCostPln: number | string,
) {
  await requireUser();
  const item = await db.importOrderItem.findUnique({
    where: { id: itemId },
    select: { id: true, orderId: true },
  });
  if (!item) throw new Error("Pozycja nie istnieje.");

  const value = num(shippingCostPln);
  const channelNames = ["Allegro", "Sklep"];

  const existing = await db.itemSaleChannel.findMany({
    where: { itemId, channel: { in: channelNames } },
    select: { id: true, channel: true },
  });
  const existingSet = new Set(existing.map((c) => c.channel));
  const toCreate = channelNames.filter((c) => !existingSet.has(c));

  await db.$transaction(async (tx) => {
    // Aktualizuj istniejące
    await tx.itemSaleChannel.updateMany({
      where: { itemId, channel: { in: channelNames } },
      data: { shippingCostPln: value },
    });
    // Utwórz brakujące z pustymi cenami
    for (const channel of toCreate) {
      await tx.itemSaleChannel.create({
        data: {
          itemId,
          channel,
          salePricePln: 0,
          shippingCostPln: value,
        },
      });
    }
  });

  revalidatePath(`/zamowienia/${item.orderId}`);
  return { ok: true as const };
}

/**
 * Wspólny koszt kartonu wysyłkowego — ta sama wartość dla Allegro i Sklep.
 */
export async function setItemPackagingAction(
  itemId: string,
  packagingCostPln: number | string,
) {
  await requireUser();
  const item = await db.importOrderItem.findUnique({
    where: { id: itemId },
    select: { id: true, orderId: true },
  });
  if (!item) throw new Error("Pozycja nie istnieje.");

  const value = num(packagingCostPln);
  const channelNames = ["Allegro", "Sklep"];

  const existing = await db.itemSaleChannel.findMany({
    where: { itemId, channel: { in: channelNames } },
    select: { id: true, channel: true },
  });
  const existingSet = new Set(existing.map((c) => c.channel));
  const toCreate = channelNames.filter((c) => !existingSet.has(c));

  await db.$transaction(async (tx) => {
    await tx.itemSaleChannel.updateMany({
      where: { itemId, channel: { in: channelNames } },
      data: { packagingCostPln: value },
    });
    for (const channel of toCreate) {
      await tx.itemSaleChannel.create({
        data: {
          itemId,
          channel,
          salePricePln: 0,
          packagingCostPln: value,
        },
      });
    }
  });

  revalidatePath(`/zamowienia/${item.orderId}`);
  return { ok: true as const };
}

/**
 * Wspólny fulfillment — ta sama wartość dla Allegro i Sklep.
 */
export async function setItemFulfillmentAction(
  itemId: string,
  fulfillmentPln: number | string,
) {
  await requireUser();
  const item = await db.importOrderItem.findUnique({
    where: { id: itemId },
    select: { id: true, orderId: true },
  });
  if (!item) throw new Error("Pozycja nie istnieje.");

  const value = num(fulfillmentPln);
  const channelNames = ["Allegro", "Sklep"];

  const existing = await db.itemSaleChannel.findMany({
    where: { itemId, channel: { in: channelNames } },
    select: { id: true, channel: true },
  });
  const existingSet = new Set(existing.map((c) => c.channel));
  const toCreate = channelNames.filter((c) => !existingSet.has(c));

  await db.$transaction(async (tx) => {
    await tx.itemSaleChannel.updateMany({
      where: { itemId, channel: { in: channelNames } },
      data: { fulfillmentPln: value },
    });
    for (const channel of toCreate) {
      await tx.itemSaleChannel.create({
        data: {
          itemId,
          channel,
          salePricePln: 0,
          fulfillmentPln: value,
        },
      });
    }
  });

  revalidatePath(`/zamowienia/${item.orderId}`);
  return { ok: true as const };
}

// ─── Apply bolt suggestion (PL materiały) ───────────────────────────

const boltDeltaSchema = z.object({
  lengthM: z.number().positive(),
  delta: z.number().int(),
});

const applyBoltSuggestionSchema = z.object({
  orderId: z.string().min(1),
  color: z.string().min(1),
  changes: z.array(boltDeltaSchema).min(1),
});

/** Mapuje (color, lengthM) na SKU produktu materiałowego.
 *   - lengthM = 4 → M-KH-150-4M-{COLOR} (hamak dla dzieci)
 *   - inaczej   → M-AS-150-{N}M-{COLOR} (szarfa) */
function skuForMaterial(color: string, lengthM: number): string {
  const prefix = lengthM === 4 ? "KH" : "AS";
  return `M-${prefix}-150-${lengthM}M-${color.toUpperCase()}`;
}

/**
 * Stosuje sugestię silnika belek do zamówienia PL — masowo dodaje/usuwa
 * sztuki materiału danego koloru o wybranych długościach. Dla każdej zmiany:
 *   • znajduje produkt po wyliczonym SKU,
 *   • znajduje istniejącą pozycję w zamówieniu (lub tworzy nową),
 *   • zmienia ilość (delta > 0 = dosypuje, delta < 0 = usuwa).
 *   • gdy nowa ilość ≤ 0 → kasuje pozycję.
 */
export async function applyBoltSuggestionAction(input: unknown) {
  await requireUser();
  const data = applyBoltSuggestionSchema.parse(input);

  const order = await db.importOrder.findUnique({
    where: { id: data.orderId },
    select: { id: true, companyId: true, country: true },
  });
  if (!order) throw new Error("Zamówienie nie istnieje.");

  // Pobierz wszystkie potrzebne produkty jednym zapytaniem.
  const skus = data.changes.map((c) =>
    skuForMaterial(data.color, c.lengthM),
  );
  const products = await db.product.findMany({
    where: { companyId: order.companyId, productCode: { in: skus } },
    select: {
      id: true,
      productCode: true,
      cbmPerUnit: true,
      defaultUnitPricePln: true,
    },
  });
  const productBySku = new Map(products.map((p) => [p.productCode, p]));

  const itemsInOrder = await db.importOrderItem.findMany({
    where: { orderId: data.orderId },
    select: { id: true, productId: true, quantity: true, sortOrder: true },
  });
  let nextSort =
    (itemsInOrder.reduce((m, i) => Math.max(m, i.sortOrder), -1) ?? -1) + 1;

  const summary: string[] = [];
  for (const ch of data.changes) {
    const sku = skuForMaterial(data.color, ch.lengthM);
    const prod = productBySku.get(sku);
    if (!prod) {
      throw new Error(`Brak produktu ${sku} w katalogu.`);
    }
    const existing = itemsInOrder.find((i) => i.productId === prod.id);
    if (ch.delta > 0) {
      if (existing) {
        await db.importOrderItem.update({
          where: { id: existing.id },
          data: { quantity: existing.quantity + ch.delta },
        });
        summary.push(`+${ch.delta}× ${ch.lengthM}m`);
      } else {
        await db.importOrderItem.create({
          data: {
            orderId: data.orderId,
            productId: prod.id,
            quantity: ch.delta,
            unitPricePln: prod.defaultUnitPricePln,
            cbmPerUnit: prod.cbmPerUnit,
            sortOrder: nextSort++,
          },
        });
        summary.push(`+${ch.delta}× ${ch.lengthM}m (nowa pozycja)`);
      }
    } else if (ch.delta < 0) {
      if (!existing) {
        throw new Error(
          `Nie można usunąć ${-ch.delta}× ${ch.lengthM}m — brak w zamówieniu.`,
        );
      }
      const newQty = existing.quantity + ch.delta;
      if (newQty >= 0) {
        // 0 szt — zostawiamy pozycję w zamówieniu (NIE usuwamy), żeby user
        // mógł później zwiększyć ilość bez ponownego wybierania produktu.
        await db.importOrderItem.update({
          where: { id: existing.id },
          data: { quantity: newQty },
        });
        summary.push(
          newQty === 0
            ? `${ch.delta}× ${ch.lengthM}m (0 szt — pozycja zostaje)`
            : `${ch.delta}× ${ch.lengthM}m`,
        );
      } else {
        throw new Error(
          `Nie można usunąć ${-ch.delta}× ${ch.lengthM}m — w zamówieniu jest tylko ${existing.quantity}.`,
        );
      }
    }
  }

  revalidatePath(`/zamowienia/${data.orderId}`);
  revalidatePath(`/zamowienia/z-polski/${data.orderId}`);
  await maybeSnapshotOrderPrices(data.orderId);
  return { ok: true as const, summary: summary.join(", ") };
}
