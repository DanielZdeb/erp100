"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";

async function requireUser() {
  const session = await auth();
  if (!session?.user) throw new Error("Brak autoryzacji");
  return session.user;
}

/** 4 dozwolone layouty sekcji (lewy_prawy). */
const layoutEnum = z.enum([
  "TEXT_TEXT",
  "IMAGE_TEXT",
  "TEXT_IMAGE",
  "IMAGE_IMAGE",
]);

const createTemplateSchema = z.object({
  name: z.string().min(1, "Podaj nazwę szablonu"),
});

const updateTemplateSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
});

const upsertSectionSchema = z.object({
  templateId: z.string(),
  sectionId: z.string().optional(),
  name: z.string().min(1, "Podaj nazwę sekcji"),
  layout: layoutEnum,
  leftHint: z.string().nullable().optional(),
  rightHint: z.string().nullable().optional(),
});

const reorderSectionsSchema = z.object({
  templateId: z.string(),
  orderedSectionIds: z.array(z.string()),
});

export async function createDescriptionTemplateAction(input: unknown) {
  await requireUser();
  const companyId = await getCurrentCompanyId();
  const data = createTemplateSchema.parse(input);

  const existing = await db.descriptionTemplate.findFirst({
    where: { companyId, name: data.name.trim() },
  });
  if (existing) {
    throw new Error(`Szablon o nazwie „${data.name}" już istnieje.`);
  }

  const created = await db.descriptionTemplate.create({
    data: {
      companyId,
      name: data.name.trim(),
    },
    select: { id: true },
  });

  revalidatePath("/sprzedaz/szablony-opisu");
  return { ok: true as const, id: created.id };
}

export async function renameDescriptionTemplateAction(input: unknown) {
  await requireUser();
  const companyId = await getCurrentCompanyId();
  const data = updateTemplateSchema.parse(input);

  const template = await db.descriptionTemplate.findFirst({
    where: { id: data.id, companyId },
    select: { id: true },
  });
  if (!template) throw new Error("Szablon nie istnieje.");

  await db.descriptionTemplate.update({
    where: { id: data.id },
    data: { name: data.name.trim() },
  });

  revalidatePath("/sprzedaz/szablony-opisu");
  revalidatePath(`/sprzedaz/szablony-opisu/${data.id}`);
  return { ok: true as const };
}

export async function archiveDescriptionTemplateAction(id: string) {
  await requireUser();
  const companyId = await getCurrentCompanyId();
  const template = await db.descriptionTemplate.findFirst({
    where: { id, companyId },
    select: { id: true },
  });
  if (!template) throw new Error("Szablon nie istnieje.");

  await db.descriptionTemplate.update({
    where: { id },
    data: { archived: true },
  });
  revalidatePath("/sprzedaz/szablony-opisu");
  return { ok: true as const };
}

export async function upsertSectionAction(input: unknown) {
  await requireUser();
  const companyId = await getCurrentCompanyId();
  const data = upsertSectionSchema.parse(input);

  // Sprawdź że szablon należy do firmy
  const template = await db.descriptionTemplate.findFirst({
    where: { id: data.templateId, companyId },
    select: { id: true },
  });
  if (!template) throw new Error("Szablon nie istnieje.");

  if (data.sectionId) {
    await db.descriptionTemplateSection.update({
      where: { id: data.sectionId },
      data: {
        name: data.name.trim(),
        layout: data.layout,
        leftHint: data.leftHint?.trim() || null,
        rightHint: data.rightHint?.trim() || null,
      },
    });
  } else {
    // Nowa sekcja na końcu listy
    const maxSort = await db.descriptionTemplateSection.findFirst({
      where: { templateId: data.templateId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    await db.descriptionTemplateSection.create({
      data: {
        templateId: data.templateId,
        name: data.name.trim(),
        layout: data.layout,
        leftHint: data.leftHint?.trim() || null,
        rightHint: data.rightHint?.trim() || null,
        sortOrder: (maxSort?.sortOrder ?? -1) + 1,
      },
    });
  }

  revalidatePath(`/sprzedaz/szablony-opisu/${data.templateId}`);
  return { ok: true as const };
}

export async function deleteSectionAction(sectionId: string) {
  await requireUser();
  const companyId = await getCurrentCompanyId();
  const section = await db.descriptionTemplateSection.findFirst({
    where: { id: sectionId, template: { companyId } },
    select: { templateId: true },
  });
  if (!section) throw new Error("Sekcja nie istnieje.");

  await db.descriptionTemplateSection.delete({ where: { id: sectionId } });
  revalidatePath(`/sprzedaz/szablony-opisu/${section.templateId}`);
  return { ok: true as const };
}

export async function reorderSectionsAction(input: unknown) {
  await requireUser();
  const companyId = await getCurrentCompanyId();
  const data = reorderSectionsSchema.parse(input);

  const template = await db.descriptionTemplate.findFirst({
    where: { id: data.templateId, companyId },
    select: { id: true },
  });
  if (!template) throw new Error("Szablon nie istnieje.");

  await db.$transaction(async (tx) => {
    for (let i = 0; i < data.orderedSectionIds.length; i++) {
      await tx.descriptionTemplateSection.update({
        where: { id: data.orderedSectionIds[i] },
        data: { sortOrder: i },
      });
    }
  });

  revalidatePath(`/sprzedaz/szablony-opisu/${data.templateId}`);
  return { ok: true as const };
}

/** Przypisanie szablonu opisu do produktu (z poziomu karty produktu w Sprzedaży). */
export async function setProductDescriptionTemplateAction(
  productId: string,
  templateId: string | null,
) {
  await requireUser();
  const companyId = await getCurrentCompanyId();

  const product = await db.product.findFirst({
    where: { id: productId, companyId },
    select: { id: true },
  });
  if (!product) throw new Error("Produkt nie istnieje.");

  if (templateId) {
    const tpl = await db.descriptionTemplate.findFirst({
      where: { id: templateId, companyId },
      select: { id: true },
    });
    if (!tpl) throw new Error("Szablon nie istnieje.");
  }

  await db.product.update({
    where: { id: productId },
    data: { descriptionTemplateId: templateId },
  });

  revalidatePath(`/sprzedaz/produkty/${productId}`);
  revalidatePath("/sprzedaz/produkty");
  return { ok: true as const };
}

/** Zapis wypełnionego contentu per sekcja na karcie produktu. */
const contentSchema = z.record(
  z.string(),
  z.object({
    leftText: z.string().nullable().optional(),
    rightText: z.string().nullable().optional(),
    leftImageUrl: z.string().nullable().optional(),
    rightImageUrl: z.string().nullable().optional(),
  }),
);

export async function setProductDescriptionContentAction(
  productId: string,
  content: unknown,
) {
  await requireUser();
  const companyId = await getCurrentCompanyId();
  const parsed = contentSchema.parse(content);

  const product = await db.product.findFirst({
    where: { id: productId, companyId },
    select: { id: true },
  });
  if (!product) throw new Error("Produkt nie istnieje.");

  await db.product.update({
    where: { id: productId },
    data: { descriptionContentJson: parsed },
  });

  revalidatePath(`/sprzedaz/produkty/${productId}`);
  return { ok: true as const };
}
