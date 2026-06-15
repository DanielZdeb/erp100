"use server";

/**
 * Logowanie i odczyt kosztow AI per produkt.
 *
 * logProductAiCost — wolane z innych server actions po wygenerowaniu / edycji.
 * Nigdy nie rzuca — bledy lokujemy w warn, zeby nie psuc UX glownej akcji.
 *
 * listProductAiCostsAction — zwraca historie kosztow + sume; dla dropdownu
 * "Historia AI" w karcie produktu.
 */

import { db } from "@/lib/db";
import { auth } from "@/auth";
import { getCurrentCompanyId } from "@/lib/tenant";

type Action =
  | "TEXT_GEN"
  | "IMAGE_GEN"
  | "IMAGE_EDIT"
  | "BULK_EDIT"
  | "CUSTOM_GEN"
  | "COPY_IMAGES_AI"
  | "DRAFT_TEMPLATE"
  | "COPY_TEMPLATE_AI";

async function requireUser() {
  const session = await auth();
  if (!session?.user) throw new Error("Brak autoryzacji");
  return session.user;
}

/**
 * Fire-and-forget log kosztu. Nigdy nie rzuca — wewnetrzny try/catch.
 */
export async function logProductAiCost(input: {
  productId: string;
  companyId: string;
  action: Action;
  label: string;
  usd: number;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.productAiCost.create({
      data: {
        productId: input.productId,
        companyId: input.companyId,
        action: input.action,
        label: input.label.slice(0, 240),
        usd: input.usd,
        metadata: input.metadata
          ? (input.metadata as unknown as object)
          : undefined,
      },
    });
  } catch (e) {
    console.warn(
      `[ai-cost-log] failed to log: ${e instanceof Error ? e.message : "?"}`,
    );
  }
}

export interface AiCostEntry {
  id: string;
  action: Action;
  label: string;
  usd: number;
  createdAt: string;
  metadata: Record<string, unknown> | null;
}

export async function listProductAiCostsAction(
  productId: string,
): Promise<{
  ok: true;
  entries: AiCostEntry[];
  totals: {
    total: number;
    byAction: Record<string, number>;
    count: number;
  };
} | { ok: false; error: string }> {
  try {
    await requireUser();
    const companyId = await getCurrentCompanyId();
    const product = await db.product.findFirst({
      where: { id: productId, companyId },
      select: { id: true },
    });
    if (!product) return { ok: false, error: "Produkt nie istnieje." };

    const entries = await db.productAiCost.findMany({
      where: { productId },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        action: true,
        label: true,
        usd: true,
        createdAt: true,
        metadata: true,
      },
    });

    const total = entries.reduce((sum, e) => sum + e.usd, 0);
    const byAction: Record<string, number> = {};
    for (const e of entries) {
      byAction[e.action] = (byAction[e.action] ?? 0) + e.usd;
    }

    return {
      ok: true,
      entries: entries.map((e) => ({
        id: e.id,
        action: e.action as Action,
        label: e.label,
        usd: e.usd,
        createdAt: e.createdAt.toISOString(),
        metadata: e.metadata as Record<string, unknown> | null,
      })),
      totals: { total, byAction, count: entries.length },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Blad." };
  }
}
