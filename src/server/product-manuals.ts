"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";
import { uploadFile } from "@/lib/storage";
import { Prisma } from "@/generated/prisma/client";

async function requireUser() {
  const session = await auth();
  if (!session?.user) throw new Error("Brak autoryzacji");
  return session.user;
}

const TEMPLATES = ["CLEAN", "TECHNICAL", "BRANDED"] as const;
const PAGE_SIZES = ["A4", "A5", "A6"] as const;

// ─── CRUD: lista jest po stronie page.tsx (read-only). Tu mutacje. ────

const createSchema = z.object({
  name: z.string().min(1, "Nazwa wymagana"),
  kind: z.enum(["STANDARD", "LEAFLET"]).optional(),
});

export async function createProductManualAction(input: unknown) {
  await requireUser();
  const companyId = await getCurrentCompanyId();
  const data = createSchema.parse(input);

  // Auto-fill logo w kolorze z ustawień firmy (jeśli było zarejestrowane).
  // Inaczej user musi sam je wgrać w okładce instrukcji.
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { logoColorUrl: true },
  });

  // Standardowe ustawienia początkowe: A5 + Roboto + rozmiary dopasowane do A5
  // + logo firmy (jeśli jest). Wszystko edytowalne później przez Style/Cover.
  const created = await db.productManual.create({
    data: {
      companyId,
      name: data.name.trim(),
      kind: data.kind ?? "STANDARD",
      pageSize: "A5",
      fontFamily: "Roboto",
      bodyFontSize: 10,
      h1FontSize: 17,
      h2FontSize: 13,
      h3FontSize: 11,
      logoImageUrl: company?.logoColorUrl ?? null,
    },
    select: { id: true },
  });

  revalidatePath("/produkty/instrukcje");
  return { ok: true as const, id: created.id };
}

export async function deleteProductManualAction(id: string) {
  await requireUser();
  const companyId = await getCurrentCompanyId();

  const manual = await db.productManual.findFirst({
    where: { id, companyId },
    select: { id: true },
  });
  if (!manual) throw new Error("Instrukcja nie istnieje.");

  // Cascade Prisma posprząta assignments
  await db.productManual.delete({ where: { id } });
  revalidatePath("/produkty/instrukcje");
  return { ok: true as const };
}

// ─── Edycja treści (rename + zawartość + ustawienia) ─────────────────

const headerRangeSchema = z.object({
  id: z.string(),
  fromPage: z.number().int().min(1),
  toPage: z.number().int().min(1),
  lang: z.string().nullable(),
  title: z.string().nullable(),
  rightText: z.string().nullable(),
  rightImageUrl: z.string().nullable(),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  manualJson: z.unknown().nullable().optional(),
  template: z.enum(TEMPLATES).optional(),
  pageSize: z.enum(PAGE_SIZES).optional(),
  headerLang: z.string().nullable().optional(),
  headerTitle: z.string().nullable().optional(),
  headerRanges: z.array(headerRangeSchema).nullable().optional(),
  footerCustom: z.string().nullable().optional(),
  // Sztywne ustawienia typograficzne dla całej instrukcji
  fontFamily: z.string().nullable().optional(),
  bodyFontSize: z.number().int().min(4).max(200).nullable().optional(),
  h1FontSize: z.number().int().min(4).max(200).nullable().optional(),
  h2FontSize: z.number().int().min(4).max(200).nullable().optional(),
  h3FontSize: z.number().int().min(4).max(200).nullable().optional(),
  logoImageUrl: z.string().nullable().optional(),
  logoHeightPt: z.number().int().min(40).max(280).nullable().optional(),
  coverSubtitle: z.string().nullable().optional(),
});

export async function updateProductManualAction(id: string, input: unknown) {
  await requireUser();
  const companyId = await getCurrentCompanyId();
  const data = updateSchema.parse(input);

  const manual = await db.productManual.findFirst({
    where: { id, companyId },
    select: { id: true },
  });
  if (!manual) throw new Error("Instrukcja nie istnieje.");

  const normalize = (v: string | null | undefined) => {
    if (v === undefined) return undefined;
    if (v === null) return null;
    const t = v.trim();
    return t === "" ? null : t;
  };

  await db.productManual.update({
    where: { id },
    data: {
      ...(data.name ? { name: data.name.trim() } : {}),
      ...(data.manualJson !== undefined
        ? {
            manualJson:
              data.manualJson === null
                ? Prisma.JsonNull
                : (data.manualJson as Prisma.InputJsonValue),
          }
        : {}),
      ...(data.template ? { template: data.template } : {}),
      ...(data.pageSize ? { pageSize: data.pageSize } : {}),
      ...(data.headerLang !== undefined
        ? { headerLang: normalize(data.headerLang) }
        : {}),
      ...(data.headerTitle !== undefined
        ? { headerTitle: normalize(data.headerTitle) }
        : {}),
      ...(data.headerRanges !== undefined
        ? {
            headerRanges:
              data.headerRanges === null
                ? Prisma.JsonNull
                : (data.headerRanges as Prisma.InputJsonValue),
          }
        : {}),
      ...(data.footerCustom !== undefined
        ? { footerCustom: normalize(data.footerCustom) }
        : {}),
      ...(data.fontFamily !== undefined
        ? { fontFamily: normalize(data.fontFamily) }
        : {}),
      ...(data.bodyFontSize !== undefined
        ? { bodyFontSize: data.bodyFontSize }
        : {}),
      ...(data.h1FontSize !== undefined ? { h1FontSize: data.h1FontSize } : {}),
      ...(data.h2FontSize !== undefined ? { h2FontSize: data.h2FontSize } : {}),
      ...(data.h3FontSize !== undefined ? { h3FontSize: data.h3FontSize } : {}),
      ...(data.logoImageUrl !== undefined
        ? { logoImageUrl: normalize(data.logoImageUrl) }
        : {}),
      ...(data.logoHeightPt !== undefined
        ? { logoHeightPt: data.logoHeightPt }
        : {}),
      ...(data.coverSubtitle !== undefined
        ? { coverSubtitle: normalize(data.coverSubtitle) }
        : {}),
    },
  });

  revalidatePath(`/produkty/instrukcje/${id}`);
  revalidatePath("/produkty/instrukcje");
  return { ok: true as const };
}

// ─── Duplikacja instrukcji ──────────────────────────────────────────

const duplicateSchema = z.object({
  newName: z.string().min(1, "Podaj nazwę nowej instrukcji"),
});

export async function duplicateProductManualAction(
  sourceId: string,
  input: unknown,
) {
  await requireUser();
  const companyId = await getCurrentCompanyId();
  const { newName } = duplicateSchema.parse(input);

  const src = await db.productManual.findFirst({
    where: { id: sourceId, companyId },
    select: {
      manualJson: true,
      template: true,
      pageSize: true,
      kind: true,
      headerLang: true,
      headerTitle: true,
      headerRanges: true,
      footerCustom: true,
      fontFamily: true,
      bodyFontSize: true,
      h1FontSize: true,
      h2FontSize: true,
      h3FontSize: true,
      logoImageUrl: true,
      logoHeightPt: true,
      coverSubtitle: true,
    },
  });
  if (!src) throw new Error("Instrukcja źródłowa nie istnieje.");

  const created = await db.productManual.create({
    data: {
      companyId,
      name: newName.trim(),
      // Kopia całej zawartości — bez przypisań (kopia trafia do biblioteki czysta)
      manualJson: src.manualJson ?? undefined,
      template: src.template,
      pageSize: src.pageSize,
      kind: src.kind,
      headerLang: src.headerLang,
      headerTitle: src.headerTitle,
      headerRanges: src.headerRanges ?? undefined,
      footerCustom: src.footerCustom,
      fontFamily: src.fontFamily,
      bodyFontSize: src.bodyFontSize,
      h1FontSize: src.h1FontSize,
      h2FontSize: src.h2FontSize,
      h3FontSize: src.h3FontSize,
      logoImageUrl: src.logoImageUrl,
      logoHeightPt: src.logoHeightPt,
      coverSubtitle: src.coverSubtitle,
    },
    select: { id: true },
  });

  revalidatePath("/produkty/instrukcje");
  return { ok: true as const, id: created.id };
}

// ─── Upload obrazka dla instrukcji ──────────────────────────────────

export async function uploadManualImageAction(
  manualId: string,
  formData: FormData,
): Promise<string> {
  await requireUser();
  const companyId = await getCurrentCompanyId();
  const manual = await db.productManual.findFirst({
    where: { id: manualId, companyId },
    select: { id: true },
  });
  if (!manual) throw new Error("Instrukcja nie istnieje.");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Brak pliku.");
  }
  if (!file.type.startsWith("image/")) {
    throw new Error("To nie jest grafika.");
  }

  const uploaded = await uploadFile(file, {
    folder: `manuals/${manualId}/images`,
  });
  return uploaded.url;
}

// ─── Assignments — produkty i kategorie ──────────────────────────────

const assignSchema = z.object({
  productIds: z.array(z.string()),
  categories: z.array(
    z.object({
      categoryId: z.string(),
      includeDescendants: z.boolean(),
    }),
  ),
});

export async function setManualAssignmentsAction(
  manualId: string,
  input: unknown,
) {
  await requireUser();
  const companyId = await getCurrentCompanyId();
  const data = assignSchema.parse(input);

  const manual = await db.productManual.findFirst({
    where: { id: manualId, companyId },
    select: { id: true },
  });
  if (!manual) throw new Error("Instrukcja nie istnieje.");

  // Sprawdź że produkty + kategorie należą do firmy
  if (data.productIds.length > 0) {
    const count = await db.product.count({
      where: { companyId, id: { in: data.productIds } },
    });
    if (count !== data.productIds.length) {
      throw new Error("Niektóre produkty nie istnieją w tej firmie.");
    }
  }
  if (data.categories.length > 0) {
    const ids = data.categories.map((c) => c.categoryId);
    const count = await db.category.count({
      where: { companyId, id: { in: ids } },
    });
    if (count !== ids.length) {
      throw new Error("Niektóre kategorie nie istnieją w tej firmie.");
    }
  }

  // Interactive transaction zamiast batch `$transaction([...])` — pewnie
  // współpracuje z driver adapters (PrismaPg) i pozwala na warunkowe
  // wywołania bez ryzyka „All elements of the array need to be Prisma
  // Client promises" gdy spread daje pustą listę.
  await db.$transaction(async (tx) => {
    await tx.productManualProduct.deleteMany({ where: { manualId } });
    await tx.productManualCategory.deleteMany({ where: { manualId } });
    if (data.productIds.length > 0) {
      await tx.productManualProduct.createMany({
        data: data.productIds.map((productId) => ({
          manualId,
          productId,
        })),
      });
    }
    if (data.categories.length > 0) {
      await tx.productManualCategory.createMany({
        data: data.categories.map((c) => ({
          manualId,
          categoryId: c.categoryId,
          includeDescendants: c.includeDescendants,
        })),
      });
    }
  });

  revalidatePath(`/produkty/instrukcje/${manualId}`);
  revalidatePath("/produkty/instrukcje");
  return { ok: true as const };
}
