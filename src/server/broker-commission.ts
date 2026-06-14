"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { FULLBAX_DEFAULT_TIERS } from "@/lib/broker-commission";
import { getCurrentCompanyId } from "@/lib/tenant";

async function requireUser() {
  const session = await auth();
  if (!session?.user) throw new Error("Brak autoryzacji");
  return session.user;
}

/**
 * Zwraca aktywną tabelę widełek dla pośrednika (domyślnie "Fullbax").
 * Jeśli firma nie ma jeszcze tabeli — seeduje domyślne wartości z umowy.
 */
export async function getBrokerTiers(brokerName = "Fullbax") {
  const companyId = await getCurrentCompanyId();
  const existing = await db.brokerCommissionTier.findMany({
    where: { companyId, brokerName },
    orderBy: [{ sortOrder: "asc" }, { minValueUsd: "asc" }],
  });
  if (existing.length > 0) return existing;
  // Seeduj domyślne widełki Fullbax dla firmy.
  await db.brokerCommissionTier.createMany({
    data: FULLBAX_DEFAULT_TIERS.map((t) => ({
      ...t,
      companyId: companyId ?? null,
      brokerName,
    })),
  });
  return db.brokerCommissionTier.findMany({
    where: { companyId, brokerName },
    orderBy: [{ sortOrder: "asc" }, { minValueUsd: "asc" }],
  });
}

const upsertTierSchema = z.object({
  id: z.string().optional(),
  brokerName: z.string().min(1),
  minValueUsd: z.coerce.number().min(0),
  maxValueUsd: z.coerce.number().nullable().optional(),
  ratePct: z.coerce.number().min(0).max(100).nullable().optional(),
  flatPln: z.coerce.number().min(0).nullable().optional(),
  individual: z.coerce.boolean().optional(),
  sortOrder: z.coerce.number().int().optional(),
});

export async function upsertBrokerTierAction(input: unknown) {
  await requireUser();
  const companyId = await getCurrentCompanyId();
  const data = upsertTierSchema.parse(input);
  // ratePct na UI to procent (0..100); zapis 0..1
  const ratePct =
    data.ratePct != null ? data.ratePct / 100 : null;
  const tierData = {
    brokerName: data.brokerName.trim(),
    minValueUsd: data.minValueUsd,
    maxValueUsd: data.maxValueUsd ?? null,
    ratePct,
    flatPln: data.flatPln ?? null,
    individual: data.individual ?? false,
    sortOrder: data.sortOrder ?? 0,
  };
  if (data.id) {
    await db.brokerCommissionTier.update({
      where: { id: data.id },
      data: tierData,
    });
  } else {
    await db.brokerCommissionTier.create({
      data: { ...tierData, companyId },
    });
  }
  revalidatePath("/ustawienia");
  revalidatePath("/ustawienia/posrednik");
  return { ok: true as const };
}

export async function deleteBrokerTierAction(id: string) {
  await requireUser();
  await db.brokerCommissionTier.delete({ where: { id } });
  revalidatePath("/ustawienia");
  revalidatePath("/ustawienia/posrednik");
  return { ok: true as const };
}

/**
 * Resetuje tabelę do wartości domyślnych z umowy ramowej Fullbax.
 * Usuwa istniejące widełki firmy dla tego pośrednika i wgrywa standard.
 */
export async function resetBrokerTiersToDefault(brokerName = "Fullbax") {
  await requireUser();
  const companyId = await getCurrentCompanyId();
  await db.brokerCommissionTier.deleteMany({
    where: { companyId, brokerName },
  });
  await db.brokerCommissionTier.createMany({
    data: FULLBAX_DEFAULT_TIERS.map((t) => ({
      ...t,
      companyId: companyId ?? null,
      brokerName,
    })),
  });
  revalidatePath("/ustawienia");
  revalidatePath("/ustawienia/posrednik");
  return { ok: true as const };
}
