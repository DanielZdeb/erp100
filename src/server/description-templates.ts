"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";
import { logProductAiCost } from "@/server/product-ai-costs";
import { markdownToHtml } from "@/lib/markdown-to-html";

const NANO_BANANA_PRO_USD = 0.134;

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

  const sectionSelect = {
    id: true,
    name: true,
    layout: true,
    sortOrder: true,
    leftHint: true,
    rightHint: true,
    leftImagePrompt: true,
    rightImagePrompt: true,
    leftTextPrompt: true,
    rightTextPrompt: true,
  } as const;

  let section;
  if (data.sectionId) {
    section = await db.descriptionTemplateSection.update({
      where: { id: data.sectionId },
      data: {
        name: data.name.trim(),
        layout: data.layout,
        leftHint: data.leftHint?.trim() || null,
        rightHint: data.rightHint?.trim() || null,
        ...aiFields,
      },
      select: sectionSelect,
    });
  } else {
    const maxSort = await db.descriptionTemplateSection.findFirst({
      where: { templateId: data.templateId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    section = await db.descriptionTemplateSection.create({
      data: {
        templateId: data.templateId,
        name: data.name.trim(),
        layout: data.layout,
        leftHint: data.leftHint?.trim() || null,
        rightHint: data.rightHint?.trim() || null,
        ...aiFields,
        sortOrder: (maxSort?.sortOrder ?? -1) + 1,
      },
      select: sectionSelect,
    });
  }

  revalidatePath(`/sprzedaz/szablony-opisu/${data.templateId}`);
  return { ok: true as const, section };
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

/**
 * Zapis notatek sprzedażowych produktu — wolny tekst od operatora,
 * dołączany jako kontekst do każdego promptu AI generującego tekst/szablon.
 */
export async function updateProductSalesNotesAction(
  productId: string,
  notes: string,
) {
  await requireUser();
  const companyId = await getCurrentCompanyId();

  const product = await db.product.findFirst({
    where: { id: productId, companyId },
    select: { id: true },
  });
  if (!product) throw new Error("Produkt nie istnieje.");

  await db.product.update({
    where: { id: productId },
    data: { salesNotes: notes.trim() || null },
  });

  revalidatePath(`/sprzedaz/produkty/${productId}`);
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
    // Per-product override layoutu sekcji — kiedy user zmieni typ slotu
    // z poziomu /sprzedaz/produkty/[id] (np. Tekst+Tekst → Obraz+Tekst).
    // Bez tego — używamy layoutu z szablonu.
    layout: layoutEnum.nullable().optional(),
    // Custom-section markers — sekcje dodane per-produkt (poza szablonem).
    // Renderowane na koncu listy w kolejnosci _order asc.
    _isCustom: z.boolean().optional(),
    _name: z.string().nullable().optional(),
    _order: z.number().nullable().optional(),
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
  extraPrompt: string = "",
  customPromptOverride: string = "",
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
          salesNotes: true,
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

    const effectivePrompt = customPromptOverride.trim()
      ? customPromptOverride.trim()
      : side === "left"
        ? section.leftTextPrompt
        : section.rightTextPrompt;
    if (!effectivePrompt?.trim()) {
      return {
        ok: false,
        error: "Brak promptu AI dla tego slotu. Uzupełnij w szablonie albo wpisz w polu \"Bazowy prompt\".",
      };
    }
    const sectionPrompt = effectivePrompt;

    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const productCtx = [
      `Product name: ${product.name}`,
      product.productCode && `SKU: ${product.productCode}`,
      product.category?.name && `Category: ${product.category.name}`,
      product.color && `Color: ${product.color}`,
      product.shortDescription && `Short description: ${product.shortDescription}`,
      product.salesNotes && `Operator notes about this product (USE THESE FACTS):\n${product.salesNotes}`,
    ]
      .filter(Boolean)
      .join("\n");

    const extraBlock = extraPrompt?.trim()
      ? `\n\n=== Additional context from operator ===\n${extraPrompt.trim()}\n\n`
      : "";
    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content:
            `You are writing product description copy for an e-commerce store. ` +
            `Write in Polish. Keep it concise, benefit-focused, no marketing fluff.\n\n` +
            `=== Section context (from template) ===\n${section.name}\n\n` +
            `=== Instructions ===\n${sectionPrompt.trim()}${extraBlock}` +
            `=== Product ===\n${productCtx}\n\n` +
            `=== Formatting rules ===\n` +
            `Return HTML (not Markdown) using ONLY these tags: <h2>, <h3>, <p>, <ul>, <ol>, <li>, <strong>, <em>, <u>, <br>.\n` +
            `- Use <h2> for one major heading (if any), <h3> for sub-headings.\n` +
            `- Use <ul><li> for bullet lists, <ol><li> for numbered.\n` +
            `- Use <strong> for key benefits and important phrases.\n` +
            `- Use <em> for emphasis, <u> sparingly for crucial details.\n` +
            `- Short paragraphs (2-3 sentences max).\n` +
            `Return ONLY the HTML — no preamble, no \`\`\`html, no quotes around the output.`,
        },
      ],
    });
    const rawText = msg.content
      .filter((c) => c.type === "text")
      .map((c) => (c as { type: "text"; text: string }).text)
      .join("\n")
      .trim();
    if (!rawText) return { ok: false, error: "Claude zwrócił pusty tekst." };
    // Fallback gdy Claude mimo wszystko zwroci markdown.
    const text = markdownToHtml(rawText);

    const inp = msg.usage.input_tokens ?? 0;
    const out = msg.usage.output_tokens ?? 0;
    const usd = (inp * 3) / 1_000_000 + (out * 15) / 1_000_000;
    void logProductAiCost({
      productId,
      companyId,
      action: "TEXT_GEN",
      label: `Generuj tekst sekcji "${section.name}" (${side})`,
      usd,
      metadata: { inputTokens: inp, outputTokens: out, model: "claude-sonnet-4-6" },
    });
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
  extraPrompt: string = "",
  extraRefUrls: string[] = [],
  regenerateFromUrl: string | null = null,
  customPromptOverride: string = "",
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

    const effectivePrompt = customPromptOverride.trim()
      ? customPromptOverride.trim()
      : side === "left"
        ? section.leftImagePrompt
        : section.rightImagePrompt;
    if (!effectivePrompt?.trim()) {
      return {
        ok: false,
        error: "Brak promptu AI dla tego slotu. Uzupełnij w szablonie albo wpisz w polu \"Bazowy prompt\".",
      };
    }
    const sectionPrompt = effectivePrompt;

    const { generateProductPhoto } = await import("@/lib/photo-gemini");
    const { uploadFile } = await import("@/lib/storage");

    const refs = [
      ...(regenerateFromUrl ? [regenerateFromUrl] : []),
      ...extraRefUrls
        .filter((u) => typeof u === "string" && u.length > 0)
        .slice(0, 4),
      ...product.images.map((i) => i.url),
    ];
    const editHint = regenerateFromUrl
      ? `\n\nThis is a RE-EDIT. The FIRST attached reference is the current image to edit — keep its composition, camera angle, framing exactly. Apply only the change described.\n`
      : "";
    const extraBlock = extraPrompt?.trim()
      ? `\n\nOperator additional context: ${extraPrompt.trim()}\n`
      : "";
    const finalPrompt =
      `${sectionPrompt.trim()}\n\n` +
      `Product: ${product.name}${product.color ? `, color: ${product.color}` : ""}\n` +
      `Section context: ${section.name}` +
      extraBlock +
      editHint;

    const result = await generateProductPhoto({
      prompt: finalPrompt,
      quality: "NANO_BANANA_PRO",
      aspectRatio: "1:1",
      referenceImageUrls: refs,
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

    // Dorzucamy też do galerii produktu — żeby wygenerowane przez szablon
    // grafiki były dostępne jako zwykłe ProductImage (do dalszego użycia
    // w innych sekcjach, ofercie, marketingu). Best-effort: błąd w tej
    // operacji nie wywala całej akcji (URL z descriptionContent zostaje
    // niezależnie). isPrimary=false — generowane przez szablon nie powinny
    // przejąć roli głównej miniatury produktu.
    void db.productImage
      .create({
        data: {
          productId: product.id,
          url: uploaded.url,
          thumbnailWebpUrl: uploaded.thumbnailWebpUrl,
          alt: `${section.name} (${side})`,
          isPrimary: false,
          status: "READY",
          prompt: finalPrompt,
        },
      })
      .catch(() => undefined);

    void logProductAiCost({
      productId: product.id,
      companyId,
      action: regenerateFromUrl ? "IMAGE_EDIT" : "IMAGE_GEN",
      label: regenerateFromUrl
        ? `Re-edit obraz sekcji "${section.name}" (${side})`
        : `Generuj obraz sekcji "${section.name}" (${side})`,
      usd: NANO_BANANA_PRO_USD,
      metadata: {
        model: "gemini-3-pro-image-preview",
        refs: refs.length,
        regenerate: !!regenerateFromUrl,
      },
    });
    revalidatePath(`/sprzedaz/produkty/${product.id}`);
    revalidatePath(`/produkty/${product.id}`);
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

// ─── AI auto-draft: research + szablon + content w 1 wywolaniu ─────────

/**
 * Klucze layout-u do walidacji w JSON schema.
 */
const LAYOUT_VALUES = ["TEXT_TEXT", "IMAGE_TEXT", "TEXT_IMAGE", "IMAGE_IMAGE"] as const;
type LayoutT = (typeof LAYOUT_VALUES)[number];

/**
 * Wywoluje Claude Sonnet z web_search_20250305 + tool_use o nazwie submit_draft.
 * Claude:
 *  1. Szuka w sieci podobnych produktow (max 3 zapytania)
 *  2. Projektuje szablon (3-7 sekcji) pod konkretny produkt
 *  3. Generuje gotowy content per sekcja (tekst sformatowany markdownem)
 *  4. Marker `[BRAK: opis czego]` dla danych ktorych nie zna
 *  5. Zwraca tez `missingInfo` — pytania do operatora co warto uzupelnic
 *
 * Po stronie naszej: tworzymy DescriptionTemplate + sekcje, przypisujemy
 * do produktu, zapisujemy content JSON. Zwracamy templateId + missingInfo.
 */
export async function aiGenerateSalesDraftForProductAction(
  productId: string,
): Promise<
  | {
      ok: true;
      templateId: string;
      templateName: string;
      missingInfo: string[];
      researchSummary: string;
      cost: {
        inputTokens: number;
        outputTokens: number;
        cacheCreateTokens: number;
        cacheReadTokens: number;
        webSearches: number;
        usd: number;
      };
    }
  | { ok: false; error: string }
> {
  try {
    await requireUser();
    const companyId = await getCurrentCompanyId();
    if (!process.env.ANTHROPIC_API_KEY) {
      return {
        ok: false,
        error: "Brak ANTHROPIC_API_KEY w env — generowanie wymaga klucza Claude.",
      };
    }

    const product = await db.product.findFirst({
      where: { id: productId, companyId },
      select: {
        id: true,
        name: true,
        productCode: true,
        eanCode: true,
        color: true,
        colorCode: true,
        weightKg: true,
        shortDescription: true,
        salesNotes: true,
        category: { select: { name: true } },
      },
    });
    if (!product) return { ok: false, error: "Produkt nie istnieje." };

    const company = await db.company.findFirst({
      where: { id: companyId },
      select: { name: true },
    });

    const productCtx = [
      `Name: ${product.name}`,
      product.productCode && `SKU: ${product.productCode}`,
      product.eanCode && `EAN: ${product.eanCode}`,
      product.category?.name && `Category: ${product.category.name}`,
      product.color && `Color: ${product.color}`,
      product.colorCode && `Color code: ${product.colorCode}`,
      product.weightKg && `Weight: ${product.weightKg} kg`,
      product.shortDescription && `Existing short description: ${product.shortDescription}`,
      product.salesNotes && `Operator notes about this product (USE THESE FACTS — they trump web research):\n${product.salesNotes}`,
    ]
      .filter(Boolean)
      .join("\n");

    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const userPrompt = [
      `You are a senior Polish e-commerce copywriter and product page architect.`,
      `Your job is to design a TAILORED description template for the following product, and fill it with ready-to-use Polish copy.`,
      ``,
      `## Product`,
      productCtx,
      company?.name ? `Store: ${company.name}` : null,
      ``,
      `## Steps you MUST follow`,
      `1. Use the web_search tool (max 3 queries) to research similar products sold online in Poland or globally.`,
      `   - Identify: typical buyer questions, common selling points, what details customers expect to see, frequent objections.`,
      `   - Look for direct competitors of THIS specific product if recognizable.`,
      `2. Based on research + product data, decide on a custom set of 4-7 description sections that will sell THIS product well.`,
      `   - Each section has a 2-column layout from: TEXT_TEXT, IMAGE_TEXT, TEXT_IMAGE, IMAGE_IMAGE.`,
      `   - Be strategic: hero, korzysci, specyfikacja, dla kogo, uzycie, FAQ, CTA — wybierz co pasuje, nie wszystko.`,
      `   - Mix image and text — visual products need more IMAGE slots, technical ones more TEXT.`,
      `3. For each IMAGE slot fill 'leftImagePrompt' or 'rightImagePrompt' with a precise photography brief WRITTEN IN POLISH (used later by Nano Banana Pro / Gemini, which understands Polish well). Opisz po polsku: styl ujęcia, kadr, oświetlenie, tło, mood. Możesz mieszać polskie zdania z anglojęzycznymi terminami fotograficznymi (np. "studio packshot na białym tle, soft light, top-down, no humans").`,
      `4. For each TEXT slot fill 'leftTextPrompt' or 'rightTextPrompt' with a Claude prompt FOR REGENERATING that copy on demand. Napisz prompt po POLSKU — instrukcję dla Claude jak ma napisać tekst tej sekcji (ton, długość, format, focus).`,
      `5. Also fill 'content.leftText' / 'content.rightText' with READY-TO-USE Polish copy. CRITICAL: return HTML (not Markdown). Use ONLY these tags: <h1>, <h2>, <h3>, <p>, <ul>, <ol>, <li>, <strong>, <em>, <u>, <br>.`,
      `   - <h2> for main section heading (if any), <h3> for sub-sections.`,
      `   - <ul><li>...</li></ul> for bullet lists, <ol><li>...</li></ol> for numbered.`,
      `   - <strong> for key benefits and important phrases, <em> for emphasis.`,
      `   - Short paragraphs (2-3 sentences each) in <p>...</p>.`,
      `   - DO NOT use Markdown syntax like #, ##, **, -, *, _. Use only the HTML tags listed above.`,
      `   - DO NOT include emoji in headings.`,
      `6. When you DO NOT KNOW a specific factual detail about this product (exact dimensions, material composition, certifications, warranty period etc.), write '[BRAK: <co dokladnie potrzeba>]' inline AND add the question to 'missingInfo' array. Do NOT make up specs.`,
      `7. The 'templateName' should be human readable in Polish: e.g. "Szablon: <kategoria produktu>".`,
      `8. Provide a 'researchSummary' (2-3 zdania po polsku) summarising what you learned about this product type from the web research.`,
      ``,
      `## Output`,
      `When ready, call the 'submit_draft' tool with the full structured output. Do NOT respond with plain text — only via tool call.`,
    ]
      .filter(Boolean)
      .join("\n");

    const sectionSchema = {
      type: "object" as const,
      properties: {
        name: { type: "string" as const, description: "Display name (Polish)" },
        layout: { type: "string" as const, enum: LAYOUT_VALUES as readonly string[] },
        leftHint: { type: ["string", "null"] as const, description: "Operator hint for left slot" },
        rightHint: { type: ["string", "null"] as const, description: "Operator hint for right slot" },
        leftImagePrompt: { type: ["string", "null"] as const },
        rightImagePrompt: { type: ["string", "null"] as const },
        leftTextPrompt: { type: ["string", "null"] as const },
        rightTextPrompt: { type: ["string", "null"] as const },
        content: {
          type: "object" as const,
          properties: {
            leftText: { type: ["string", "null"] as const },
            rightText: { type: ["string", "null"] as const },
          },
        },
      },
      required: ["name", "layout"],
    };

    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 12000,
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 3,
        },
        {
          name: "submit_draft",
          description: "Submit the final tailored description template + ready content + missingInfo.",
          input_schema: {
            type: "object",
            properties: {
              templateName: { type: "string" },
              researchSummary: { type: "string" },
              sections: {
                type: "array",
                minItems: 3,
                maxItems: 8,
                items: sectionSchema,
              },
              missingInfo: {
                type: "array",
                items: { type: "string" },
                description: "List of questions / data points the operator must provide because they were unknown to AI",
              },
            },
            required: ["templateName", "sections", "missingInfo", "researchSummary"],
          },
        },
      ],
      messages: [{ role: "user", content: userPrompt }],
    });

    type DraftSection = {
      name: string;
      layout: LayoutT;
      leftHint?: string | null;
      rightHint?: string | null;
      leftImagePrompt?: string | null;
      rightImagePrompt?: string | null;
      leftTextPrompt?: string | null;
      rightTextPrompt?: string | null;
      content?: {
        leftText?: string | null;
        rightText?: string | null;
      };
    };
    type Draft = {
      templateName: string;
      researchSummary: string;
      sections: DraftSection[];
      missingInfo: string[];
    };

    const draftBlock = msg.content.find(
      (c): c is Extract<typeof c, { type: "tool_use" }> =>
        c.type === "tool_use" && c.name === "submit_draft",
    );
    if (!draftBlock) {
      return {
        ok: false,
        error:
          "Claude nie wywolal submit_draft. Sprobuj jeszcze raz lub sprawdz logi.",
      };
    }
    const draft = draftBlock.input as Draft;
    if (!draft?.sections || draft.sections.length === 0) {
      return { ok: false, error: "AI zwrocilo pusty draft." };
    }

    const cleanLayout = (l: string): LayoutT =>
      (LAYOUT_VALUES as readonly string[]).includes(l) ? (l as LayoutT) : "TEXT_TEXT";

    const template = await db.descriptionTemplate.create({
      data: {
        companyId,
        name: draft.templateName?.trim().slice(0, 120) || `AI dla: ${product.name}`,
        sections: {
          create: draft.sections.map((s, i) => ({
            name: s.name?.trim().slice(0, 120) || `Sekcja ${i + 1}`,
            layout: cleanLayout(s.layout),
            sortOrder: i,
            leftHint: s.leftHint?.trim() || null,
            rightHint: s.rightHint?.trim() || null,
            leftImagePrompt: s.leftImagePrompt?.trim() || null,
            rightImagePrompt: s.rightImagePrompt?.trim() || null,
            leftTextPrompt: s.leftTextPrompt?.trim() || null,
            rightTextPrompt: s.rightTextPrompt?.trim() || null,
          })),
        },
      },
      include: {
        sections: { orderBy: { sortOrder: "asc" } },
      },
    });

    const content: Record<
      string,
      { leftText?: string | null; rightText?: string | null }
    > = {};
    template.sections.forEach((dbSec, i) => {
      const draftSec = draft.sections[i];
      if (draftSec?.content) {
        // Belt-and-suspenders: jesli Claude zwrocil markdown mimo instrukcji
        // HTML, konwertujemy. markdownToHtml jest idempotentny — zostawia
        // valid HTML bez zmian.
        content[dbSec.id] = {
          leftText: draftSec.content.leftText
            ? markdownToHtml(draftSec.content.leftText)
            : null,
          rightText: draftSec.content.rightText
            ? markdownToHtml(draftSec.content.rightText)
            : null,
        };
      }
    });

    await db.product.update({
      where: { id: productId },
      data: {
        descriptionTemplateId: template.id,
        descriptionContentJson: content,
      },
    });

    revalidatePath(`/sprzedaz/produkty/${productId}`);
    revalidatePath("/sprzedaz/szablony-opisu");

    // Kalkulacja kosztu — Claude Sonnet 4.6 ceny per Anthropic public pricing:
    //   input  $3 / MTok       ($0.000003 / token)
    //   output $15 / MTok      ($0.000015 / token)
    //   cache write 5m $3.75 / MTok
    //   cache read     $0.30 / MTok
    //   web search     $0.01 / zapytanie ($10 / 1000)
    const u = msg.usage;
    const inputTokens = u.input_tokens ?? 0;
    const outputTokens = u.output_tokens ?? 0;
    const cacheCreateTokens = u.cache_creation_input_tokens ?? 0;
    const cacheReadTokens = u.cache_read_input_tokens ?? 0;
    const webSearches = u.server_tool_use?.web_search_requests ?? 0;
    const usd =
      (inputTokens * 3) / 1_000_000 +
      (outputTokens * 15) / 1_000_000 +
      (cacheCreateTokens * 3.75) / 1_000_000 +
      (cacheReadTokens * 0.3) / 1_000_000 +
      webSearches * 0.01;

    void logProductAiCost({
      productId,
      companyId,
      action: "DRAFT_TEMPLATE",
      label: `AI draft szablonu "${template.name}"`,
      usd,
      metadata: {
        inputTokens,
        outputTokens,
        webSearches,
        sectionCount: draft.sections.length,
        model: "claude-sonnet-4-6",
      },
    });

    return {
      ok: true,
      templateId: template.id,
      templateName: template.name,
      missingInfo: Array.isArray(draft.missingInfo) ? draft.missingInfo : [],
      researchSummary: draft.researchSummary ?? "",
      cost: {
        inputTokens,
        outputTokens,
        cacheCreateTokens,
        cacheReadTokens,
        webSearches,
        usd,
      },
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Blad AI.",
    };
  }
}

/**
 * Lista produktow z szablonem opisu (do pickera "Skopiuj z innego produktu").
 */
export async function listProductsWithTemplateAction(
  query: string = "",
): Promise<{
  products: Array<{
    id: string;
    name: string;
    productCode: string | null;
    color: string | null;
    templateName: string | null;
    sectionCount: number;
    thumbnailUrl: string | null;
  }>;
}> {
  await requireUser();
  const companyId = await getCurrentCompanyId();
  const q = query.trim();
  const products = await db.product.findMany({
    where: {
      companyId,
      archived: false,
      descriptionTemplateId: { not: null },
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { productCode: { contains: q, mode: "insensitive" as const } },
              { eanCode: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
    take: 200,
    select: {
      id: true,
      name: true,
      productCode: true,
      color: true,
      descriptionTemplate: {
        select: {
          name: true,
          _count: { select: { sections: true } },
        },
      },
      images: {
        where: { archived: false, status: "READY" },
        orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
        take: 1,
        select: { thumbnailWebpUrl: true, url: true },
      },
    },
  });
  return {
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      productCode: p.productCode,
      color: p.color,
      templateName: p.descriptionTemplate?.name ?? null,
      sectionCount: p.descriptionTemplate?._count.sections ?? 0,
      thumbnailUrl:
        p.images[0]?.thumbnailWebpUrl ?? p.images[0]?.url ?? null,
    })),
  };
}

/**
 * Kopiuje szablon + content z innego produktu na docelowy. Dwa tryby:
 *  - "copy"       — klonuje strukture sekcji + content 1:1 (nowy
 *                   DescriptionTemplate w bazie, niezalezny od oryginalu)
 *  - "ai-adjust"  — to samo + Claude przepisuje content podmieniajac
 *                   product-specific dane (kolor, rozmiar, kod) tak zeby
 *                   pasowal do docelowego produktu
 */
export async function copyDescriptionTemplateFromProductAction(
  sourceProductId: string,
  destProductId: string,
  mode: "copy" | "ai-adjust",
): Promise<
  | {
      ok: true;
      templateId: string;
      templateName: string;
      adjusted: boolean;
      cost?: {
        inputTokens: number;
        outputTokens: number;
        usd: number;
      };
    }
  | { ok: false; error: string }
> {
  try {
    await requireUser();
    const companyId = await getCurrentCompanyId();

    const [source, dest] = await Promise.all([
      db.product.findFirst({
        where: { id: sourceProductId, companyId },
        select: {
          id: true,
          name: true,
          color: true,
          colorCode: true,
          weightKg: true,
          productCode: true,
          descriptionContentJson: true,
          descriptionTemplate: {
            select: {
              id: true,
              name: true,
              sections: {
                orderBy: { sortOrder: "asc" },
                select: {
                  id: true,
                  name: true,
                  layout: true,
                  sortOrder: true,
                  leftHint: true,
                  rightHint: true,
                  leftImagePrompt: true,
                  rightImagePrompt: true,
                  leftTextPrompt: true,
                  rightTextPrompt: true,
                },
              },
            },
          },
          category: { select: { name: true } },
        },
      }),
      db.product.findFirst({
        where: { id: destProductId, companyId },
        select: {
          id: true,
          name: true,
          color: true,
          colorCode: true,
          weightKg: true,
          productCode: true,
          category: { select: { name: true } },
        },
      }),
    ]);
    if (!source) return { ok: false, error: "Produkt zrodlowy nie istnieje." };
    if (!dest) return { ok: false, error: "Produkt docelowy nie istnieje." };
    if (!source.descriptionTemplate) {
      return { ok: false, error: "Zrodlowy produkt nie ma jeszcze szablonu." };
    }

    const srcContent =
      (source.descriptionContentJson as Record<
        string,
        { leftText?: string | null; rightText?: string | null }
      > | null) ?? {};

    // Stworz nowy DescriptionTemplate (kopia struktury)
    const baseName =
      mode === "ai-adjust"
        ? `${source.descriptionTemplate.name} (dla ${dest.name})`
        : `${source.descriptionTemplate.name} — kopia`;

    const newTemplate = await db.descriptionTemplate.create({
      data: {
        companyId,
        name: baseName.slice(0, 120),
        sections: {
          create: source.descriptionTemplate.sections.map((s) => ({
            name: s.name,
            layout: s.layout,
            sortOrder: s.sortOrder,
            leftHint: s.leftHint,
            rightHint: s.rightHint,
            leftImagePrompt: s.leftImagePrompt,
            rightImagePrompt: s.rightImagePrompt,
            leftTextPrompt: s.leftTextPrompt,
            rightTextPrompt: s.rightTextPrompt,
          })),
        },
      },
      include: {
        sections: { orderBy: { sortOrder: "asc" } },
      },
    });

    // Zbuduj nowy content mapujac STARE sectionId -> NOWE sectionId po indeksie
    const newContent: Record<
      string,
      { leftText?: string | null; rightText?: string | null }
    > = {};
    source.descriptionTemplate.sections.forEach((srcSec, i) => {
      const dstSec = newTemplate.sections[i];
      if (!dstSec) return;
      const existing = srcContent[srcSec.id];
      if (!existing) return;
      newContent[dstSec.id] = {
        leftText: existing.leftText ?? null,
        rightText: existing.rightText ?? null,
      };
    });

    let cost: { inputTokens: number; outputTokens: number; usd: number } | undefined;

    if (mode === "ai-adjust") {
      if (!process.env.ANTHROPIC_API_KEY) {
        return {
          ok: false,
          error: "Brak ANTHROPIC_API_KEY w env — wymagane dla 'dostosuj przez AI'.",
        };
      }
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

      const srcDesc = [
        `Name: ${source.name}`,
        source.productCode && `SKU: ${source.productCode}`,
        source.color && `Color: ${source.color}`,
        source.colorCode && `Color code: ${source.colorCode}`,
        source.weightKg && `Weight: ${source.weightKg} kg`,
        source.category?.name && `Category: ${source.category.name}`,
      ]
        .filter(Boolean)
        .join("\n");
      const dstDesc = [
        `Name: ${dest.name}`,
        dest.productCode && `SKU: ${dest.productCode}`,
        dest.color && `Color: ${dest.color}`,
        dest.colorCode && `Color code: ${dest.colorCode}`,
        dest.weightKg && `Weight: ${dest.weightKg} kg`,
        dest.category?.name && `Category: ${dest.category.name}`,
      ]
        .filter(Boolean)
        .join("\n");

      // Sections do edycji jako tablica dla forced output
      const sectionsForAi = newTemplate.sections.map((s) => {
        const c = newContent[s.id] ?? {};
        return {
          id: s.id,
          name: s.name,
          leftText: c.leftText ?? null,
          rightText: c.rightText ?? null,
        };
      });

      const userPrompt = [
        `You are a Polish e-commerce copy editor.`,
        `You have copy written for one product and need to adjust it for a DIFFERENT but SIMILAR product (same template, same structure).`,
        ``,
        `## Source product (where copy was originally written)`,
        srcDesc,
        ``,
        `## Destination product (we are adjusting copy FOR)`,
        dstDesc,
        ``,
        `## Sections (each with current leftText / rightText)`,
        JSON.stringify(sectionsForAi, null, 2),
        ``,
        `## Instructions`,
        `- For EACH section, return updated leftText / rightText.`,
        `- ONLY change parts that are product-specific and DIFFER between source and destination: color name, color code, exact size/weight, SKU references, exact variant naming.`,
        `- DO NOT rewrite the whole copy. Preserve formatting (markdown, bullets, bold).`,
        `- If source and destination differ only in color, swap "${source.color ?? "{source-color}"}" -> "${dest.color ?? "{dest-color}"}" everywhere it appears.`,
        `- If a section's text has no product-specific reference (general benefits, FAQ), leave it unchanged.`,
        `- If text is missing or null in source, leave it null in output.`,
        `- For unknown data about destination product use marker '[BRAK: <co potrzeba>]' inline.`,
        `- Polish language throughout.`,
        ``,
        `Call the 'submit_adjusted' tool with the array of adjusted sections.`,
      ].join("\n");

      const msg = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 8000,
        tools: [
          {
            name: "submit_adjusted",
            description: "Submit the adjusted content per section.",
            input_schema: {
              type: "object",
              properties: {
                sections: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      leftText: { type: ["string", "null"] },
                      rightText: { type: ["string", "null"] },
                    },
                    required: ["id"],
                  },
                },
              },
              required: ["sections"],
            },
          },
        ],
        messages: [{ role: "user", content: userPrompt }],
      });

      const adjustBlock = msg.content.find(
        (c): c is Extract<typeof c, { type: "tool_use" }> =>
          c.type === "tool_use" && c.name === "submit_adjusted",
      );
      if (adjustBlock) {
        const out = adjustBlock.input as {
          sections: Array<{
            id: string;
            leftText?: string | null;
            rightText?: string | null;
          }>;
        };
        out.sections.forEach((sec) => {
          if (newContent[sec.id] !== undefined || sec.id) {
            newContent[sec.id] = {
              leftText: sec.leftText ?? null,
              rightText: sec.rightText ?? null,
            };
          }
        });
      }

      const u = msg.usage;
      const inputTokens = u.input_tokens ?? 0;
      const outputTokens = u.output_tokens ?? 0;
      const usd =
        (inputTokens * 3) / 1_000_000 +
        (outputTokens * 15) / 1_000_000;
      cost = { inputTokens, outputTokens, usd };
    }

    await db.product.update({
      where: { id: destProductId },
      data: {
        descriptionTemplateId: newTemplate.id,
        descriptionContentJson: newContent,
      },
    });

    revalidatePath(`/sprzedaz/produkty/${destProductId}`);
    revalidatePath("/sprzedaz/szablony-opisu");

    if (cost) {
      void logProductAiCost({
        productId: destProductId,
        companyId,
        action: "COPY_TEMPLATE_AI",
        label: `Skopiuj+dostosuj szablon z "${source.name}"`,
        usd: cost.usd,
        metadata: {
          inputTokens: cost.inputTokens,
          outputTokens: cost.outputTokens,
          sourceProductId,
          model: "claude-sonnet-4-6",
        },
      });
    }

    return {
      ok: true,
      templateId: newTemplate.id,
      templateName: newTemplate.name,
      adjusted: mode === "ai-adjust",
      cost,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Blad.",
    };
  }
}
