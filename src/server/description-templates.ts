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
  leftImagePrompt: z.string().nullable().optional(),
  rightImagePrompt: z.string().nullable().optional(),
  leftTextPrompt: z.string().nullable().optional(),
  rightTextPrompt: z.string().nullable().optional(),
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

  const aiFields = {
    leftImagePrompt: data.leftImagePrompt?.trim() || null,
    rightImagePrompt: data.rightImagePrompt?.trim() || null,
    leftTextPrompt: data.leftTextPrompt?.trim() || null,
    rightTextPrompt: data.rightTextPrompt?.trim() || null,
  };

  if (data.sectionId) {
    await db.descriptionTemplateSection.update({
      where: { id: data.sectionId },
      data: {
        name: data.name.trim(),
        layout: data.layout,
        leftHint: data.leftHint?.trim() || null,
        rightHint: data.rightHint?.trim() || null,
        ...aiFields,
      },
    });
  } else {
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
        ...aiFields,
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

/**
 * Generuje TEKST przez Claude na podstawie promptu z szablonu sekcji +
 * danych produktu. Zwraca tekst (UI sam wstawia do contentu sekcji).
 */
export async function generateSectionTextAction(
  productId: string,
  sectionId: string,
  side: "left" | "right",
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  try {
    await requireUser();
    const companyId = await getCurrentCompanyId();
    if (!process.env.ANTHROPIC_API_KEY) {
      return {
        ok: false,
        error:
          "Brak ANTHROPIC_API_KEY w env — generowanie tekstu wymaga klucza Claude.",
      };
    }

    const [product, section] = await Promise.all([
      db.product.findFirst({
        where: { id: productId, companyId },
        select: {
          name: true,
          productCode: true,
          color: true,
          shortDescription: true,
          category: { select: { name: true } },
        },
      }),
      db.descriptionTemplateSection.findFirst({
        where: { id: sectionId, template: { companyId } },
        select: {
          name: true,
          leftTextPrompt: true,
          rightTextPrompt: true,
        },
      }),
    ]);
    if (!product) return { ok: false, error: "Produkt nie istnieje." };
    if (!section) return { ok: false, error: "Sekcja nie istnieje." };

    const sectionPrompt =
      side === "left" ? section.leftTextPrompt : section.rightTextPrompt;
    if (!sectionPrompt?.trim()) {
      return {
        ok: false,
        error: "Brak promptu AI dla tego slotu w szablonie. Uzupełnij w edytorze szablonu.",
      };
    }

    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const productCtx = [
      `Product name: ${product.name}`,
      product.productCode && `SKU: ${product.productCode}`,
      product.category?.name && `Category: ${product.category.name}`,
      product.color && `Color: ${product.color}`,
      product.shortDescription && `Short description: ${product.shortDescription}`,
    ]
      .filter(Boolean)
      .join("\n");

    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      messages: [
        {
          role: "user",
          content:
            `You are writing product description copy for an e-commerce store. ` +
            `Write in Polish. Keep it concise, benefit-focused, no marketing fluff.\n\n` +
            `=== Section context (from template) ===\n${section.name}\n\n` +
            `=== Instructions ===\n${sectionPrompt.trim()}\n\n` +
            `=== Product ===\n${productCtx}\n\n` +
            `Return ONLY the final text — no preamble, no quotes, no markdown headers.`,
        },
      ],
    });
    const text = msg.content
      .filter((c) => c.type === "text")
      .map((c) => (c as { type: "text"; text: string }).text)
      .join("\n")
      .trim();
    if (!text) return { ok: false, error: "Claude zwrócił pusty tekst." };
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Błąd AI." };
  }
}

/**
 * Generuje OBRAZ przez Nano Banana Pro na podstawie promptu z szablonu sekcji
 * + galerii produktu jako referencji. Zapisuje do uploads i zwraca URL —
 * UI sam wstawia URL do contentu sekcji (slot left/right).
 */
export async function generateSectionImageAction(
  productId: string,
  sectionId: string,
  side: "left" | "right",
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    await requireUser();
    const companyId = await getCurrentCompanyId();

    const [product, section] = await Promise.all([
      db.product.findFirst({
        where: { id: productId, companyId },
        select: {
          id: true,
          name: true,
          color: true,
          images: {
            orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
            select: { url: true },
            take: 3,
          },
        },
      }),
      db.descriptionTemplateSection.findFirst({
        where: { id: sectionId, template: { companyId } },
        select: {
          name: true,
          leftImagePrompt: true,
          rightImagePrompt: true,
        },
      }),
    ]);
    if (!product) return { ok: false, error: "Produkt nie istnieje." };
    if (!section) return { ok: false, error: "Sekcja nie istnieje." };

    const sectionPrompt =
      side === "left" ? section.leftImagePrompt : section.rightImagePrompt;
    if (!sectionPrompt?.trim()) {
      return {
        ok: false,
        error: "Brak promptu AI dla tego slotu w szablonie. Uzupełnij w edytorze szablonu.",
      };
    }

    const { generateProductPhoto } = await import("@/lib/photo-gemini");
    const { uploadFile } = await import("@/lib/storage");

    const finalPrompt =
      `${sectionPrompt.trim()}\n\n` +
      `Product: ${product.name}${product.color ? `, color: ${product.color}` : ""}\n` +
      `Section context: ${section.name}`;

    const result = await generateProductPhoto({
      prompt: finalPrompt,
      quality: "NANO_BANANA_PRO",
      aspectRatio: "1:1",
      referenceImageUrls: product.images.map((i) => i.url),
    });
    if (!result.ok) return { ok: false, error: result.error };

    const ext = result.contentType.includes("jpeg") ? "jpg" : "png";
    const file = new File(
      [new Uint8Array(result.imageBuffer)],
      `section-${sectionId}-${side}-${Date.now()}.${ext}`,
      { type: result.contentType },
    );
    const uploaded = await uploadFile(file, {
      folder: `products/${product.id}/images`,
    });
    return { ok: true, url: uploaded.url };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Błąd AI." };
  }
}

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
