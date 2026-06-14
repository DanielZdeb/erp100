"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";
import { Prisma } from "@/generated/prisma/client";

async function requireUser() {
  const session = await auth();
  if (!session?.user) throw new Error("Brak autoryzacji");
  return session.user;
}

// Re-export typów z lib/manual-document — żeby konsumenci nadal mogli
// importować je z @/server/product-manual (legacy entry point).
export type { ManualPage, ManualDocument } from "@/lib/manual-document";

const TEMPLATES = ["CLEAN", "TECHNICAL", "BRANDED"] as const;
export type ManualTemplateT = (typeof TEMPLATES)[number];

const PAGE_SIZES = ["A4", "A5", "A6"] as const;
export type ManualPageSizeT = (typeof PAGE_SIZES)[number];

const headerRangeSchema = z.object({
  id: z.string(),
  fromPage: z.number().int().min(1),
  toPage: z.number().int().min(1),
  lang: z.string().nullable(),
  title: z.string().nullable(),
  rightText: z.string().nullable(),
  rightImageUrl: z.string().nullable(),
});

const saveSchema = z.object({
  manualJson: z.unknown().nullable(),
  template: z.enum(TEMPLATES).optional(),
  pageSize: z.enum(PAGE_SIZES).optional(),
  headerLang: z.string().nullable().optional(),
  headerTitle: z.string().nullable().optional(),
  /** Tablica zakresów nagłówków per zakres stron. Null = wyczyść. */
  headerRanges: z.array(headerRangeSchema).nullable().optional(),
  footerCustom: z.string().nullable().optional(),
});

export async function saveProductManualAction(
  productId: string,
  input: unknown,
) {
  await requireUser();
  const companyId = await getCurrentCompanyId();
  const data = saveSchema.parse(input);

  // Walidacja własności produktu — nie pozwalamy edytować cudzych
  const product = await db.product.findFirst({
    where: { id: productId, companyId },
    select: { id: true },
  });
  if (!product) throw new Error("Produkt nie istnieje.");

  // Prisma JSON field: null → DbNull (kasuje wartość), reszta = cast na InputJsonValue.
  // Pola tekstowe: undefined = pomiń, null/string = nadpisz (null kasuje).
  // Trim empty strings to null żeby nie zaśmiecać DB pustkami.
  const normalize = (v: string | null | undefined) => {
    if (v === undefined) return undefined;
    if (v === null) return null;
    const t = v.trim();
    return t === "" ? null : t;
  };
  await db.product.update({
    where: { id: productId },
    data: {
      productManualJson:
        data.manualJson === null
          ? Prisma.JsonNull
          : (data.manualJson as Prisma.InputJsonValue),
      ...(data.template ? { manualTemplate: data.template } : {}),
      ...(data.pageSize ? { manualPageSize: data.pageSize } : {}),
      ...(data.headerLang !== undefined
        ? { manualHeaderLang: normalize(data.headerLang) }
        : {}),
      ...(data.headerTitle !== undefined
        ? { manualHeaderTitle: normalize(data.headerTitle) }
        : {}),
      ...(data.headerRanges !== undefined
        ? {
            manualHeaderRanges:
              data.headerRanges === null
                ? Prisma.JsonNull
                : (data.headerRanges as Prisma.InputJsonValue),
          }
        : {}),
      ...(data.footerCustom !== undefined
        ? { manualFooterCustom: normalize(data.footerCustom) }
        : {}),
    },
  });

  revalidatePath(`/produkty/${productId}/instrukcja`);
  revalidatePath(`/produkty/${productId}`);
  return { ok: true as const };
}
