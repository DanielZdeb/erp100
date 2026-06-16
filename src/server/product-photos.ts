"use server";

/**
 * Server actions dla generatora grafik produktowych.
 *
 * Flow:
 *  1. Template — schemat stylu + zestaw rzutów (CRUD)
 *  2. Batch — kampania (lista produktów × rzutów = N obrazów) + start generowania
 *  3. Image — pojedynczy obraz, retry, custom override, save do Product.images
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { revalidateProductPaths } from "@/lib/revalidate-product";
import { logProductAiCost } from "@/server/product-ai-costs";

const NANO_BANANA_PRO_USD = 0.134;
import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";
import { uploadFile } from "@/lib/storage";
import { generateProductPhoto } from "@/lib/photo-gemini";
import { QUALITY_SPEC, SHOT_PRESETS } from "@/lib/photo-shots-presets";

async function requireUser() {
  const session = await auth();
  if (!session?.user) throw new Error("Brak autoryzacji");
  return session.user;
}

// ─── Template CRUD ──────────────────────────────────────────────────

const templateSchema = z.object({
  name: z.string().min(1),
  globalPrompt: z.string().min(1),
  logoPlacementRule: z.string().nullable().optional(),
  referenceImages: z.array(z.string()).default([]),
  aspectRatio: z.string().default("1:1"),
  defaultQuality: z.enum(["STANDARD", "HIGH", "ULTRA", "NANO_BANANA_PRO"]).default("STANDARD"),
});

export async function createPhotoTemplateAction(input: unknown) {
  await requireUser();
  const companyId = await getCurrentCompanyId();
  const data = templateSchema.parse(input);

  // Stwórz template + automatycznie zaimportuj 6 najpopularniejszych presetów
  // jako shots (user może je potem edytować / usunąć).
  const created = await db.productPhotoTemplate.create({
    data: {
      companyId,
      name: data.name.trim(),
      globalPrompt: data.globalPrompt.trim(),
      logoPlacementRule: data.logoPlacementRule?.trim() || null,
      referenceImages: data.referenceImages,
      aspectRatio: data.aspectRatio,
      defaultQuality: data.defaultQuality,
      shots: {
        create: SHOT_PRESETS.slice(0, 6).map((p, idx) => ({
          name: p.name,
          iconName: p.iconName,
          shotPrompt: p.shotPrompt,
          sortOrder: idx,
          isPreset: true,
        })),
      },
    },
    select: { id: true },
  });

  revalidatePath("/grafiki");
  return { ok: true as const, id: created.id };
}

export async function updatePhotoTemplateAction(id: string, input: unknown) {
  await requireUser();
  const companyId = await getCurrentCompanyId();
  const data = templateSchema.partial().parse(input);

  const existing = await db.productPhotoTemplate.findFirst({
    where: { id, companyId },
    select: { id: true },
  });
  if (!existing) throw new Error("Template nie istnieje");

  await db.productPhotoTemplate.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.globalPrompt !== undefined
        ? { globalPrompt: data.globalPrompt.trim() }
        : {}),
      ...(data.logoPlacementRule !== undefined
        ? { logoPlacementRule: data.logoPlacementRule?.trim() || null }
        : {}),
      ...(data.referenceImages !== undefined
        ? { referenceImages: data.referenceImages }
        : {}),
      ...(data.aspectRatio !== undefined
        ? { aspectRatio: data.aspectRatio }
        : {}),
      ...(data.defaultQuality !== undefined
        ? { defaultQuality: data.defaultQuality }
        : {}),
    },
  });

  revalidatePath("/grafiki");
  revalidatePath(`/grafiki/template/${id}`);
  return { ok: true as const };
}

export async function deletePhotoTemplateAction(id: string) {
  await requireUser();
  const companyId = await getCurrentCompanyId();
  const existing = await db.productPhotoTemplate.findFirst({
    where: { id, companyId },
    select: { id: true },
  });
  if (!existing) throw new Error("Template nie istnieje");
  await db.productPhotoTemplate.delete({ where: { id } });
  revalidatePath("/grafiki");
  return { ok: true as const };
}

// ─── Shot CRUD ──────────────────────────────────────────────────────

const shotSchema = z.object({
  templateId: z.string(),
  name: z.string().min(1),
  iconName: z.string().nullable().optional(),
  shotPrompt: z.string().min(1),
  /** Opcjonalne zdjęcie z którego AI ma zaczerpnąć perspektywę/kompozycję. */
  referenceImageUrl: z.string().nullable().optional(),
  sortOrder: z.number().int().default(0),
});

export async function createPhotoShotAction(input: unknown) {
  await requireUser();
  const companyId = await getCurrentCompanyId();
  const data = shotSchema.parse(input);

  const template = await db.productPhotoTemplate.findFirst({
    where: { id: data.templateId, companyId },
    select: { id: true },
  });
  if (!template) throw new Error("Template nie istnieje");

  const created = await db.productPhotoShot.create({
    data: {
      templateId: data.templateId,
      name: data.name.trim(),
      iconName: data.iconName?.trim() || null,
      shotPrompt: data.shotPrompt.trim(),
      referenceImageUrl: data.referenceImageUrl?.trim() || null,
      sortOrder: data.sortOrder,
      isPreset: false,
    },
    select: {
      id: true,
      name: true,
      iconName: true,
      shotPrompt: true,
      referenceImageUrl: true,
      sortOrder: true,
      isPreset: true,
    },
  });

  revalidatePath(`/grafiki/template/${data.templateId}`);
  return { ok: true as const, shot: created };
}

export async function updatePhotoShotAction(id: string, input: unknown) {
  await requireUser();
  const data = shotSchema.partial().parse(input);
  await db.productPhotoShot.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.iconName !== undefined
        ? { iconName: data.iconName?.trim() || null }
        : {}),
      ...(data.shotPrompt !== undefined
        ? { shotPrompt: data.shotPrompt.trim() }
        : {}),
      ...(data.referenceImageUrl !== undefined
        ? { referenceImageUrl: data.referenceImageUrl?.trim() || null }
        : {}),
      ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
    },
    select: { id: true, templateId: true },
  });
  return { ok: true as const };
}

export async function deletePhotoShotAction(id: string) {
  await requireUser();
  await db.productPhotoShot.delete({ where: { id } });
  return { ok: true as const };
}

// ─── Batch CRUD + start ─────────────────────────────────────────────

const batchSchema = z.object({
  templateId: z.string(),
  name: z.string().min(1),
  /** Per-produkt konfiguracja — które rzuty + opis + referencje. */
  products: z
    .array(
      z.object({
        productId: z.string(),
        shotIds: z.array(z.string()).min(1),
        /** Opis/override per produkt — dodawany do KAŻDEGO zdjęcia tego produktu. */
        customDescription: z.string().optional(),
        /** Referencyjne URLs (np. realne zdjęcia produktu dla koloru). */
        referenceImages: z.array(z.string()).default([]),
      }),
    )
    .min(1),
  quality: z.enum(["STANDARD", "HIGH", "ULTRA", "NANO_BANANA_PRO"]).optional(),
});

export async function createPhotoBatchAction(input: unknown) {
  await requireUser();
  const companyId = await getCurrentCompanyId();
  const data = batchSchema.parse(input);

  const template = await db.productPhotoTemplate.findFirst({
    where: { id: data.templateId, companyId },
    select: { id: true, defaultQuality: true },
  });
  if (!template) throw new Error("Template nie istnieje");

  const quality = data.quality ?? template.defaultQuality;
  const total = data.products.reduce((sum, p) => sum + p.shotIds.length, 0);
  // Losowy seed dla spójności stylu w obrębie batcha
  const seed = BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));

  // Wszystkie unikalne shotIds + productIds (do snapshot na batchu)
  const allProductIds = data.products.map((p) => p.productId);
  const allShotIds = Array.from(
    new Set(data.products.flatMap((p) => p.shotIds)),
  );

  const created = await db.productPhotoBatch.create({
    data: {
      companyId,
      templateId: data.templateId,
      name: data.name.trim(),
      productIds: allProductIds,
      shotIds: allShotIds,
      quality,
      seed,
      totalImages: total,
      estimatedCostUsd: total * QUALITY_SPEC[quality].costPerImage,
      // Pre-allocate per-produkt × per-shot z customOverride i references.
      // User wybrał per-produkt: które rzuty + opcjonalnie opis + referencje.
      images: {
        create: data.products.flatMap((p) =>
          p.shotIds.map((shotId) => ({
            productId: p.productId,
            shotId,
            status: "PENDING" as const,
            seed,
            customOverride: p.customDescription?.trim() || null,
            productReferences: p.referenceImages,
          })),
        ),
      },
    },
    select: { id: true },
  });

  revalidatePath("/grafiki");
  return { ok: true as const, id: created.id };
}

/**
 * Pobierz wszystkie zdjęcia produktu (do trybu „Z istniejącego produktu").
 * Każde zdjęcie potem stanie się rzutem (ProductPhotoShot) z referenceImageUrl.
 */
export async function getProductImagesAction(productId: string): Promise<{
  productName: string;
  images: { id: string; url: string; alt: string | null }[];
}> {
  await requireUser();
  const companyId = await getCurrentCompanyId();
  const product = await db.product.findFirst({
    where: { id: productId, companyId },
    select: {
      name: true,
      images: {
        orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
        select: { id: true, url: true, alt: true },
      },
    },
  });
  if (!product) throw new Error("Produkt nie istnieje");
  return {
    productName: product.name,
    images: product.images,
  };
}

/**
 * Stwórz rzuty na podstawie zdjęć źródłowego produktu. Każde wybrane zdjęcie
 * staje się osobnym ProductPhotoShot z referenceImageUrl=URL tego zdjęcia.
 *
 * Use case: „Krzesło czarne" ma 6 zdjęć produktowych. User zaznacza wszystkie,
 * tworzy 6 rzutów. Potem dodaje produkty Krzesło Niebieskie / Czerwone /…
 * → AI generuje te same 6 ujęć dla każdego nowego koloru z identyczną
 * perspektywą jak źródło.
 */
export async function createShotsFromProductAction(input: {
  templateId: string;
  sourceProductName: string;
  imageUrls: string[];
  startSortOrder: number;
}) {
  await requireUser();
  const companyId = await getCurrentCompanyId();

  const template = await db.productPhotoTemplate.findFirst({
    where: { id: input.templateId, companyId },
    select: { id: true },
  });
  if (!template) throw new Error("Template nie istnieje");

  const created = await Promise.all(
    input.imageUrls.map((url, i) =>
      db.productPhotoShot.create({
        data: {
          templateId: input.templateId,
          name: `Z ${input.sourceProductName} — ${i + 1}`,
          iconName: "Copy",
          shotPrompt: `Recreate the same shot as in the reference image: identical camera angle, perspective, framing, composition, lighting, and pose. Replace only the product itself with the target product (different color/variant).`,
          referenceImageUrl: url,
          sortOrder: input.startSortOrder + i,
          isPreset: false,
        },
        select: {
          id: true,
          name: true,
          iconName: true,
          referenceImageUrl: true,
        },
      }),
    ),
  );

  revalidatePath(`/grafiki/template/${input.templateId}`);
  return { ok: true as const, shots: created };
}

/**
 * Upload referencyjnego zdjęcia (np. realne foto produktu dla koloru).
 * Używane w wizardzie kampanii — user uploaduje pliki per-produkt.
 */
export async function uploadPhotoReferenceAction(
  formData: FormData,
): Promise<{ url: string }> {
  await requireUser();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Brak pliku");
  }
  if (!file.type.startsWith("image/")) {
    throw new Error("To nie jest obraz");
  }
  const uploaded = await uploadFile(file, {
    folder: "photo-references",
  });
  return { url: uploaded.url };
}

/**
 * Startuje generowanie batcha — przechodzi przez wszystkie PENDING images,
 * woła Gemini API per każde, zapisuje plik do storage, update'uje status.
 *
 * Synchroniczne (długie!) — w prod wynieść do background job (np. cron).
 * Na razie running w server action — dla małych batchów (do ~20 obrazów) OK.
 */
/**
 * Startuje generowanie batcha w TLE — zwraca natychmiast po oznaczeniu
 * statusu RUNNING. Faktyczne przetwarzanie leci w Node event loop po
 * odpowiedzi (fire-and-forget) i aktualizuje DB per-obraz. User może
 * zamknąć stronę i wrócić później — `batch-results-grid` poll-uje status.
 *
 * Wymaga persistent Node process (Docker/Coolify OK; serverless NIE,
 * bo Vercel zabija proces po response — tam musiałby być queue + worker).
 */
export async function startPhotoBatchAction(batchId: string) {
  await requireUser();
  const companyId = await getCurrentCompanyId();

  const batch = await db.productPhotoBatch.findFirst({
    where: { id: batchId, companyId },
    select: {
      id: true,
      status: true,
      _count: { select: { images: { where: { status: "PENDING" } } } },
    },
  });
  if (!batch) throw new Error("Batch nie istnieje");
  if (batch.status === "RUNNING") {
    throw new Error("Batch już się generuje");
  }
  if (batch._count.images === 0) {
    return { ok: true as const, message: "Nic do generowania (brak PENDING)", queued: 0 };
  }

  // Status batcha → RUNNING natychmiast — UI widzi że poszedł
  await db.productPhotoBatch.update({
    where: { id: batchId },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  // Fire-and-forget — proces leci w tle, response wraca od razu.
  // `void` + .catch zabezpiecza przed unhandled rejection w event loop.
  void processBatchInBackground(batchId).catch((e) => {
    console.error(`[batch ${batchId}] background processing error:`, e);
  });

  revalidatePath(`/grafiki/batch/${batchId}`);
  return {
    ok: true as const,
    queued: batch._count.images,
    message: `Generowanie ${batch._count.images} obrazów w tle. Możesz zamknąć kartę — wrócisz później.`,
  };
}

/** Faktyczne przetwarzanie batcha — long-running, leci w tle. */
async function processBatchInBackground(batchId: string) {
  const batch = await db.productPhotoBatch.findFirst({
    where: { id: batchId },
    include: {
      template: true,
      images: {
        where: { status: "PENDING" },
        include: { shot: true },
      },
    },
  });
  if (!batch) return;

  // Pobierz produkty + ich primary images (do reference dla koloru)
  const products = await db.product.findMany({
    where: { id: { in: batch.productIds } },
    select: {
      id: true,
      name: true,
      color: true,
      shortDescription: true,
      images: {
        where: { isPrimary: true },
        take: 1,
        select: { url: true },
      },
    },
  });
  const productById = new Map(products.map((p) => [p.id, p]));

  let okCount = 0;
  let failCount = 0;
  let costSum = 0;

  for (const img of batch.images) {
    const product = productById.get(img.productId);
    if (!product) {
      await db.productPhotoImage.update({
        where: { id: img.id },
        data: {
          status: "FAILED",
          errorMessage: "Produkt nie istnieje",
        },
      });
      failCount++;
      continue;
    }

    await db.productPhotoImage.update({
      where: { id: img.id },
      data: { status: "RUNNING" },
    });

    // Build final prompt — łączymy: globalPrompt + product info + shot + override.
    //
    // Jeśli shot ma `referenceImageUrl`, dodajemy explicit hint mówiąc modelowi
    // że PIERWSZY załączony obraz to wzór kompozycyjny — eliminuje przypadki
    // gdzie 4 różne shoty (z 4 różnymi referencjami) generują ten sam obraz
    // bo model traktował referencje jako równorzędne.
    const productLine = `Product: ${product.name}${product.color ? `, color: ${product.color}` : ""}`;
    const overrideLine = img.customOverride?.trim()
      ? `\nAdditional instructions: ${img.customOverride.trim()}`
      : "";
    const logoLine = batch.template.logoPlacementRule
      ? `\nLogo placement: ${batch.template.logoPlacementRule}`
      : "";
    const shotRefHint = img.shot.referenceImageUrl
      ? `\n\nIMPORTANT: The FIRST attached reference image is the composition template — match its camera angle, framing, perspective, lighting, and pose EXACTLY. Other attached images are for color/material reference only.`
      : "";
    const finalPrompt =
      `${batch.template.globalPrompt}\n\n${productLine}\n\nShot: ${img.shot.shotPrompt}${shotRefHint}${overrideLine}${logoLine}`;

    // Reference images — kolejność MA znaczenie dla Nano Banana Pro:
    // pierwsze są najbardziej wpływowe (model traktuje je jako primary
    // composition reference), kolejne jako kolor/styl/secondary context.
    //
    // Strategia:
    //  1. Shot-level reference FIRST — to jest „rzut na podstawie zdjęcia",
    //     odpowiada za kompozycję, kąt kamery, kadr, pozę. Bez tego shot 2
    //     wygląda jak shot 1 (bo prompt jest często ten sam dla wielu shotów,
    //     dopiero różny obraz referencyjny daje różne kompozycje).
    //  2. Po nim user-uploaded productReferences — np. „dokładny kolor materiału".
    //  3. Potem primary image produktu — koloru / detal materiału.
    //  4. Na końcu template.referenceImages — styl globalny (oświetlenie, tło).
    const refUrls: string[] = [];
    if (img.shot.referenceImageUrl) {
      refUrls.push(img.shot.referenceImageUrl);
    }
    refUrls.push(...img.productReferences);
    if (product.images[0]?.url) refUrls.push(product.images[0].url);
    refUrls.push(...batch.template.referenceImages);

    const result = await generateProductPhoto({
      prompt: finalPrompt,
      quality: batch.quality,
      aspectRatio: batch.template.aspectRatio,
      seed: img.seed,
      referenceImageUrls: refUrls,
    });

    if (!result.ok) {
      await db.productPhotoImage.update({
        where: { id: img.id },
        data: {
          status: "FAILED",
          errorMessage: result.error.slice(0, 1000),
          finalPrompt,
          retryCount: { increment: 1 },
        },
      });
      failCount++;
      continue;
    }

    // Zapisz buffer jako plik
    try {
      const ext = result.contentType.includes("jpeg") ? "jpg" : "png";
      const file = new File(
        [new Uint8Array(result.imageBuffer)],
        `${product.id}-${img.shotId}.${ext}`,
        { type: result.contentType },
      );
      const uploaded = await uploadFile(file, {
        folder: `photo-batches/${batchId}`,
      });

      await db.productPhotoImage.update({
        where: { id: img.id },
        data: {
          status: "OK",
          storageUrl: uploaded.url,
          finalPrompt,
          costUsd: result.costUsd,
          generatedAt: new Date(),
        },
      });
      okCount++;
      costSum += result.costUsd;
    } catch (e) {
      await db.productPhotoImage.update({
        where: { id: img.id },
        data: {
          status: "FAILED",
          errorMessage: e instanceof Error ? e.message : "Storage error",
          finalPrompt,
          retryCount: { increment: 1 },
        },
      });
      failCount++;
    }
  }

  // Aktualizuj batch counters + status końcowy
  const finalStatus: "COMPLETED" | "PARTIAL" | "FAILED" =
    failCount === 0
      ? "COMPLETED"
      : okCount === 0
        ? "FAILED"
        : "PARTIAL";

  await db.productPhotoBatch.update({
    where: { id: batchId },
    data: {
      status: finalStatus,
      generatedImages: { increment: okCount },
      failedImages: { increment: failCount },
      estimatedCostUsd: { increment: costSum },
      completedAt: new Date(),
    },
  });

  revalidatePath(`/grafiki/batch/${batchId}`);
  // Funkcja background — nie ma `return` do klienta, ale logujemy do konsoli
  // żeby było widać w `docker logs` jak skończyło.
  console.info(
    `[batch ${batchId}] done: ok=${okCount} fail=${failCount} cost=$${costSum.toFixed(3)}`,
  );
}

/**
 * Regeneracja pojedynczego obrazu — przywraca PENDING, restartuje tylko ten obraz.
 * User może dać `customOverride` (np. "ciemniejszy") i opcjonalnie URL realnego
 * zdjęcia produktu jako referencji.
 */
export async function regeneratePhotoImageAction(
  imageId: string,
  input: { customOverride?: string; addReferenceUrl?: string },
) {
  await requireUser();
  const companyId = await getCurrentCompanyId();

  const img = await db.productPhotoImage.findFirst({
    where: { id: imageId },
    include: {
      batch: { select: { id: true, companyId: true } },
    },
  });
  if (!img || img.batch.companyId !== companyId) {
    throw new Error("Zdjęcie nie istnieje");
  }

  // Update overrides + reset status do PENDING
  const updates: Record<string, unknown> = { status: "PENDING" };
  if (input.customOverride !== undefined) {
    updates.customOverride = input.customOverride.trim() || null;
  }
  if (input.addReferenceUrl) {
    updates.productReferences = [...img.productReferences, input.addReferenceUrl];
  }

  await db.productPhotoImage.update({
    where: { id: imageId },
    data: updates,
  });

  // Restartuj tylko ten 1 obraz (mini-batch)
  await startPhotoBatchAction(img.batch.id);

  return { ok: true as const };
}

// ─── Zapis do galerii produktu ─────────────────────────────────────

/** Skopiuj wygenerowane zdjęcie do galerii produktu (Product.images). */
/**
 * AI edit istniejącego zdjęcia produktu przez Nano Banana Pro.
 *
 * User klika zdjęcie w karcie produktu sprzedażowej, wpisuje prompt
 * (np. „wymień tło na białe studio", „dodaj cień", „zmień kolor materiału na granatowy")
 * — Nano Banana Pro robi konwersacyjną edycję trzymając się oryginalnej kompozycji.
 *
 * Workflow:
 *  1. Pobierz oryginalny ProductImage z bazy + sprawdź dostęp
 *  2. Wywołaj generateProductPhoto z prompt + oryginałem jako referencją
 *  3. Zapisz nowe zdjęcie obok jako kolejny ProductImage (nie nadpisujemy oryginału)
 *  4. Zwróć URL i ID nowego zdjęcia
 */
export async function editProductImageWithAiAction(
  productImageId: string,
  prompt: string,
  extraRefUrls: string[] = [],
): Promise<
  | { ok: true; pendingImageId: string }
  | { ok: false; error: string }
> {
  try {
    await requireUser();
    const companyId = await getCurrentCompanyId();

    if (!prompt.trim()) {
      return { ok: false, error: "Podaj prompt opisujący zmianę." };
    }

    const original = await db.productImage.findFirst({
      where: { id: productImageId, product: { companyId } },
      include: { product: { select: { id: true, name: true, color: true } } },
    });
    if (!original) {
      return { ok: false, error: "Zdjęcie nie istnieje." };
    }

    const sanitizedRefs = extraRefUrls
      .filter((u) => typeof u === "string" && u.length > 0)
      .filter((u) => u !== original.url)
      .slice(0, 4);

    // Pre-create PENDING — UI od razu pokazuje placeholder z loaderem
    const maxSort = await db.productImage.findFirst({
      where: { productId: original.productId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const pending = await db.productImage.create({
      data: {
        productId: original.productId,
        url: "",
        status: "PENDING",
        prompt: prompt.trim(),
        alt: `AI-edit: ${prompt.trim().slice(0, 80)}`,
        sortOrder: (maxSort?.sortOrder ?? 0) + 1,
      },
      select: { id: true },
    });
    revalidateProductPaths(original.productId);

    // Fire-and-forget — background dokonczy update url + status=READY
    void runEditInBackground({
      pendingImageId: pending.id,
      productId: original.productId,
      productName: original.product.name,
      productColor: original.product.color,
      originalUrl: original.url,
      extraRefUrls: sanitizedRefs,
      prompt: prompt.trim(),
    }).catch((e) => {
      console.error(`[ai-edit ${productImageId}] background error:`, e);
    });

    void logProductAiCost({
      productId: original.productId,
      companyId,
      action: "IMAGE_EDIT",
      label: `Edycja AI: ${prompt.trim().slice(0, 80)}`,
      usd: NANO_BANANA_PRO_USD,
      metadata: { refs: sanitizedRefs.length, model: "gemini-3-pro-image-preview" },
    });

    return { ok: true, pendingImageId: pending.id };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Błąd edycji AI.",
    };
  }
}

/**
 * Jesli produkt nie ma jeszcze zdjecia oznaczonego isPrimary (a wiec
 * nie pokazuje sie nic w listach), promujemy pierwsze READY niearchiwalne
 * zdjecie wg sortOrder asc na primary. Idempotentne — no-op jesli primary
 * juz jest.
 */
async function ensureProductHasPrimaryImage(productId: string) {
  const hasPrimary = await db.productImage.findFirst({
    where: { productId, isPrimary: true, archived: false, status: "READY" },
    select: { id: true },
  });
  if (hasPrimary) return;
  const candidate = await db.productImage.findFirst({
    where: { productId, archived: false, status: "READY" },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });
  if (!candidate) return;
  await db.productImage.update({
    where: { id: candidate.id },
    data: { isPrimary: true },
  });
}

async function runEditInBackground(params: {
  pendingImageId: string;
  productId: string;
  productName: string;
  productColor: string | null;
  originalUrl: string;
  extraRefUrls: string[];
  prompt: string;
}) {
  const extraHint =
    params.extraRefUrls.length > 0
      ? `\n\nAdditional reference images (after the first) are STYLE / DETAIL / COMPARISON references — use them as guides for color, material, texture, or specific details requested in the edit. Do NOT copy their composition.`
      : "";
  const editPrompt =
    `You are editing an existing product photo. ` +
    `Keep the EXACT composition, camera angle, framing, and product position from the FIRST attached reference image. ` +
    `Apply this change: ${params.prompt}${extraHint}\n\n` +
    `Product: ${params.productName}${params.productColor ? `, color: ${params.productColor}` : ""}`;

  const result = await generateProductPhoto({
    prompt: editPrompt,
    quality: "NANO_BANANA_PRO",
    aspectRatio: "1:1",
    referenceImageUrls: [params.originalUrl, ...params.extraRefUrls],
  });

  if (!result.ok) {
    await db.productImage
      .update({
        where: { id: params.pendingImageId },
        data: { status: "FAILED", errorMessage: result.error.slice(0, 500) },
      })
      .catch(() => undefined);
    // UWAGA: nie wolamy revalidatePath z background — Next.js 16 rzuca
    // "Route ... used revalidatePath during render which is unsupported"
    // gdy strona jest jednoczesnie pollowana po stronie klienta.
    // Polling /sprzedaz/produkty/[id] (force-dynamic) i tak pobiera swieze dane.
    return;
  }

  try {
    const ext = result.contentType.includes("jpeg") ? "jpg" : "png";
    const file = new File(
      [new Uint8Array(result.imageBuffer)],
      `ai-edit-${params.pendingImageId}-${Date.now()}.${ext}`,
      { type: result.contentType },
    );
    const uploaded = await uploadFile(file, {
      folder: `products/${params.productId}/images`,
    });
    await db.productImage.update({
      where: { id: params.pendingImageId },
      data: {
        url: uploaded.url,
        thumbnailWebpUrl: uploaded.thumbnailWebpUrl,
        thumbnailBlurDataUrl: uploaded.thumbnailBlurDataUrl,
        status: "READY",
      },
    });
    await ensureProductHasPrimaryImage(params.productId).catch(() => undefined);
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    await db.productImage
      .update({
        where: { id: params.pendingImageId },
        data: { status: "FAILED", errorMessage: errMsg.slice(0, 500) },
      })
      .catch(() => undefined);
  }
}

/**
 * Custom photo generation w karcie produktu — pozwala wygenerować
 * dowolną liczbę nowych zdjęć (rzutów) per produkt, każde z własnym promptem
 * i własnymi referencjami + wspólny opis grupowy.
 *
 * Wszystkie ujęcia idą Nano Banana Pro w tle (fire-and-forget). UI poll-uje
 * `Product.images` przez `router.refresh()`.
 *
 * Workflow per shot:
 *  - prompt finalny = `${groupPrompt}\n\nShot: ${shot.prompt}`
 *  - referencje = shotRefs (first, composition) ++ groupRefs (style/color context)
 *  - wynik zapisywany jako kolejny ProductImage
 */
export async function generateCustomProductPhotosAction(
  productId: string,
  input: {
    groupPrompt: string;
    groupRefUrls: string[];
    shots: Array<{ prompt: string; refUrls: string[] }>;
    aspectRatio?: string;
  },
): Promise<
  | { ok: true; queued: number; message: string }
  | { ok: false; error: string }
> {
  try {
    await requireUser();
    const companyId = await getCurrentCompanyId();
    const product = await db.product.findFirst({
      where: { id: productId, companyId },
      select: { id: true, name: true, color: true },
    });
    if (!product) return { ok: false, error: "Produkt nie istnieje." };

    const shots = input.shots.filter((s) => s.prompt.trim().length > 0);
    if (shots.length === 0) {
      return { ok: false, error: "Dodaj co najmniej jedno ujęcie z promptem." };
    }
    if (shots.length > 12) {
      return { ok: false, error: "Maksymalnie 12 ujęć naraz." };
    }
    if (!input.groupPrompt.trim()) {
      return { ok: false, error: "Wpisz opis ogólny grupy." };
    }

    const aspectRatio = input.aspectRatio ?? "1:1";

    // Pre-create PENDING rekordy dla kazdego shota — UI od razu pokazuje placeholdery
    // z loaderem zamiast czekac az background dokonczy generowanie.
    const maxSort = await db.productImage.findFirst({
      where: { productId: product.id },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    let nextSort = (maxSort?.sortOrder ?? 0) + 1;
    const pendingRecords = await Promise.all(
      shots.map((s) =>
        db.productImage.create({
          data: {
            productId: product.id,
            url: "",
            status: "PENDING" as const,
            prompt: s.prompt.trim(),
            alt: `AI-custom: ${s.prompt.slice(0, 80)}`,
            sortOrder: nextSort++,
          },
          select: { id: true },
        }),
      ),
    );
    revalidateProductPaths(product.id);

    // Fire-and-forget — odpowiedź wraca natychmiast, generowanie leci dalej
    // w background process.
    void runCustomGenerationInBackground({
      productId: product.id,
      productName: product.name,
      productColor: product.color,
      groupPrompt: input.groupPrompt.trim(),
      groupRefUrls: input.groupRefUrls,
      shots: shots.map((s, i) => ({
        prompt: s.prompt.trim(),
        refUrls: s.refUrls,
        pendingImageId: pendingRecords[i].id,
      })),
      aspectRatio,
    }).catch((e) => {
      console.error(`[custom-gen ${productId}] background error:`, e);
    });

    void logProductAiCost({
      productId: product.id,
      companyId,
      action: "CUSTOM_GEN",
      label: `Custom gen ${shots.length} × Nano Banana`,
      usd: NANO_BANANA_PRO_USD * shots.length,
      metadata: {
        shots: shots.length,
        groupPrompt: input.groupPrompt.slice(0, 200),
      },
    });

    return {
      ok: true,
      queued: shots.length,
      message: `Generuję ${shots.length} ujęć w tle. Możesz zamknąć dialog — wracaj za chwilę i odśwież.`,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Nieznany błąd",
    };
  }
}

async function runCustomGenerationInBackground(params: {
  productId: string;
  productName: string;
  productColor: string | null;
  groupPrompt: string;
  groupRefUrls: string[];
  shots: Array<{ prompt: string; refUrls: string[]; pendingImageId: string }>;
  aspectRatio: string;
}) {
  for (let i = 0; i < params.shots.length; i++) {
    const shot = params.shots[i];
    const productLine = `Product: ${params.productName}${params.productColor ? `, color: ${params.productColor}` : ""}`;
    const compositionHint =
      shot.refUrls.length > 0
        ? `\n\nIMPORTANT: The FIRST attached reference image is the composition template — match its camera angle, framing, perspective, lighting, pose EXACTLY. Other images are for color/material/style context only.`
        : "";
    const finalPrompt =
      `${params.groupPrompt}\n\n${productLine}\n\nShot ${i + 1}: ${shot.prompt}${compositionHint}`;

    const refs = [...shot.refUrls, ...params.groupRefUrls];

    const result = await generateProductPhoto({
      prompt: finalPrompt,
      quality: "NANO_BANANA_PRO",
      aspectRatio: params.aspectRatio,
      referenceImageUrls: refs,
    });

    if (!result.ok) {
      console.warn(
        `[custom-gen ${params.productId}] shot ${i + 1} failed: ${result.error.slice(0, 200)}`,
      );
      await db.productImage
        .update({
          where: { id: shot.pendingImageId },
          data: {
            status: "FAILED",
            errorMessage: result.error.slice(0, 500),
          },
        })
        .catch(() => undefined);
      continue;
    }

    try {
      const ext = result.contentType.includes("jpeg") ? "jpg" : "png";
      const file = new File(
        [new Uint8Array(result.imageBuffer)],
        `custom-${params.productId}-${Date.now()}-${i}.${ext}`,
        { type: result.contentType },
      );
      const uploaded = await uploadFile(file, {
        folder: `products/${params.productId}/images`,
      });
      await db.productImage.update({
        where: { id: shot.pendingImageId },
        data: {
          url: uploaded.url,
          thumbnailWebpUrl: uploaded.thumbnailWebpUrl,
          thumbnailBlurDataUrl: uploaded.thumbnailBlurDataUrl,
          status: "READY",
        },
      });
      await ensureProductHasPrimaryImage(params.productId).catch(
        () => undefined,
      );
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      console.error(
        `[custom-gen ${params.productId}] shot ${i + 1} save failed:`,
        e,
      );
      await db.productImage
        .update({
          where: { id: shot.pendingImageId },
          data: {
            status: "FAILED",
            errorMessage: errMsg.slice(0, 500),
          },
        })
        .catch(() => undefined);
    }
    // UWAGA: nie wolamy revalidatePath z background — patrz komentarz w runEditInBackground.
  }
  console.info(
    `[custom-gen ${params.productId}] done — ${params.shots.length} shots processed`,
  );
}

// ─── Archiwum, usuwanie, bulk-edit zdjec produktowych ────────────────

export async function archiveProductImageAction(
  imageId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireUser();
    const companyId = await getCurrentCompanyId();
    const img = await db.productImage.findFirst({
      where: { id: imageId, product: { companyId } },
      select: { id: true, productId: true },
    });
    if (!img) return { ok: false, error: "Zdjecie nie istnieje." };
    await db.productImage.update({
      where: { id: img.id },
      data: { archived: true, isPrimary: false },
    });
    revalidateProductPaths(img.productId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Blad." };
  }
}

export async function restoreProductImageAction(
  imageId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireUser();
    const companyId = await getCurrentCompanyId();
    const img = await db.productImage.findFirst({
      where: { id: imageId, product: { companyId } },
      select: { id: true, productId: true },
    });
    if (!img) return { ok: false, error: "Zdjecie nie istnieje." };
    await db.productImage.update({
      where: { id: img.id },
      data: { archived: false },
    });
    revalidateProductPaths(img.productId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Blad." };
  }
}

/**
 * Bulk archive/restore/delete dla wielu zaznaczonych zdjec.
 * Bezpieczna granica 100 sztuk na raz.
 */
export async function bulkArchiveProductImagesAction(
  imageIds: string[],
  archived: boolean,
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  try {
    await requireUser();
    const companyId = await getCurrentCompanyId();
    if (imageIds.length === 0) return { ok: false, error: "Brak zaznaczonych." };
    if (imageIds.length > 100) return { ok: false, error: "Max 100 naraz." };

    const imgs = await db.productImage.findMany({
      where: { id: { in: imageIds }, product: { companyId } },
      select: { id: true, productId: true },
    });
    if (imgs.length === 0) return { ok: false, error: "Brak dostepu lub nie istnieja." };

    await db.productImage.updateMany({
      where: { id: { in: imgs.map((i) => i.id) } },
      data: archived
        ? { archived: true, isPrimary: false }
        : { archived: false },
    });

    // Unique productIds — revaliduj kazdy + ensure primary
    const uniqueProducts = Array.from(new Set(imgs.map((i) => i.productId)));
    for (const pid of uniqueProducts) {
      await ensureProductHasPrimaryImage(pid).catch(() => undefined);
      revalidateProductPaths(pid);
    }
    return { ok: true, count: imgs.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Blad." };
  }
}

export async function bulkDeleteProductImagesAction(
  imageIds: string[],
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  try {
    await requireUser();
    const companyId = await getCurrentCompanyId();
    if (imageIds.length === 0) return { ok: false, error: "Brak zaznaczonych." };
    if (imageIds.length > 100) return { ok: false, error: "Max 100 naraz." };

    const imgs = await db.productImage.findMany({
      where: { id: { in: imageIds }, product: { companyId } },
      select: { id: true, productId: true, url: true, isPrimary: true },
    });
    if (imgs.length === 0) return { ok: false, error: "Brak dostepu lub nie istnieja." };

    const { deleteFile } = await import("@/lib/storage");
    // Kasuj pliki (best effort, ignoruj bledy per plik)
    await Promise.all(
      imgs.map((i) => (i.url ? deleteFile(i.url).catch(() => undefined) : undefined)),
    );

    await db.productImage.deleteMany({
      where: { id: { in: imgs.map((i) => i.id) } },
    });

    const uniqueProducts = Array.from(new Set(imgs.map((i) => i.productId)));
    for (const pid of uniqueProducts) {
      await ensureProductHasPrimaryImage(pid).catch(() => undefined);
      revalidateProductPaths(pid);
    }
    return { ok: true, count: imgs.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Blad." };
  }
}

export async function hardDeleteProductImageAction(
  imageId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireUser();
    const companyId = await getCurrentCompanyId();
    const img = await db.productImage.findFirst({
      where: { id: imageId, product: { companyId } },
      select: { id: true, productId: true, url: true, isPrimary: true },
    });
    if (!img) return { ok: true };
    if (img.url) {
      const { deleteFile } = await import("@/lib/storage");
      await deleteFile(img.url).catch(() => undefined);
    }
    await db.productImage.delete({ where: { id: img.id } });
    if (img.isPrimary) {
      const next = await db.productImage.findFirst({
        where: { productId: img.productId, archived: false, status: "READY" },
        orderBy: { sortOrder: "asc" },
      });
      if (next) {
        await db.productImage.update({
          where: { id: next.id },
          data: { isPrimary: true },
        });
      }
    }
    revalidateProductPaths(img.productId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Blad." };
  }
}

/**
 * Bulk-edit AI: dla kazdego z `imageIds` tworzy PENDING placeholder i odpala
 * background edit-runner. Wynik = lista pendingImageId. Polling galerii
 * pokaze gotowe zdjecia po kolei.
 */
export async function bulkEditProductImagesAiAction(
  productId: string,
  imageIds: string[],
  prompt: string,
  extraRefUrls: string[] = [],
): Promise<
  | { ok: true; queued: number }
  | { ok: false; error: string }
> {
  try {
    await requireUser();
    const companyId = await getCurrentCompanyId();
    if (!prompt.trim()) {
      return { ok: false, error: "Wpisz prompt." };
    }
    if (imageIds.length === 0) {
      return { ok: false, error: "Zaznacz co najmniej 1 zdjecie." };
    }
    if (imageIds.length > 20) {
      return { ok: false, error: "Maksymalnie 20 zdjec naraz." };
    }
    const product = await db.product.findFirst({
      where: { id: productId, companyId },
      select: { id: true, name: true, color: true },
    });
    if (!product) return { ok: false, error: "Produkt nie istnieje." };

    const originals = await db.productImage.findMany({
      where: {
        id: { in: imageIds },
        productId,
        status: "READY",
      },
      select: { id: true, url: true, sortOrder: true },
    });
    if (originals.length === 0) {
      return { ok: false, error: "Brak zaznaczonych READY zdjec." };
    }

    const sanitizedRefs = extraRefUrls
      .filter((u) => typeof u === "string" && u.length > 0)
      .slice(0, 4);

    // Pre-create PENDING placeholderow — po jednym na kazde oryginalne
    const maxSort = await db.productImage.findFirst({
      where: { productId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    let nextSort = (maxSort?.sortOrder ?? 0) + 1;
    const pending = await Promise.all(
      originals.map((orig) =>
        db.productImage.create({
          data: {
            productId,
            url: "",
            status: "PENDING",
            prompt: prompt.trim(),
            alt: `AI-bulk: ${prompt.trim().slice(0, 80)}`,
            sortOrder: nextSort++,
          },
          select: { id: true },
        }).then((p) => ({ pendingId: p.id, originalUrl: orig.url })),
      ),
    );
    revalidateProductPaths(productId);

    void (async () => {
      for (const p of pending) {
        await runEditInBackground({
          pendingImageId: p.pendingId,
          productId,
          productName: product.name,
          productColor: product.color,
          originalUrl: p.originalUrl,
          extraRefUrls: sanitizedRefs.filter((u) => u !== p.originalUrl),
          prompt: prompt.trim(),
        }).catch((e) => {
          console.error(`[bulk-edit ${productId}] background error:`, e);
        });
      }
    })();

    void logProductAiCost({
      productId,
      companyId,
      action: "BULK_EDIT",
      label: `Bulk-edit ${pending.length} × "${prompt.trim().slice(0, 60)}"`,
      usd: NANO_BANANA_PRO_USD * pending.length,
      metadata: { count: pending.length, refs: sanitizedRefs.length },
    });

    return { ok: true, queued: pending.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Blad." };
  }
}

/**
 * Upload pliku z dysku jako referencja AI (do uzycia w Edit AI / bulk).
 * Zwraca URL ktory mozna doliczyc do extraRefUrls. Nie tworzy ProductImage —
 * to tylko luzny upload.
 */
/**
 * Skopiuj zaznaczone zdjecia z dowolnego produktu (tej samej firmy) do produktu
 * docelowego. Dwa tryby:
 *  - "copy"  — instant kopia bez kosztu (nowe ProductImage wskazuja na ten sam url)
 *  - "ai"    — bulk-edit cross-product: zrodlowy url staje sie kompozycyjna ref dla
 *              Nano Banana, kazdy pre-create PENDING + bg edit-runner z promptem
 */
export async function copyImagesFromProductAction(
  destProductId: string,
  sourceImageIds: string[],
  mode: "copy" | "ai",
  options: { prompt?: string; extraRefUrls?: string[] } = {},
): Promise<
  | { ok: true; createdCount: number }
  | { ok: false; error: string }
> {
  try {
    await requireUser();
    const companyId = await getCurrentCompanyId();
    if (sourceImageIds.length === 0) {
      return { ok: false, error: "Wybierz zdjecia do skopiowania." };
    }
    if (sourceImageIds.length > 20) {
      return { ok: false, error: "Maksymalnie 20 zdjec naraz." };
    }
    const dest = await db.product.findFirst({
      where: { id: destProductId, companyId },
      select: { id: true, name: true, color: true },
    });
    if (!dest) return { ok: false, error: "Produkt docelowy nie istnieje." };

    const sources = await db.productImage.findMany({
      where: {
        id: { in: sourceImageIds },
        product: { companyId },
        archived: false,
        status: "READY",
      },
      select: {
        id: true,
        url: true,
        thumbnailWebpUrl: true,
        thumbnailBlurDataUrl: true,
        alt: true,
      },
    });
    if (sources.length === 0) {
      return { ok: false, error: "Brak zrodlowych READY zdjec." };
    }

    const maxSort = await db.productImage.findFirst({
      where: { productId: destProductId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    let nextSort = (maxSort?.sortOrder ?? 0) + 1;

    if (mode === "copy") {
      await Promise.all(
        sources.map((s) =>
          db.productImage.create({
            data: {
              productId: destProductId,
              url: s.url,
              thumbnailWebpUrl: s.thumbnailWebpUrl,
              thumbnailBlurDataUrl: s.thumbnailBlurDataUrl,
              alt: s.alt ?? null,
              status: "READY",
              sortOrder: nextSort++,
            },
          }),
        ),
      );
      await ensureProductHasPrimaryImage(destProductId).catch(() => undefined);
      revalidateProductPaths(destProductId);
      return { ok: true, createdCount: sources.length };
    }

    if (!options.prompt?.trim()) {
      return { ok: false, error: "Podaj prompt opisujacy zmiane (np. zmien kolor na granatowy)." };
    }
    const refs = (options.extraRefUrls ?? [])
      .filter((u) => typeof u === "string" && u.length > 0)
      .slice(0, 4);

    const pending = await Promise.all(
      sources.map((s) =>
        db.productImage.create({
          data: {
            productId: destProductId,
            url: "",
            status: "PENDING",
            prompt: options.prompt!.trim(),
            alt: `AI-import: ${options.prompt!.trim().slice(0, 80)}`,
            sortOrder: nextSort++,
          },
          select: { id: true },
        }).then((p) => ({ pendingId: p.id, sourceUrl: s.url })),
      ),
    );
    revalidateProductPaths(destProductId);

    void (async () => {
      for (const p of pending) {
        await runEditInBackground({
          pendingImageId: p.pendingId,
          productId: destProductId,
          productName: dest.name,
          productColor: dest.color,
          originalUrl: p.sourceUrl,
          extraRefUrls: refs.filter((u) => u !== p.sourceUrl),
          prompt: options.prompt!.trim(),
        }).catch((e) => {
          console.error(`[copy-ai ${destProductId}] background error:`, e);
        });
      }
    })();

    void logProductAiCost({
      productId: destProductId,
      companyId,
      action: "COPY_IMAGES_AI",
      label: `Z innego produktu (AI) ${pending.length} × "${options.prompt!.trim().slice(0, 60)}"`,
      usd: NANO_BANANA_PRO_USD * pending.length,
      metadata: { count: pending.length, refs: refs.length },
    });

    return { ok: true, createdCount: pending.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Blad." };
  }
}

export async function uploadAiRefAction(
  formData: FormData,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    await requireUser();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "Brak pliku." };
    }
    if (file.size > 20 * 1024 * 1024) {
      return { ok: false, error: "Plik za duzy (max 20 MB)." };
    }
    if (!file.type.startsWith("image/")) {
      return { ok: false, error: "Tylko obrazy (JPG/PNG/WEBP)." };
    }
    const { uploadFile } = await import("@/lib/storage");
    const uploaded = await uploadFile(file, { folder: "ai-refs" });
    return { ok: true, url: uploaded.url };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Blad uploadu." };
  }
}

/**
 * Lista produktow + miniatury do pickera "refs z innego produktu".
 * Filtruje archived i tylko READY. Limit 200 produktow / 12 obrazow na produkt.
 */
export async function listProductsForRefPickerAction(
  query: string = "",
): Promise<{
  products: Array<{
    id: string;
    name: string;
    productCode: string | null;
    color: string | null;
    images: Array<{
      id: string;
      url: string;
      thumbnailWebpUrl: string | null;
    }>;
  }>;
}> {
  await requireUser();
  const companyId = await getCurrentCompanyId();
  const q = query.trim();
  const products = await db.product.findMany({
    where: {
      companyId,
      archived: false,
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
      images: {
        where: { archived: false, status: "READY" },
        orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
        take: 12,
        select: { id: true, url: true, thumbnailWebpUrl: true },
      },
    },
  });
  return { products };
}

export async function saveImageToProductAction(
  imageId: string,
): Promise<
  | { ok: true; productImageId: string }
  | { ok: false; error: string }
> {
  try {
    await requireUser();
    const companyId = await getCurrentCompanyId();

    // Filter na status zdjęło wcześniej rekordy bez statusu OK lub batch innej firmy.
    // Sprawdzamy każdy warunek osobno żeby user dostał konkretną przyczynę.
    const img = await db.productPhotoImage.findFirst({
      where: { id: imageId },
      include: {
        batch: { select: { companyId: true } },
      },
    });
    if (!img) {
      return { ok: false, error: "Zdjęcie nie istnieje w bazie." };
    }
    if (img.batch.companyId !== companyId) {
      return { ok: false, error: "Zdjęcie należy do innej firmy." };
    }
    if (img.status !== "OK") {
      return {
        ok: false,
        error: `Zdjęcie jeszcze nie jest gotowe (status: ${img.status}). Zaczekaj na zakończenie generowania.`,
      };
    }
    if (!img.storageUrl) {
      return { ok: false, error: "Brak URL-a obrazka w bazie." };
    }

    const created = await db.productImage.create({
      data: {
        productId: img.productId,
        url: img.storageUrl,
        alt: "AI-generated",
        isPrimary: false,
      },
      select: { id: true },
    });

    await ensureProductHasPrimaryImage(img.productId).catch(() => undefined);
    revalidateProductPaths(img.productId);
    return { ok: true as const, productImageId: created.id };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Nieznany błąd przy zapisie.",
    };
  }
}
