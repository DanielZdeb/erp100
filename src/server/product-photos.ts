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
export async function saveImageToProductAction(imageId: string) {
  await requireUser();
  const companyId = await getCurrentCompanyId();

  const img = await db.productPhotoImage.findFirst({
    where: { id: imageId, status: "OK" },
    include: {
      batch: { select: { companyId: true } },
    },
  });
  if (!img || img.batch.companyId !== companyId || !img.storageUrl) {
    throw new Error("Zdjęcie niedostępne");
  }

  await db.productImage.create({
    data: {
      productId: img.productId,
      url: img.storageUrl,
      alt: "AI-generated",
      isPrimary: false,
    },
  });

  revalidatePath(`/produkty/${img.productId}`);
  return { ok: true as const };
}
