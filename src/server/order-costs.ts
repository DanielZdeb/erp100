"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { FULLBAX_DEFAULT_TIERS } from "@/lib/broker-commission";
import { uploadFile, deleteFile } from "@/lib/storage";
import { maybeSnapshotOrderPrices } from "@/server/orders";

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

// ─── Koszty kontenera ────────────────────────────────────────────────

const costTypes = [
  "KONTROLA_JAKOSCI",
  "ODPRAWA",
  "KOSZTY_TERMINALOWE",
  "TRANSPORT_LADOWY",
  "TRANSPORT_MORSKI",
  "CLO",
  "PROWIZJA_POSREDNIKA",
  "VAT",
  "CIECIE",
  "KROJENIE",
  "SZWALNIA",
  "INNE",
] as const;
type CostType = (typeof costTypes)[number];

const costCurrencies = ["PLN", "USD", "EUR", "CNY"] as const;
type CostCurrencyT = (typeof costCurrencies)[number];

const costSchema = z.object({
  type: z.enum(costTypes),
  name: z.string().optional().nullable(),
  // Waluty
  amount: z.union([z.string(), z.number()]).optional().nullable(),
  currency: z.enum(costCurrencies).default("PLN"),
  exchangeRate: z.union([z.string(), z.number()]).optional().nullable(),
  isNetto: z
    .union([z.boolean(), z.string()])
    .transform((v) => v === true || v === "true" || v === "on")
    .optional(),
  vatRate: z.union([z.string(), z.number()]).optional().nullable(),
  // Statusy
  paid: z
    .union([z.boolean(), z.string()])
    .transform((v) => v === true || v === "true" || v === "on")
    .optional(),
  notes: z.string().optional().nullable(),
});

/**
 * Liczy końcową kwotę PLN NETTO z wejścia (waluta × kurs).
 * Polityka: wszystkie opłaty zamówienia trzymamy w netto. Argumenty
 * `isNetto` i `vatRate` są zachowane dla zgodności sygnatury, ale nie
 * wpływają na wynik — kwota zawsze jest traktowana jako netto.
 */
function computeCostAmountPln(
  amount: number,
  currency: CostCurrencyT,
  exchangeRate: number | null,
  _isNetto: boolean,
  _vatRate: number | null,
): { amountPln: number; effectiveRate: number; effectiveVat: number } {
  const rate = currency === "PLN" ? 1 : exchangeRate ?? 0;
  const amountPln = amount * rate;
  return {
    amountPln: Math.round(amountPln * 100) / 100,
    effectiveRate: rate,
    effectiveVat: 0,
  };
}

export async function addOrderCostAction(orderId: string, input: unknown) {
  await requireUser();
  const data = costSchema.parse(input);

  const amount = num(data.amount) ?? 0;
  const exchangeRate = num(data.exchangeRate);
  const vatRate = num(data.vatRate);
  const isNetto = !!data.isNetto;

  const { amountPln, effectiveRate, effectiveVat } = computeCostAmountPln(
    amount,
    data.currency,
    exchangeRate,
    isNetto,
    vatRate,
  );

  await db.importOrderCost.create({
    data: {
      orderId,
      type: data.type as CostType,
      name: data.name?.trim() || null,
      amount,
      currency: data.currency,
      exchangeRate: data.currency === "PLN" ? 1 : effectiveRate,
      isNetto,
      vatRate: isNetto ? effectiveVat : null,
      amountPln,
      paid: !!data.paid,
      notes: data.notes?.trim() || null,
    },
  });
  revalidatePath(`/zamowienia/${orderId}`);
  await maybeSnapshotOrderPrices(orderId);
  return { ok: true as const };
}

export async function updateOrderCostAction(costId: string, input: unknown) {
  await requireUser();
  const data = costSchema.parse(input);
  const cost = await db.importOrderCost.findUnique({
    where: { id: costId },
    select: { id: true, orderId: true },
  });
  if (!cost) throw new Error("Koszt nie istnieje.");

  const amount = num(data.amount) ?? 0;
  const exchangeRate = num(data.exchangeRate);
  const vatRate = num(data.vatRate);
  const isNetto = !!data.isNetto;

  const { amountPln, effectiveRate, effectiveVat } = computeCostAmountPln(
    amount,
    data.currency,
    exchangeRate,
    isNetto,
    vatRate,
  );

  await db.importOrderCost.update({
    where: { id: costId },
    data: {
      type: data.type as CostType,
      name: data.name?.trim() || null,
      amount,
      currency: data.currency,
      exchangeRate: data.currency === "PLN" ? 1 : effectiveRate,
      isNetto,
      vatRate: isNetto ? effectiveVat : null,
      amountPln,
      paid: !!data.paid,
      notes: data.notes?.trim() || null,
    },
  });
  revalidatePath(`/zamowienia/${cost.orderId}`);
  await maybeSnapshotOrderPrices(cost.orderId);
  return { ok: true as const };
}

export async function deleteOrderCostAction(costId: string) {
  await requireUser();
  const cost = await db.importOrderCost.findUnique({
    where: { id: costId },
    select: { id: true, orderId: true },
  });
  if (!cost) return { ok: true as const };
  await db.importOrderCost.delete({ where: { id: costId } });
  revalidatePath(`/zamowienia/${cost.orderId}`);
  await maybeSnapshotOrderPrices(cost.orderId);
  return { ok: true as const };
}

export async function toggleOrderCostPaidAction(costId: string, paid: boolean) {
  await requireUser();
  const cost = await db.importOrderCost.findUnique({
    where: { id: costId },
    select: { id: true, orderId: true },
  });
  if (!cost) throw new Error("Koszt nie istnieje.");
  await db.importOrderCost.update({
    where: { id: costId },
    data: { paid },
  });
  revalidatePath(`/zamowienia/${cost.orderId}`);
  return { ok: true as const };
}

// ─── Zadania ─────────────────────────────────────────────────────────

const statusEnum = z.enum([
  "PLANOWANE",
  "DOGADYWANE",
  "PRODUKOWANE",
  "WYPRODUKOWANE",
  "WYSLANE",
  "ODEBRANE",
  "W_MAGAZYNIE",
]);

const taskSchema = z.object({
  title: z.string().min(1, "Podaj tytuł zadania"),
  description: z.string().optional().nullable(),
  status: statusEnum.optional().nullable(),
  dueAt: z.string().optional().nullable(),
  assignedToId: z.string().optional().nullable(),
});

export async function addOrderTaskAction(orderId: string, input: unknown) {
  await requireUser();
  const data = taskSchema.parse(input);

  const last = await db.orderTask.findFirst({
    where: { orderId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  await db.orderTask.create({
    data: {
      orderId,
      title: data.title.trim(),
      description: data.description?.trim() || null,
      status: data.status ?? null,
      dueAt: dateOrNull(data.dueAt),
      assignedToId: data.assignedToId || null,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
  });

  revalidatePath(`/zamowienia/${orderId}`);
  return { ok: true as const };
}

/**
 * Seed sztywnych zadań dla podanego etapu, jeśli jeszcze nie istnieją.
 * Bezpieczna do wywoływania wielokrotnie (deduplikuje po templateKey).
 */
export async function ensureStageTaskTemplates(
  orderId: string,
  status: string,
  templates: { key: string; title: string }[],
) {
  await requireUser();
  if (templates.length === 0) return;
  const existing = await db.orderTask.findMany({
    where: {
      orderId,
      status: status as
        | "PLANOWANE"
        | "DOGADYWANE"
        | "PRODUKOWANE"
        | "WYPRODUKOWANE"
        | "WYSLANE"
        | "ODEBRANE"
        | "W_MAGAZYNIE",
      templateKey: { not: null },
    },
    select: { templateKey: true },
  });
  const existingKeys = new Set(
    existing.map((t) => t.templateKey).filter((k): k is string => !!k),
  );
  const missing = templates.filter((t) => !existingKeys.has(t.key));
  if (missing.length === 0) return;

  const last = await db.orderTask.findFirst({
    where: { orderId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  let nextOrder = (last?.sortOrder ?? -1) + 1;

  await db.orderTask.createMany({
    data: missing.map((t) => ({
      orderId,
      status: status as
        | "PLANOWANE"
        | "DOGADYWANE"
        | "PRODUKOWANE"
        | "WYPRODUKOWANE"
        | "WYSLANE"
        | "ODEBRANE"
        | "W_MAGAZYNIE",
      templateKey: t.key,
      title: t.title,
      sortOrder: nextOrder++,
    })),
  });
}

export async function toggleTaskDoneAction(taskId: string, done: boolean) {
  await requireUser();
  const task = await db.orderTask.findUnique({
    where: { id: taskId },
    select: { id: true, orderId: true },
  });
  if (!task) throw new Error("Zadanie nie istnieje.");

  await db.orderTask.update({
    where: { id: taskId },
    data: { done, doneAt: done ? new Date() : null },
  });
  revalidatePath(`/zamowienia/${task.orderId}`);
  return { ok: true as const };
}

export async function deleteTaskAction(taskId: string) {
  await requireUser();
  const task = await db.orderTask.findUnique({
    where: { id: taskId },
    select: { id: true, orderId: true },
  });
  if (!task) return { ok: true as const };
  await db.orderTask.delete({ where: { id: taskId } });
  revalidatePath(`/zamowienia/${task.orderId}`);
  return { ok: true as const };
}

// ─── Płatności ──────────────────────────────────────────────────────

const paymentSchema = z.object({
  amountPln: z.union([z.string(), z.number()]),
  status: statusEnum.optional().nullable(),
  paidAt: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  reference: z.string().optional().nullable(),
});

export async function addPaymentAction(orderId: string, input: unknown) {
  await requireUser();
  const data = paymentSchema.parse(input);

  await db.importOrderPayment.create({
    data: {
      orderId,
      amountPln: num(data.amountPln) ?? 0,
      status: data.status ?? null,
      paidAt: dateOrNull(data.paidAt),
      description: data.description?.trim() || null,
      reference: data.reference?.trim() || null,
    },
  });

  revalidatePath(`/zamowienia/${orderId}`);
  return { ok: true as const };
}

export async function deletePaymentAction(paymentId: string) {
  await requireUser();
  const payment = await db.importOrderPayment.findUnique({
    where: { id: paymentId },
    select: { id: true, orderId: true },
  });
  if (!payment) return { ok: true as const };
  await db.importOrderPayment.delete({ where: { id: paymentId } });
  revalidatePath(`/zamowienia/${payment.orderId}`);
  return { ok: true as const };
}

// ─── Pliki (per etap zamówienia) ────────────────────────────────────

export async function uploadOrderFileAction(
  orderId: string,
  formData: FormData,
) {
  const user = await requireUser();
  const order = await db.importOrder.findUnique({
    where: { id: orderId },
    select: { id: true },
  });
  if (!order) throw new Error("Zamówienie nie istnieje.");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Brak pliku.");
  }
  const statusRaw = formData.get("status");
  const status =
    statusRaw && typeof statusRaw === "string" && statusRaw !== ""
      ? statusEnum.parse(statusRaw)
      : null;
  const slotRaw = formData.get("slot");
  const slot =
    typeof slotRaw === "string" && slotRaw.trim() !== ""
      ? slotRaw.trim()
      : null;
  const labelRaw = formData.get("label");
  const label =
    typeof labelRaw === "string" && labelRaw.trim() !== ""
      ? labelRaw.trim()
      : null;
  const notes = formData.get("notes");

  const uploaded = await uploadFile(file, {
    folder: `orders/${orderId}`,
  });

  await db.orderFile.create({
    data: {
      orderId,
      url: uploaded.url,
      filename: uploaded.filename,
      contentType: uploaded.contentType,
      sizeBytes: uploaded.sizeBytes,
      status,
      slot,
      label,
      uploadedById: user.id,
      notes: typeof notes === "string" ? notes.trim() || null : null,
    },
  });

  revalidatePath(`/zamowienia/${orderId}`);
  return { ok: true as const };
}

export async function updateOrderFileNotesAction(
  fileId: string,
  notes: string,
) {
  await requireUser();
  const file = await db.orderFile.findUnique({
    where: { id: fileId },
    select: { id: true, orderId: true },
  });
  if (!file) throw new Error("Plik nie istnieje.");
  await db.orderFile.update({
    where: { id: fileId },
    data: { notes: notes.trim() || null },
  });
  revalidatePath(`/zamowienia/${file.orderId}`);
  return { ok: true as const };
}

export async function deleteOrderFileAction(fileId: string) {
  await requireUser();
  const file = await db.orderFile.findUnique({ where: { id: fileId } });
  if (!file) return { ok: true as const };
  await deleteFile(file.url);
  await db.orderFile.delete({ where: { id: fileId } });
  revalidatePath(`/zamowienia/${file.orderId}`);
  return { ok: true as const };
}

// ─── Transze opłaty za towar ────────────────────────────────────────

const TRANCHE_DEFAULTS = [
  { phase: "PRE_PRODUCTION" as const, percentage: 0.3 },
  { phase: "POST_PRODUCTION" as const, percentage: 0.4 },
  { phase: "IN_PORT" as const, percentage: 0.3 },
];

/** Tworzy 3 domyślne transze 30/40/30 jeśli ich jeszcze nie ma. */
export async function ensureGoodsTranchesAction(orderId: string) {
  await requireUser();
  const existing = await db.orderGoodsTranche.count({ where: { orderId } });
  if (existing > 0) return { ok: true as const };

  await db.orderGoodsTranche.createMany({
    data: TRANCHE_DEFAULTS.map((d) => ({
      orderId,
      phase: d.phase,
      percentage: d.percentage,
    })),
  });
  revalidatePath(`/zamowienia/${orderId}`);
  return { ok: true as const };
}

export async function toggleGoodsTranchePaidAction(
  trancheId: string,
  paid: boolean,
  patch?: {
    paidCurrency?: "PLN" | "USD" | "EUR" | "CNY" | null;
    paidExchangeRate?: number | string | null;
    paidAmountOriginal?: number | string | null;
  },
) {
  await requireUser();
  const t = await db.orderGoodsTranche.findUnique({
    where: { id: trancheId },
    select: { id: true, orderId: true },
  });
  if (!t) throw new Error("Transza nie istnieje.");

  const data: {
    paid: boolean;
    paidAt: Date | null;
    paidCurrency?: "PLN" | "USD" | "EUR" | "CNY" | null;
    paidExchangeRate?: number | null;
    paidAmountOriginal?: number | null;
  } = {
    paid,
    paidAt: paid ? new Date() : null,
  };
  if (patch?.paidCurrency !== undefined) {
    data.paidCurrency = patch.paidCurrency;
  }
  if (patch?.paidExchangeRate !== undefined) {
    data.paidExchangeRate = num(patch.paidExchangeRate);
  }
  if (patch?.paidAmountOriginal !== undefined) {
    data.paidAmountOriginal = num(patch.paidAmountOriginal);
  }

  await db.orderGoodsTranche.update({
    where: { id: trancheId },
    data,
  });
  revalidatePath(`/zamowienia/${t.orderId}`);
  await maybeSnapshotOrderPrices(t.orderId);
  return { ok: true as const };
}

export async function updateGoodsTranchePaymentAction(
  trancheId: string,
  patch: {
    paidCurrency?: "PLN" | "USD" | "EUR" | "CNY" | null;
    paidExchangeRate?: number | string | null;
    paidAmountOriginal?: number | string | null;
  },
) {
  await requireUser();
  const t = await db.orderGoodsTranche.findUnique({
    where: { id: trancheId },
    select: { id: true, orderId: true },
  });
  if (!t) throw new Error("Transza nie istnieje.");

  const data: {
    paidCurrency?: "PLN" | "USD" | "EUR" | "CNY" | null;
    paidExchangeRate?: number | null;
    paidAmountOriginal?: number | null;
  } = {};
  if (patch.paidCurrency !== undefined) data.paidCurrency = patch.paidCurrency;
  if (patch.paidExchangeRate !== undefined) {
    data.paidExchangeRate = num(patch.paidExchangeRate);
  }
  if (patch.paidAmountOriginal !== undefined) {
    data.paidAmountOriginal = num(patch.paidAmountOriginal);
  }

  await db.orderGoodsTranche.update({ where: { id: trancheId }, data });
  revalidatePath(`/zamowienia/${t.orderId}`);
  await maybeSnapshotOrderPrices(t.orderId);
  return { ok: true as const };
}

export async function updateGoodsTrancheAction(
  trancheId: string,
  patch: { percentage?: number | string | null; notes?: string | null },
) {
  await requireUser();
  const t = await db.orderGoodsTranche.findUnique({
    where: { id: trancheId },
    select: { id: true, orderId: true },
  });
  if (!t) throw new Error("Transza nie istnieje.");

  const pct = num(patch.percentage);
  await db.orderGoodsTranche.update({
    where: { id: trancheId },
    data: {
      percentage:
        pct != null
          ? Math.max(0, Math.min(1, pct > 1 ? pct / 100 : pct))
          : undefined,
      notes:
        typeof patch.notes === "string" ? patch.notes.trim() || null : undefined,
    },
  });
  revalidatePath(`/zamowienia/${t.orderId}`);
  await maybeSnapshotOrderPrices(t.orderId);
  return { ok: true as const };
}

/**
 * Upsert stałego kosztu po typie (bez "INNE" — INNE pozwala wiele).
 * Używane do prostych pól z kwotą per typ kosztu.
 */
export async function upsertFixedCostAction(
  orderId: string,
  type: CostType,
  patch: {
    amount?: number | string | null;
    currency?: CostCurrencyT;
    exchangeRate?: number | string | null;
    isNetto?: boolean | string | null;
    vatRate?: number | string | null;
    paid?: boolean | string | null;
  },
) {
  await requireUser();
  if (type === "INNE") {
    throw new Error("Dla typu 'Inne' użyj zwykłego dodawania kosztu.");
  }

  const amount = num(patch.amount) ?? 0;
  const currency = (patch.currency ?? "PLN") as CostCurrencyT;
  const exchangeRate = num(patch.exchangeRate);
  const isNetto =
    patch.isNetto === true ||
    patch.isNetto === "true" ||
    patch.isNetto === "on";
  const vatRate = num(patch.vatRate);
  const paid =
    patch.paid === true || patch.paid === "true" || patch.paid === "on";

  const { amountPln, effectiveRate, effectiveVat } = computeCostAmountPln(
    amount,
    currency,
    exchangeRate,
    isNetto,
    vatRate,
  );

  const existing = await db.importOrderCost.findFirst({
    where: { orderId, type },
    select: { id: true },
  });

  const data = {
    amount,
    currency,
    exchangeRate: currency === "PLN" ? 1 : effectiveRate,
    isNetto,
    vatRate: isNetto ? effectiveVat : null,
    amountPln,
    paid,
  };

  if (existing) {
    await db.importOrderCost.update({
      where: { id: existing.id },
      data,
    });
  } else {
    await db.importOrderCost.create({
      data: {
        orderId,
        type,
        ...data,
      },
    });
  }

  revalidatePath(`/zamowienia/${orderId}`);
  await maybeSnapshotOrderPrices(orderId);
  return { ok: true as const };
}

// ─── Auto-prowizja pośrednika ────────────────────────────────────────

/**
 * Wylicza i ustawia kwotę PROWIZJA_POSREDNIKA na podstawie wartości towaru
 * zamówienia w USD i widełek wybranego pośrednika.
 *
 * Tryb działania:
 *   - "mode=upsert": ustawia auto-wyliczoną kwotę (nadpisuje istniejącą).
 *     Używane przez przycisk "Akceptuj auto" w UI.
 *   - "mode=once": tylko gdy nie ma jeszcze kosztu albo amount=0.
 *     Używane przy pierwszym otwarciu zamówienia (lazy backfill).
 */
export async function autoApplyBrokerCommission(
  orderId: string,
  options: { mode: "upsert" | "once"; brokerName?: string } = { mode: "once" },
): Promise<{ amountPln: number; tierLabel: string | null }> {
  const brokerName = options.brokerName ?? "Fullbax";
  const order = await db.importOrder.findUnique({
    where: { id: orderId },
    select: {
      companyId: true,
      usdToPlnRate: true,
      cnyToPlnRate: true,
      items: {
        select: {
          quantity: true,
          unitPriceUsd: true,
          unitPriceCny: true,
          cnyToPlnRate: true,
          usdToPlnRate: true,
        },
      },
    },
  });
  if (!order) return { amountPln: 0, tierLabel: null };

  const usdToPln = order.usdToPlnRate ?? 0;
  const cnyToPln = order.cnyToPlnRate ?? 0;

  // Konwertujemy wszystkie pozycje na USD — bezpośrednio z unitPriceUsd
  // albo z CNY przez kursy (CNY → PLN → USD). Dzięki temu prowizja działa
  // też dla zamówień wyłącznie w CNY.
  const totalUsd = order.items.reduce((s, it) => {
    if (it.unitPriceUsd != null && it.unitPriceUsd > 0) {
      return s + it.quantity * it.unitPriceUsd;
    }
    if (it.unitPriceCny != null && it.unitPriceCny > 0) {
      const itCnyToPln = it.cnyToPlnRate ?? cnyToPln;
      const itUsdToPln = it.usdToPlnRate ?? usdToPln;
      if (itCnyToPln > 0 && itUsdToPln > 0) {
        const cnyValuePln = it.quantity * it.unitPriceCny * itCnyToPln;
        return s + cnyValuePln / itUsdToPln;
      }
    }
    return s;
  }, 0);
  if (totalUsd <= 0) return { amountPln: 0, tierLabel: null };

  let tiers = await db.brokerCommissionTier.findMany({
    where: { companyId: order.companyId, brokerName },
    orderBy: [{ sortOrder: "asc" }, { minValueUsd: "asc" }],
  });
  // Lazy seed — jeśli firma jeszcze nie ma widełek, wgrywamy domyślne Fullbax
  // z umowy ramowej. Bez tego prowizja nie naliczyłaby się gdy user nie
  // odwiedził /ustawienia.
  if (tiers.length === 0) {
    await db.brokerCommissionTier.createMany({
      data: FULLBAX_DEFAULT_TIERS.map((t) => ({
        ...t,
        companyId: order.companyId,
        brokerName,
      })),
    });
    tiers = await db.brokerCommissionTier.findMany({
      where: { companyId: order.companyId, brokerName },
      orderBy: [{ sortOrder: "asc" }, { minValueUsd: "asc" }],
    });
  }
  if (tiers.length === 0) return { amountPln: 0, tierLabel: null };

  const tier = tiers.find((t) => {
    if (totalUsd < t.minValueUsd) return false;
    if (t.maxValueUsd != null && totalUsd >= t.maxValueUsd) return false;
    return true;
  });
  if (!tier) return { amountPln: 0, tierLabel: null };
  if (tier.individual) return { amountPln: 0, tierLabel: "indywidualne" };

  let amountPln = 0;
  if (tier.flatPln != null) {
    amountPln = tier.flatPln;
  } else if (tier.ratePct != null && usdToPln > 0) {
    amountPln = totalUsd * tier.ratePct * usdToPln;
  }
  amountPln = Math.round(amountPln * 100) / 100;

  const existing = await db.importOrderCost.findFirst({
    where: { orderId, type: "PROWIZJA_POSREDNIKA" },
    select: { id: true, amountPln: true, paid: true },
  });

  if (options.mode === "once" && existing && existing.amountPln > 0) {
    return {
      amountPln: existing.amountPln,
      tierLabel: tierLabel(tier),
    };
  }

  const data = {
    amount: amountPln,
    currency: "PLN" as const,
    exchangeRate: 1,
    isNetto: true,
    vatRate: null,
    amountPln,
    paid: existing?.paid ?? false,
  };

  if (existing) {
    await db.importOrderCost.update({ where: { id: existing.id }, data });
  } else {
    await db.importOrderCost.create({
      data: { orderId, type: "PROWIZJA_POSREDNIKA", ...data },
    });
  }
  // Brak revalidatePath — funkcja jest wołana z page-render zamówienia,
  // a strona i tak re-fetcha koszty zaraz po autoApply (page.tsx widzi nowe
  // dane w tym samym cyklu). revalidatePath w renderze rzuca Next 16 errorem.
  return { amountPln, tierLabel: tierLabel(tier) };
}

function tierLabel(t: {
  ratePct: number | null;
  flatPln: number | null;
  individual: boolean;
}): string | null {
  if (t.individual) return "indywidualne";
  if (t.flatPln != null) return `ryczałt ${Math.round(t.flatPln)} zł`;
  if (t.ratePct != null) return `${(t.ratePct * 100).toFixed(1)}%`;
  return null;
}

/**
 * Lazy-uzupełnia koszt CLO (cło importowe) policzony z customsInfo.
 * Analogicznie do autoApplyBrokerCommission:
 *  - "once": ustawia tylko gdy nie ma jeszcze kosztu albo amount=0 (nie nadpisuje
 *    ręcznie wpisanej wartości)
 *  - "upsert": nadpisuje aktualną wartością (do button "Akceptuj auto")
 *
 * Kwota wchodzi już policzona (z kalkulujKontener.totalCustomsDutyPln) bo
 * obliczenie wymaga pełnego calc-u kontenera z cenami pozycji.
 */
export async function autoApplyCustomsDuty(
  orderId: string,
  computedAmountPln: number,
  options: { mode: "upsert" | "once" } = { mode: "once" },
): Promise<{ amountPln: number }> {
  if (!Number.isFinite(computedAmountPln) || computedAmountPln <= 0) {
    return { amountPln: 0 };
  }
  const amountPln = Math.round(computedAmountPln * 100) / 100;

  const existing = await db.importOrderCost.findFirst({
    where: { orderId, type: "CLO" },
    select: { id: true, amountPln: true, paid: true },
  });

  if (options.mode === "once" && existing && existing.amountPln > 0) {
    return { amountPln: existing.amountPln };
  }

  const data = {
    amount: amountPln,
    currency: "PLN" as const,
    exchangeRate: 1,
    isNetto: true,
    vatRate: null,
    amountPln,
    paid: existing?.paid ?? false,
  };

  if (existing) {
    await db.importOrderCost.update({ where: { id: existing.id }, data });
  } else {
    await db.importOrderCost.create({
      data: { orderId, type: "CLO", ...data },
    });
  }
  // Brak revalidatePath — j.w., funkcja wołana z renderu strony zamówienia.
  return { amountPln };
}
