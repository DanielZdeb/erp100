"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";

/**
 * Server actions dla produktów typu ZESTAW (compositionMode='ZESTAW').
 *
 * Zestaw to wirtualny produkt złożony z istniejących produktów (nie komponentów).
 * Nie jest fizycznie importowany — jego składniki przychodzą niezależnie.
 * Pakowanie: INDIVIDUAL_PACKAGING (sumuje pakowania składowych) lub
 * SINGLE_CARTON (jeden dedykowany karton wysyłkowy z biblioteki).
 */

async function requireUser() {
  const session = await auth();
  if (!session?.user) throw new Error("Brak autoryzacji");
  return session.user;
}

const optionalNumber = z
  .union([z.number(), z.string()])
  .nullable()
  .optional()
  .transform((v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  });

const optionalString = z
  .string()
  .nullable()
  .optional()
  .transform((v) => {
    if (!v) return null;
    const t = v.trim();
    return t || null;
  });

const bundleSlotSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().positive().default(1),
  allowVariants: z.boolean().default(true),
  poolCategoryIds: z.array(z.string()).default([]),
  poolProductIds: z.array(z.string()).default([]),
});

const bundleSchema = z
  .object({
    name: z.string().min(1, "Podaj nazwę zestawu"),
    productCode: z.string().min(1, "Podaj kod zestawu"),
    code128: optionalString,
    categoryId: z.string().min(1, "Wybierz kategorię"),

    slots: z
      .array(bundleSlotSchema)
      .min(1, "Zestaw musi mieć co najmniej jeden składnik"),

    shippingMode: z.enum(["INDIVIDUAL_PACKAGING", "SINGLE_CARTON"]),
    shippingBoxId: optionalString,

    defaultUnitPriceUsd: optionalNumber,
    defaultUnitPriceCny: optionalNumber,
    defaultSalePriceAllegroPln: optionalNumber,
    defaultSalePriceSklepPln: optionalNumber,
  })
  .superRefine((data, ctx) => {
    if (data.shippingMode === "SINGLE_CARTON" && !data.shippingBoxId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Tryb 'Wszystkie razem w 1' wymaga wyboru kartonu z biblioteki.",
      });
    }
    const ids = data.slots.map((s) => s.productId);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Te same składniki nie mogą się powtarzać — łącz przez ilość.",
      });
    }
  });

export type BundleInput = z.infer<typeof bundleSchema>;

export async function createBundleAction(input: unknown) {
  await requireUser();
  const companyId = await getCurrentCompanyId();
  const data = bundleSchema.parse(input);

  // Walidacja: SKU musi być unikalne w obrębie firmy
  const existing = await db.product.findFirst({
    where: { companyId, productCode: data.productCode.trim() },
  });
  if (existing) {
    throw new Error(`Produkt o kodzie ${data.productCode} już istnieje.`);
  }

  // Walidacja: wszystkie składniki muszą istnieć w tej samej firmie.
  // Komponenty są dozwolone — wnoszą tylko swoją wagę w kalkulacji pakowania.
  const slotProducts = await db.product.findMany({
    where: { companyId, id: { in: data.slots.map((s) => s.productId) } },
    select: { id: true, isComponent: true, name: true, categoryId: true },
  });
  if (slotProducts.length !== data.slots.length) {
    throw new Error("Niektóre składniki nie istnieją.");
  }

  // Walidacja: karton z biblioteki musi należeć do tej samej firmy
  if (data.shippingMode === "SINGLE_CARTON" && data.shippingBoxId) {
    const box = await db.shippingBox.findFirst({
      where: { id: data.shippingBoxId, companyId },
      select: { id: true },
    });
    if (!box) throw new Error("Wybrany karton wysyłkowy nie istnieje.");
  }

  const created = await db.product.create({
    data: {
      companyId,
      name: data.name.trim(),
      productCode: data.productCode.trim(),
      code128: data.code128,
      categoryId: data.categoryId,
      compositionMode: "ZESTAW",
      isComponent: false,
      status: "AKTYWNY",
      // Zestaw nie ma własnych wymiarów importowych — pakowanie pochodzi
      // ze składników (INDIVIDUAL_PACKAGING) lub z bundleShippingBox (SINGLE_CARTON).
      importMode: "KARTON",
      bundleShippingMode: data.shippingMode,
      bundleShippingBoxId:
        data.shippingMode === "SINGLE_CARTON" ? data.shippingBoxId : null,
      defaultUnitPriceUsd: data.defaultUnitPriceUsd,
      defaultUnitPriceCny: data.defaultUnitPriceCny,
      defaultSalePriceAllegroPln: data.defaultSalePriceAllegroPln,
      defaultSalePriceSklepPln: data.defaultSalePriceSklepPln,
    },
  });

  // Tworzymy sloty (ProductComponent) — każdy z poolem wariantów
  for (let i = 0; i < data.slots.length; i++) {
    const slot = data.slots[i];
    await db.productComponent.create({
      data: {
        productId: created.id,
        componentId: slot.productId,
        quantity: slot.quantity,
        sortOrder: i,
        allowVariants: slot.allowVariants,
        poolCategories:
          slot.poolCategoryIds.length > 0
            ? { connect: slot.poolCategoryIds.map((id) => ({ id })) }
            : undefined,
        poolProducts:
          slot.poolProductIds.length > 0
            ? { connect: slot.poolProductIds.map((id) => ({ id })) }
            : undefined,
      },
    });
  }

  revalidatePath("/produkty");
  return { ok: true as const, id: created.id };
}


const setBundleShippingSchema = z.object({
  mode: z.enum(["INDIVIDUAL_PACKAGING", "SINGLE_CARTON"]),
  shippingBoxId: z.string().nullable(),
});

/**
 * Aktualizuje tryb pakowania zestawu + przypięty karton (dla SINGLE_CARTON).
 * INDIVIDUAL_PACKAGING → kasuje bundleShippingBoxId.
 */
export async function setBundleShippingAction(
  productId: string,
  input: unknown,
) {
  await requireUser();
  const companyId = await getCurrentCompanyId();
  const data = setBundleShippingSchema.parse(input);

  const product = await db.product.findFirst({
    where: { id: productId, companyId },
    select: { id: true, compositionMode: true },
  });
  if (!product) throw new Error("Produkt nie istnieje.");
  if (product.compositionMode !== "ZESTAW") {
    throw new Error("Tryb pakowania zestawu można ustawić tylko dla produktu typu ZESTAW.");
  }
  if (data.mode === "SINGLE_CARTON" && data.shippingBoxId) {
    const box = await db.shippingBox.findFirst({
      where: { id: data.shippingBoxId, companyId },
      select: { id: true },
    });
    if (!box) throw new Error("Wybrany karton wysyłkowy nie istnieje.");
  }

  await db.product.update({
    where: { id: productId },
    data: {
      bundleShippingMode: data.mode,
      bundleShippingBoxId:
        data.mode === "SINGLE_CARTON" ? data.shippingBoxId : null,
    },
  });

  revalidatePath(`/produkty/${productId}`);
  revalidatePath(`/produkty/${productId}/pakowanie`);
  return { ok: true as const };
}
