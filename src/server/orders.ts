"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";
import {
  ORDER_STATUSES,
  canDeleteOrder,
  type OrderStatusT,
} from "@/lib/order-status";
import { kalkulujKontener } from "@/lib/kalkulacje";
import { resolveCustomsDutyPct } from "@/lib/customs-duty";

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Brak autoryzacji");
  return session.user as { id: string };
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function dateOrNull(v: unknown): Date | null {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const orderHeaderSchema = z.object({
  name: z.string().optional().nullable(),
  country: z.enum(["CHINA", "POLAND"]).optional(),
  cnyToPlnRate: z.union([z.string(), z.number()]).optional().nullable(),
  usdToPlnRate: z.union([z.string(), z.number()]).optional().nullable(),
  eurToPlnRate: z.union([z.string(), z.number()]).optional().nullable(),
  vatRate: z.union([z.string(), z.number()]).optional().nullable(),
  containerType: z.enum(["TWENTY_FT", "FORTY_FT", "CUSTOM"]).optional(),
  containerSizeM3: z.union([z.string(), z.number()]).optional().nullable(),
  estimatedProductionDays: z.union([z.string(), z.number()]).optional().nullable(),
  notes: z.string().optional().nullable(),
});

async function nextOrderNumber(companyId: string): Promise<string> {
  const year = new Date().getFullYear();
  // Bierzemy max sufiks numeryczny z istniejących numerów, nie count — usunięte
  // numery zostawiają dziury i count+1 trafia w żywy rekord (unique violation).
  const existing = await db.importOrder.findMany({
    where: {
      companyId,
      orderNumber: { startsWith: `${year}-` },
    },
    select: { orderNumber: true },
  });
  let maxSeq = 0;
  for (const o of existing) {
    const m = o.orderNumber.match(/^\d{4}-(\d+)$/);
    if (m) {
      const n = Number.parseInt(m[1], 10);
      if (Number.isFinite(n) && n > maxSeq) maxSeq = n;
    }
  }
  return `${year}-${String(maxSeq + 1).padStart(4, "0")}`;
}

export async function createOrderAction(input: unknown) {
  const user = await requireUser();
  const companyId = await getCurrentCompanyId();
  const data = orderHeaderSchema.parse(input);

  const order = await db.importOrder.create({
    data: {
      companyId,
      orderNumber: await nextOrderNumber(companyId),
      name: data.name?.trim() || null,
      country: data.country ?? "CHINA",
      createdById: user.id,
      cnyToPlnRate: num(data.cnyToPlnRate),
      usdToPlnRate: num(data.usdToPlnRate),
      eurToPlnRate: num(data.eurToPlnRate),
      vatRate: num(data.vatRate) ?? 0.23,
      containerType: data.containerType ?? "TWENTY_FT",
      containerSizeM3: num(data.containerSizeM3) ?? 28,
      estimatedProductionDays:
        num(data.estimatedProductionDays) != null
          ? Math.trunc(num(data.estimatedProductionDays) as number)
          : null,
      notes: data.notes?.trim() || null,
    },
  });

  await db.orderStatusHistory.create({
    data: {
      orderId: order.id,
      fromStatus: null,
      toStatus: "PLANOWANE",
      changedById: user.id,
    },
  });

  // Domyślne 3 transze opłaty za towar 30/40/30
  await db.orderGoodsTranche.createMany({
    data: [
      { orderId: order.id, phase: "PRE_PRODUCTION", percentage: 0.3 },
      { orderId: order.id, phase: "POST_PRODUCTION", percentage: 0.4 },
      { orderId: order.id, phase: "IN_PORT", percentage: 0.3 },
    ],
  });

  // Sekcje wytycznych są pobierane LIVE z szablonu firmy przy generowaniu
  // PDF i renderowaniu zakładki — nie kopiujemy ich do zamówienia. Edycja
  // szablonu od razu propaguje się do wszystkich zamówień.

  revalidatePath("/zamowienia");
  return { ok: true as const, id: order.id, orderNumber: order.orderNumber };
}

export async function updateOrderHeaderAction(id: string, input: unknown) {
  await requireUser();
  const data = orderHeaderSchema.parse(input);

  const dateFields = z
    .object({
      orderedAt: z.string().optional().nullable(),
      productionStartAt: z.string().optional().nullable(),
      productionEndAt: z.string().optional().nullable(),
      shippedAt: z.string().optional().nullable(),
      arrivedPortAt: z.string().optional().nullable(),
      arrivedWarehouseAt: z.string().optional().nullable(),
      closedAt: z.string().optional().nullable(),
    })
    .parse(input);

  await db.importOrder.update({
    where: { id },
    data: {
      name: data.name?.trim() || null,
      cnyToPlnRate: num(data.cnyToPlnRate),
      usdToPlnRate: num(data.usdToPlnRate),
      eurToPlnRate: num(data.eurToPlnRate),
      vatRate: num(data.vatRate),
      ...(data.containerType ? { containerType: data.containerType } : {}),
      containerSizeM3: num(data.containerSizeM3),
      estimatedProductionDays:
        num(data.estimatedProductionDays) != null
          ? Math.trunc(num(data.estimatedProductionDays) as number)
          : null,
      notes: data.notes?.trim() || null,
      orderedAt: dateOrNull(dateFields.orderedAt),
      productionStartAt: dateOrNull(dateFields.productionStartAt),
      productionEndAt: dateOrNull(dateFields.productionEndAt),
      shippedAt: dateOrNull(dateFields.shippedAt),
      arrivedPortAt: dateOrNull(dateFields.arrivedPortAt),
      arrivedWarehouseAt: dateOrNull(dateFields.arrivedWarehouseAt),
      closedAt: dateOrNull(dateFields.closedAt),
    },
  });

  revalidatePath(`/zamowienia/${id}`);
  revalidatePath("/zamowienia");
  return { ok: true as const };
}

export async function changeOrderStatusAction(
  id: string,
  toStatus: OrderStatusT,
  note?: string,
) {
  const user = await requireUser();
  if (!ORDER_STATUSES.includes(toStatus)) {
    throw new Error("Nieprawidłowy status.");
  }
  const order = await db.importOrder.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!order) throw new Error("Zamówienie nie istnieje.");
  if (order.status === toStatus) {
    return { ok: true as const };
  }

  const now = new Date();
  const autoStamp: Partial<{
    orderedAt: Date;
    shippedAt: Date;
    arrivedPortAt: Date;
    arrivedWarehouseAt: Date;
    closedAt: Date;
  }> = {};
  if (toStatus === "PRODUKOWANE") autoStamp.orderedAt = now;
  if (toStatus === "WYSLANE") autoStamp.shippedAt = now;
  if (toStatus === "ODEBRANE") autoStamp.arrivedPortAt = now;
  if (toStatus === "W_MAGAZYNIE") {
    autoStamp.arrivedWarehouseAt = now;
    // UWAGA: NIE stampujemy `closedAt` automatycznie — zamknięcie zamówienia
    // jest osobną akcją `closeOrderAction()`, wymaga uzupełnienia płatności
    // i dokumentów.
  }

  await db.$transaction(async (tx) => {
    await tx.importOrder.update({
      where: { id },
      data: { status: toStatus, ...autoStamp },
    });
    await tx.orderStatusHistory.create({
      data: {
        orderId: id,
        fromStatus: order.status,
        toStatus,
        changedById: user.id,
        note: note?.trim() || null,
      },
    });
  });

  // Snapshot cen do ProductPriceHistory na KAŻDYM statusie >= DOGADYWANE.
  // Lista produktów czyta z tego snapshotu (bez live calc), więc zamówienia
  // w DOGADYWANE/PRODUKOWANE/WYSLANE/ODEBRANE/W_MAGAZYNIE też się tam
  // pojawiają. Upsert per (productId, orderId) — każde przejście statusu
  // odświeża snapshot na bieżąco.
  const SNAPSHOT_FROM_STATUSES: OrderStatusT[] = [
    "DOGADYWANE",
    "PRODUKOWANE",
    "WYPRODUKOWANE",
    "WYSLANE",
    "ODEBRANE",
    "W_MAGAZYNIE",
  ];
  if (SNAPSHOT_FROM_STATUSES.includes(toStatus)) {
    await snapshotOrderPricesToHistory(id);
  }

  revalidatePath(`/zamowienia/${id}`);
  revalidatePath("/zamowienia");
  revalidatePath("/produkty");
  return { ok: true as const };
}

/**
 * Wywołaj na końcu KAŻDEJ akcji która zmienia coś wpływającego na landed cost
 * (ceny pozycji, kursy, koszty, transze). Sprawdza status zamówienia i jeśli
 * jest >= DOGADYWANE — odświeża snapshot. Pomija PLANOWANE (zamówienie jeszcze
 * nie ma cen wynegocjowanych).
 *
 * Idempotentne, taneie — pojedyncza kalkulacja kontenera + upsert N rekordów.
 * Lista produktów odzwierciedli zmianę przy następnym renderze (revalidatePath
 * też tu robi się z grzeczności — chociaż w większości miejsc i tak jest
 * wołane wcześniej).
 */
/**
 * Wymusza ponowne policzenie i zapisanie snapshotu cen produktow dla
 * zamowienia. Uzywane gdy uzytkownik zmienil dane wplywajace na kalkulacje
 * (np. cbmPerUnit komponentu) i chce zeby lista produktow odzwierciedlala
 * aktualny stan, bez przelaczania statusu zamowienia.
 *
 * Snapshot powstanie tylko gdy status zamowienia jest >= DOGADYWANE
 * (lista produktow nie pokazuje ekonomiki z PLANOWANE).
 */
export async function recomputeOrderProductsAction(orderId: string) {
  await requireUser();
  const o = await db.importOrder.findUnique({
    where: { id: orderId },
    select: { status: true, _count: { select: { items: true } } },
  });
  if (!o) throw new Error("Zamówienie nie istnieje.");
  if (o._count.items === 0) {
    return {
      ok: true as const,
      itemsUpdated: 0,
      message: "Zamówienie nie ma jeszcze pozycji.",
    };
  }
  const SNAPSHOT_FROM_STATUSES: OrderStatusT[] = [
    "DOGADYWANE",
    "PRODUKOWANE",
    "WYPRODUKOWANE",
    "WYSLANE",
    "ODEBRANE",
    "W_MAGAZYNIE",
  ];
  if (!SNAPSHOT_FROM_STATUSES.includes(o.status as OrderStatusT)) {
    return {
      ok: false as const,
      message: `Status ${o.status} — snapshot tworzy się od DOGADYWANE. Przesuń zamówienie na kolejny etap.`,
    };
  }
  await snapshotOrderPricesToHistory(orderId);
  revalidatePath("/produkty");
  revalidatePath(`/zamowienia/${orderId}`);
  return {
    ok: true as const,
    itemsUpdated: o._count.items,
    message: `Przeliczono ekonomikę dla ${o._count.items} pozycji.`,
  };
}

export async function maybeSnapshotOrderPrices(orderId: string) {
  const o = await db.importOrder.findUnique({
    where: { id: orderId },
    select: { status: true },
  });
  if (!o) return;
  const SNAPSHOT_FROM_STATUSES: OrderStatusT[] = [
    "DOGADYWANE",
    "PRODUKOWANE",
    "WYPRODUKOWANE",
    "WYSLANE",
    "ODEBRANE",
    "W_MAGAZYNIE",
  ];
  if (!SNAPSHOT_FROM_STATUSES.includes(o.status as OrderStatusT)) return;
  await snapshotOrderPricesToHistory(orderId);
  revalidatePath("/produkty");
}

/**
 * Zapisuje aktualne ceny każdej pozycji zamówienia do `ProductPriceHistory`.
 * Wartości:
 *  - factoryPriceUsd / Cny → cena z pozycji (lub null jeśli brak)
 *  - factoryPricePln → cena USD/CNY × kurs (efektywny z transz lub z pozycji)
 *  - landedCostPln → goods + logistyka + cło + prowizja (z `kalkulujKontener`)
 *  - cbmPerUnit → snapshot dla późniejszej analizy
 *
 * Idempotentne: per (productId, importOrderId) upsert. Jeśli ten sam order
 * trafi do magazynu wielokrotnie (po cofnięciu statusu i edycji), snapshot
 * się aktualizuje, a historia ma jedną kanoniczną wartość per zamówienie.
 */
export async function snapshotOrderPricesToHistory(orderId: string) {
  const order = await db.importOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      country: true,
      containerSizeM3: true,
      vatRate: true,
      cnyToPlnRate: true,
      usdToPlnRate: true,
      goodsTranches: {
        select: {
          paidCurrency: true,
          paidExchangeRate: true,
          paidAmountOriginal: true,
        },
      },
      costs: { select: { amountPln: true, type: true } },
      items: {
        select: {
          id: true,
          productId: true,
          quantity: true,
          cbmPerUnit: true,
          unitPriceUsd: true,
          unitPriceCny: true,
          unitPricePln: true,
          cnyToPlnRate: true,
          usdToPlnRate: true,
          unitPriceIsBrutto: true,
          product: {
            select: {
              // Fallback dla pozycji ktore nie maja ImportOrderItem.cbmPerUnit
              // — uzywamy CBM z karty produktu. Bez tego snapshot ladowal 0
              // logistyki dla pozycji ktorym ktos pozniej uzupelnil CBM
              // w karcie, ale nie w pozycji.
              cbmPerUnit: true,
              customsDutyPct: true,
              category: {
                select: {
                  customsDutyPct: true,
                  parent: {
                    select: {
                      customsDutyPct: true,
                      parent: { select: { customsDutyPct: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!order) return;

  const calc = kalkulujKontener({
    rates: {
      cnyToPln: order.cnyToPlnRate ?? 0,
      usdToPln: order.usdToPlnRate ?? 0,
      vatRate: order.vatRate ?? 0.23,
    },
    // PL używa QTY mode (koszty dzielone per szt, nie per CBM jak w CN).
    // Bez tego snapshot dla PL alokował logistykę jak dla CN i landed
    // cost był liczony niepoprawnie.
    allocationMode: order.country === "POLAND" ? "QTY" : "CBM",
    containerSizeM3: order.containerSizeM3 ?? 28,
    costs: order.costs.map((c) => ({ amountPln: c.amountPln, type: c.type })),
    goodsTranches: order.goodsTranches.map((t) => ({
      paidCurrency: t.paidCurrency,
      paidExchangeRate: t.paidExchangeRate,
      paidAmountOriginal: t.paidAmountOriginal,
    })),
    items: order.items.map((it) => ({
      quantity: it.quantity,
      // Fallback do CBM z karty produktu — patrz komentarz przy product.cbmPerUnit
      // w select. Bez tego snapshot pomijal CBM gdy pozycja go nie miala.
      cbmPerUnit: it.cbmPerUnit ?? it.product?.cbmPerUnit ?? 0,
      unitPriceUsd: it.unitPriceUsd,
      unitPriceCny: it.unitPriceCny,
      unitPricePln: it.unitPricePln,
      cnyToPlnRate: it.cnyToPlnRate,
      usdToPlnRate: it.usdToPlnRate,
      unitPriceIsBrutto: it.unitPriceIsBrutto,
      customsDutyPct: resolveCustomsDutyPct({
        customsDutyPct: it.product?.customsDutyPct ?? null,
        category: it.product?.category ?? null,
      }),
      saleChannels: [],
    })),
  });

  for (let i = 0; i < order.items.length; i++) {
    const it = order.items[i];
    const calcIt = calc.items[i];
    if (!calcIt) continue;
    const effUsd = it.usdToPlnRate ?? order.usdToPlnRate ?? 0;
    const effCny = it.cnyToPlnRate ?? order.cnyToPlnRate ?? 0;
    // Cena fabryczna w PLN: USD → kurs USD, CNY → kurs CNY, PLN → bezpośrednio.
    // PL zamówienia trzymają cenę w `unitPricePln` (produkcja krajowa nie ma
    // kursu walut), więc bez tego fallbacku snapshot zapisywał null.
    const factoryPln =
      it.unitPriceUsd != null && it.unitPriceUsd > 0
        ? it.unitPriceUsd * effUsd
        : it.unitPriceCny != null && it.unitPriceCny > 0
          ? it.unitPriceCny * effCny
          : it.unitPricePln != null && it.unitPricePln > 0
            ? it.unitPricePln
            : null;
    // Upsert per (productId, importOrderId). Replace = ostatni snapshot wygrywa.
    const existing = await db.productPriceHistory.findFirst({
      where: { productId: it.productId, importOrderId: orderId },
      select: { id: true },
    });
    const q = Math.max(1, it.quantity);
    const data = {
      productId: it.productId,
      importOrderId: orderId,
      factoryPriceUsd: it.unitPriceUsd,
      factoryPriceCny: it.unitPriceCny,
      factoryPricePln: factoryPln,
      landedCostPln: calcIt.landedCostPerUnitPln,
      // Rozbicie landed na 4 składniki per szt (netto) — używane na liście
      // produktów. Lista NIE wywołuje `kalkulujKontener` live; czyta te
      // wartości bezpośrednio z snapshotu.
      prowizjaPerUnitPln: calcIt.allocatedBrokerCommissionPln / q,
      cloPerUnitPln: calcIt.customsDutyPln / q,
      logisticsPerUnitPln: calcIt.allocatedLogisticsPln / q,
      // Efektywny CBM (z fallback'iem do Product.cbmPerUnit) — patrz mapowanie
      // items wyzej. Bez fallbacka snapshot zapisywal NULL gdy pozycja nie
      // miala CBM, mimo ze produkt go ma.
      cbmPerUnit: it.cbmPerUnit ?? it.product?.cbmPerUnit ?? null,
    };
    if (existing) {
      await db.productPriceHistory.update({
        where: { id: existing.id },
        data,
      });
    } else {
      await db.productPriceHistory.create({ data });
    }
  }
}

// ─── Zamykanie / otwieranie zamówienia ────────────────────────────────

/**
 * Liczba stałych OBOWIĄZKOWYCH kategorii kosztów (FIXED_TYPES bez VAT).
 * VAT jest dodatkowy — nie blokuje zamknięcia. Jeśli chcesz że VAT
 * blokuje zamknięcie, dodaj go jako "Inne opłaty" (INNE).
 */
const MANDATORY_FIXED_COUNT = 7;
const EXCLUDED_FIXED_TYPES = new Set(["VAT"]);

/**
 * Sprawdza czy zamówienie spełnia warunki zamknięcia:
 *  - status === W_MAGAZYNIE
 *  - wszystkie transze towaru zapłacone
 *  - wszystkie 8 stałych kategorii kosztów istnieje i zapłacone
 *  - wszystkie "inne" koszty zapłacone
 *  - wszystkie nazwane sloty dokumentacji wypełnione
 *
 * Zwraca tablicę przeszkód (pusta = można zamknąć).
 */
export async function checkOrderClosable(id: string): Promise<{
  closable: boolean;
  reasons: string[];
}> {
  await requireUser();
  const order = await db.importOrder.findUnique({
    where: { id },
    select: {
      status: true,
      closedAt: true,
      goodsTranches: { select: { paid: true } },
      costs: { select: { type: true, paid: true } },
      files: { select: { slot: true } },
    },
  });
  if (!order) throw new Error("Zamówienie nie istnieje.");

  // DOC_CATEGORIES jest w /lib/order-doc-slots — używamy require dynamic
  // żeby uniknąć importu kodu klienckiego do server actions.
  const { DOC_CATEGORIES } = await import("@/lib/order-doc-slots");
  const namedSlotIds = new Set(
    DOC_CATEGORIES.flatMap((c) => c.slots)
      .filter((s) => !s.custom)
      .map((s) => s.id),
  );

  const reasons: string[] = [];

  if (order.closedAt) {
    return { closable: false, reasons: ["Zamówienie jest już zamknięte"] };
  }
  if (order.status !== "W_MAGAZYNIE") {
    reasons.push("Status musi być: W magazynie");
  }

  const tranchesUnpaid = order.goodsTranches.filter((t) => !t.paid).length;
  if (tranchesUnpaid > 0) {
    reasons.push(`Niezapłacone transze towaru: ${tranchesUnpaid}`);
  }
  if (order.goodsTranches.length === 0) {
    reasons.push("Brak utworzonych transz towaru (30/40/30%)");
  }

  // Obowiązkowe koszty stałe (bez VAT): muszą wszystkie istnieć + być paid
  const mandatoryFixed = order.costs.filter(
    (c) => c.type !== "INNE" && !EXCLUDED_FIXED_TYPES.has(c.type),
  );
  const mandatoryPaid = mandatoryFixed.filter((c) => c.paid).length;
  if (mandatoryFixed.length < MANDATORY_FIXED_COUNT) {
    reasons.push(
      `Brakuje obowiązkowych kosztów stałych: utworzono ${mandatoryFixed.length}/${MANDATORY_FIXED_COUNT}`,
    );
  }
  if (mandatoryPaid < MANDATORY_FIXED_COUNT) {
    reasons.push(
      `Niezapłacone stałe koszty: ${MANDATORY_FIXED_COUNT - mandatoryPaid}`,
    );
  }

  // VAT: pomijamy — nie blokuje zamknięcia

  const otherCosts = order.costs.filter((c) => c.type === "INNE");
  const otherUnpaid = otherCosts.filter((c) => !c.paid).length;
  if (otherUnpaid > 0) {
    reasons.push(`Niezapłacone inne opłaty: ${otherUnpaid}`);
  }

  const filledSlots = new Set(
    order.files
      .filter((f) => f.slot && namedSlotIds.has(f.slot))
      .map((f) => f.slot as string),
  ).size;
  const missingSlots = namedSlotIds.size - filledSlots;
  if (missingSlots > 0) {
    reasons.push(`Brakujące dokumenty: ${missingSlots}/${namedSlotIds.size}`);
  }

  return { closable: reasons.length === 0, reasons };
}

export async function closeOrderAction(id: string) {
  await requireUser();
  const check = await checkOrderClosable(id);
  if (!check.closable) {
    throw new Error(
      `Nie można zamknąć zamówienia:\n` + check.reasons.map((r) => `· ${r}`).join("\n"),
    );
  }
  await db.importOrder.update({
    where: { id },
    data: { closedAt: new Date() },
  });
  revalidatePath(`/zamowienia/${id}`);
  revalidatePath("/zamowienia");
  return { ok: true as const };
}

export async function reopenOrderAction(id: string) {
  await requireUser();
  const order = await db.importOrder.findUnique({
    where: { id },
    select: { id: true, closedAt: true },
  });
  if (!order) throw new Error("Zamówienie nie istnieje.");
  if (!order.closedAt) {
    return { ok: true as const };
  }
  await db.importOrder.update({
    where: { id },
    data: { closedAt: null },
  });
  revalidatePath(`/zamowienia/${id}`);
  revalidatePath("/zamowienia");
  return { ok: true as const };
}

export async function updateOrderMetaAction(
  id: string,
  patch: { orderNumber?: string; trackingUrl?: string | null },
) {
  await requireUser();
  const order = await db.importOrder.findUnique({
    where: { id },
    select: { id: true, orderNumber: true },
  });
  if (!order) throw new Error("Zamówienie nie istnieje.");

  const data: { orderNumber?: string; trackingUrl?: string | null } = {};

  if (patch.orderNumber !== undefined) {
    const next = patch.orderNumber.trim();
    if (!next) throw new Error("Numer nie może być pusty.");
    if (next !== order.orderNumber) {
      const conflict = await db.importOrder.findFirst({
        where: { orderNumber: next },
        select: { id: true },
      });
      if (conflict) throw new Error(`Numer ${next} już istnieje.`);
      data.orderNumber = next;
    }
  }

  if (patch.trackingUrl !== undefined) {
    const val =
      typeof patch.trackingUrl === "string" ? patch.trackingUrl.trim() : null;
    data.trackingUrl = val ? val : null;
  }

  if (Object.keys(data).length === 0) return { ok: true as const };

  await db.importOrder.update({ where: { id }, data });
  revalidatePath("/zamowienia");
  revalidatePath(`/zamowienia/${id}`);
  return { ok: true as const };
}

/**
 * Recznie ustawia / kasuje ETA (Estimated Time of Arrival) zamowienia.
 * Date.toISOString() string albo null. Source = 'manual'.
 */
export async function updateOrderEtaAction(
  orderId: string,
  isoDate: string | null,
) {
  await requireUser();
  const order = await db.importOrder.findUnique({
    where: { id: orderId },
    select: { id: true },
  });
  if (!order) throw new Error("Zamówienie nie istnieje.");
  await db.importOrder.update({
    where: { id: orderId },
    data: {
      etaDate: isoDate ? new Date(isoDate) : null,
      etaSource: isoDate ? "manual" : null,
      etaFetchedAt: isoDate ? new Date() : null,
    },
  });
  revalidatePath("/zamowienia");
  return { ok: true as const };
}

/**
 * Pobiera ETA z Maersk Track & Trace API dla containerow przypisanych
 * do zamowienia. Wymaga MAERSK_API_KEY w env (Consumer-Key z developer
 * portal: developer.maersk.com/products).
 *
 * Dla kazdego containerLinks[].containerNumber wola endpoint:
 *   GET https://api.maersk.com/track-and-trace-public/shipments
 *       ?containerNumber=XYZ
 *   Header: Consumer-Key: <MAERSK_API_KEY>
 *
 * Z odpowiedzi bierze najpozniejsza datePlanned / dateExpected dla
 * eventu kategorii 'ARRIVE_AT_DESTINATION' — to wlasnie ETA do portu PL.
 * Jesli zamowienie ma wiele kontenerow, bierzemy MAX (najpozniejsza data).
 */
export async function fetchEtaFromMaerskAction(orderId: string) {
  await requireUser();
  const apiKey = process.env.MAERSK_API_KEY;
  if (!apiKey) {
    return {
      ok: false as const,
      error:
        "Brak MAERSK_API_KEY w env. Zarejestruj się na developer.maersk.com i dodaj klucz do Coolify env.",
    };
  }
  const order = await db.importOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      containerLinks: { select: { containerNumber: true } },
    },
  });
  if (!order) throw new Error("Zamówienie nie istnieje.");
  if (order.containerLinks.length === 0) {
    return {
      ok: false as const,
      error: "Brak numerów kontenerów — dodaj link śledzenia z numerem.",
    };
  }

  let latestEta: Date | null = null;
  const errors: string[] = [];
  for (const link of order.containerLinks) {
    const num = link.containerNumber.trim();
    if (!num) continue;
    try {
      const url = `https://api.maersk.com/track-and-trace-public/shipments?containerNumber=${encodeURIComponent(num)}`;
      const res = await fetch(url, {
        headers: { "Consumer-Key": apiKey },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        errors.push(`${num}: HTTP ${res.status}`);
        continue;
      }
      const data = (await res.json()) as {
        events?: Array<{
          eventClassifierCode?: string;
          eventDateTime?: string;
          eventType?: string;
          transportEventTypeCode?: string;
        }>;
      };
      // Maersk events: szukamy ostatniego ARRIVE eventu (kontener przybywa
      // do portu docelowego). Z fallback do najnowszego planned eventu.
      const arrival = data.events
        ?.filter(
          (e) =>
            e.transportEventTypeCode === "ARRI" ||
            e.eventType === "ARRIVAL" ||
            (e.eventClassifierCode === "PLN" &&
              e.transportEventTypeCode === "ARRI"),
        )
        .map((e) => (e.eventDateTime ? new Date(e.eventDateTime) : null))
        .filter((d): d is Date => d !== null)
        .sort((a, b) => b.getTime() - a.getTime())[0];
      if (arrival && (!latestEta || arrival > latestEta)) {
        latestEta = arrival;
      }
    } catch (e) {
      errors.push(
        `${num}: ${e instanceof Error ? e.message : "fetch error"}`,
      );
    }
  }

  if (!latestEta) {
    return {
      ok: false as const,
      error:
        errors.length > 0
          ? `Nie udało się pobrać ETA: ${errors.join("; ")}`
          : "Brak danych o przybyciu w odpowiedzi Maersk.",
    };
  }

  await db.importOrder.update({
    where: { id: orderId },
    data: {
      etaDate: latestEta,
      etaSource: "maersk",
      etaFetchedAt: new Date(),
    },
  });
  revalidatePath("/zamowienia");
  return {
    ok: true as const,
    eta: latestEta.toISOString(),
    containers: order.containerLinks.length,
  };
}

/**
 * Ustawia override miniatury (cover image) dla zamowienia. URL = wlasne
 * zdjecie z pozycji albo upload. Null = auto (cover wybierany z dominujacej
 * kategorii w liscie zamowien).
 */
export async function setOrderCoverImageAction(
  orderId: string,
  url: string | null,
) {
  await requireUser();
  const order = await db.importOrder.findUnique({
    where: { id: orderId },
    select: { id: true },
  });
  if (!order) throw new Error("Zamówienie nie istnieje.");
  await db.importOrder.update({
    where: { id: orderId },
    data: { coverImageUrl: url && url.trim().length > 0 ? url.trim() : null },
  });
  revalidatePath("/zamowienia");
  revalidatePath(`/zamowienia/${orderId}`);
  return { ok: true as const };
}

/**
 * Zapisuje liste linkow sledzenia kontenerow dla zamowienia. Atomic replace:
 * kasujemy stare rekordy + tworzymy nowe w transakcji. Puste rzedy
 * (brak numeru LUB brak url) sa pomijane. Czysci tez legacy `trackingUrl`
 * gdy uzytkownik wszedl w nowy widget.
 */
export async function replaceContainerLinksAction(
  orderId: string,
  links: Array<{ containerNumber: string; url: string }>,
) {
  await requireUser();
  const order = await db.importOrder.findUnique({
    where: { id: orderId },
    select: { id: true },
  });
  if (!order) throw new Error("Zamówienie nie istnieje.");

  const normalized = links
    .map((l, idx) => ({
      containerNumber: l.containerNumber.trim(),
      url: l.url.trim(),
      sortOrder: idx,
    }))
    .filter((l) => l.containerNumber && l.url);

  await db.$transaction([
    db.importOrderContainerLink.deleteMany({ where: { orderId } }),
    ...(normalized.length > 0
      ? [
          db.importOrderContainerLink.createMany({
            data: normalized.map((l) => ({ orderId, ...l })),
          }),
        ]
      : []),
    db.importOrder.update({
      where: { id: orderId },
      data: { trackingUrl: null },
    }),
  ]);

  revalidatePath("/zamowienia");
  revalidatePath(`/zamowienia/${orderId}`);
  return { ok: true as const };
}

/**
 * Aktualizuje treść „Opis zamówienia" pokazywaną na stronie 1 PDF (PL).
 * Pusty/whitespace string zapisujemy jako null, by PDF nie pokazywał
 * pustej sekcji.
 */
/**
 * Aktualizuje per-mode override adresu dostawy dla zamowienia.
 * mode = 'fabryka' | 'krajalnia' | 'legacy' (stare wspolne pole - na fallback).
 * Pusty / whitespace -> null.
 */
export async function updateOrderDeliveryAddressOverrideAction(
  id: string,
  mode: "fabryka" | "krajalnia" | "legacy",
  value: string | null,
) {
  await requireUser();
  const val =
    typeof value === "string" ? value.trim() : null;
  const data: Record<string, string | null> = {};
  if (mode === "fabryka") {
    data.deliveryAddressOverrideFabryka = val ? val : null;
  } else if (mode === "krajalnia") {
    data.deliveryAddressOverrideKrajalnia = val ? val : null;
  } else {
    data.deliveryAddressOverride = val ? val : null;
  }
  await db.importOrder.update({
    where: { id },
    data,
  });
  revalidatePath(`/zamowienia/${id}`);
  revalidatePath(`/zamowienia/z-polski/${id}`);
  return { ok: true as const };
}

export async function updateOrderPdfDescriptionAction(
  id: string,
  pdfDescription: string | null,
) {
  await requireUser();
  const companyId = await getCurrentCompanyId();
  const order = await db.importOrder.findFirst({
    where: { id, companyId },
    select: { id: true },
  });
  if (!order) throw new Error("Zamówienie nie istnieje.");
  const normalized =
    typeof pdfDescription === "string" && pdfDescription.trim()
      ? pdfDescription.trim()
      : null;
  await db.importOrder.update({
    where: { id },
    data: { pdfDescription: normalized },
  });
  revalidatePath(`/zamowienia/${id}`);
  return { ok: true as const };
}

/**
 * Zapis danych awizacji (kierowca, pojazd, data dostawy, notatki).
 * Wszystkie pola opcjonalne — formularz może być uzupełniany etapami.
 */
export async function updateAwizacjaAction(
  id: string,
  patch: {
    driverName?: string | null;
    driverPhone?: string | null;
    driverIdNumber?: string | null;
    vehiclePlate?: string | null;
    vehicleType?: string | null;
    deliveryDate?: string | null;
    awizacjaNotes?: string | null;
  },
) {
  await requireUser();
  const order = await db.importOrder.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!order) throw new Error("Zamówienie nie istnieje.");
  const data: Record<string, string | Date | null> = {};
  const str = (v: string | null | undefined): string | null =>
    v == null || v.trim() === "" ? null : v.trim();
  if (patch.driverName !== undefined) data.driverName = str(patch.driverName);
  if (patch.driverPhone !== undefined)
    data.driverPhone = str(patch.driverPhone);
  if (patch.driverIdNumber !== undefined)
    data.driverIdNumber = str(patch.driverIdNumber);
  if (patch.vehiclePlate !== undefined)
    data.vehiclePlate = str(patch.vehiclePlate);
  if (patch.vehicleType !== undefined)
    data.vehicleType = str(patch.vehicleType);
  if (patch.awizacjaNotes !== undefined)
    data.awizacjaNotes = str(patch.awizacjaNotes);
  if (patch.deliveryDate !== undefined) {
    const v = patch.deliveryDate?.trim();
    data.deliveryDate = v ? new Date(v) : null;
  }
  if (Object.keys(data).length === 0) return { ok: true as const };
  await db.importOrder.update({ where: { id }, data });
  revalidatePath(`/zamowienia/${id}`);
  return { ok: true as const };
}

/**
 * Oznacz awizację jako wygenerowaną (zapisz timestamp). Używane przy
 * wydrukowaniu / wygenerowaniu PDF — żeby wiedzieć kiedy wystawiono.
 */
export async function markAwizacjaPrintedAction(id: string) {
  await requireUser();
  await db.importOrder.update({
    where: { id },
    data: { awizacjaPrintedAt: new Date() },
  });
  revalidatePath(`/zamowienia/${id}`);
  return { ok: true as const };
}

export async function deleteOrderAction(id: string) {
  await requireUser();
  const order = await db.importOrder.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!order) return { ok: true as const };

  if (!canDeleteOrder(order.status as OrderStatusT)) {
    throw new Error(
      "Można usunąć tylko zamówienia w statusach Planowane i Dogadywane.",
    );
  }
  await db.importOrder.delete({ where: { id } });
  revalidatePath("/zamowienia");
  return { ok: true as const };
}
