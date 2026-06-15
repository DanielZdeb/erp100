"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { uploadFile, deleteFile } from "@/lib/storage";

async function requireUser() {
  const session = await auth();
  if (!session?.user) throw new Error("Brak autoryzacji");
  return session.user;
}

// ─── IMAGES ──────────────────────────────────────────────────────────

export async function uploadProductImageAction(
  productId: string,
  formData: FormData,
) {
  await requireUser();
  const product = await db.product.findUnique({
    where: { id: productId },
    select: { id: true },
  });
  if (!product) throw new Error("Produkt nie istnieje.");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Brak pliku.");
  }
  if (!file.type.startsWith("image/")) {
    throw new Error("To nie jest grafika.");
  }

  const stageRaw = formData.get("stage");
  const stage =
    typeof stageRaw === "string" && stageRaw !== ""
      ? parseStage(stageRaw)
      : null;

  const uploaded = await uploadFile(file, {
    folder: `products/${productId}/images`,
  });

  // Grafiki etapowe nie wpływają na "primary" produktu — primary tylko z głównej galerii.
  const existingPrimaryCount = await db.productImage.count({
    where: { productId, stage: null, isPrimary: true },
  });

  const created = await db.productImage.create({
    data: {
      productId,
      url: uploaded.url,
      thumbnailWebpUrl: uploaded.thumbnailWebpUrl,
      thumbnailBlurDataUrl: uploaded.thumbnailBlurDataUrl,
      stage,
      sortOrder: 0,
      isPrimary: stage == null && existingPrimaryCount === 0,
    },
    select: { id: true, url: true },
  });

  revalidatePath(`/produkty/${productId}`);
  return { ok: true as const, id: created.id, url: created.url };
}

const stageEnumValues = [
  "PRODUKCJA",
  "IMPORT",
  "DOKUMENTACJA",
  "WYSYLKA",
  "OPIS",
  "GRAFIKI",
] as const;
type StageT = (typeof stageEnumValues)[number];

function parseStage(v: string): StageT | null {
  return (stageEnumValues as readonly string[]).includes(v)
    ? (v as StageT)
    : null;
}

export async function setPrimaryImageAction(imageId: string) {
  await requireUser();
  const image = await db.productImage.findUnique({
    where: { id: imageId },
    select: { id: true, productId: true },
  });
  if (!image) throw new Error("Grafika nie istnieje.");

  await db.$transaction(async (tx) => {
    await tx.productImage.updateMany({
      where: { productId: image.productId, isPrimary: true },
      data: { isPrimary: false },
    });
    await tx.productImage.update({
      where: { id: imageId },
      data: { isPrimary: true },
    });
  });

  revalidatePath(`/produkty/${image.productId}`);
  revalidatePath("/produkty");
  return { ok: true as const };
}

export async function deleteProductImageAction(imageId: string) {
  await requireUser();
  const image = await db.productImage.findUnique({ where: { id: imageId } });
  if (!image) return { ok: true as const };

  await deleteFile(image.url);
  await db.productImage.delete({ where: { id: imageId } });

  // jeśli usunęliśmy primary — ustaw kolejną jako primary
  if (image.isPrimary) {
    const next = await db.productImage.findFirst({
      where: { productId: image.productId },
      orderBy: { sortOrder: "asc" },
    });
    if (next) {
      await db.productImage.update({
        where: { id: next.id },
        data: { isPrimary: true },
      });
    }
  }

  revalidatePath(`/produkty/${image.productId}`);
  revalidatePath("/produkty");
  return { ok: true as const };
}

// ─── PDF / files ─────────────────────────────────────────────────────

const fileKindSchema = z.enum(["GUIDELINES", "SPEC", "CERTIFICATE", "OTHER"]);

export async function uploadProductFileAction(
  productId: string,
  formData: FormData,
) {
  await requireUser();
  const product = await db.product.findUnique({
    where: { id: productId },
    select: { id: true },
  });
  if (!product) throw new Error("Produkt nie istnieje.");

  const file = formData.get("file");
  const kindRaw = formData.get("kind");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Brak pliku.");
  }
  const kind = fileKindSchema.parse(kindRaw);

  const stageRaw = formData.get("stage");
  const stage =
    typeof stageRaw === "string" && stageRaw !== ""
      ? parseStage(stageRaw)
      : null;

  const uploaded = await uploadFile(file, {
    folder: `products/${productId}/files`,
  });

  await db.productFile.create({
    data: {
      productId,
      url: uploaded.url,
      filename: uploaded.filename,
      contentType: uploaded.contentType,
      sizeBytes: uploaded.sizeBytes,
      kind,
      stage,
    },
  });

  revalidatePath(`/produkty/${productId}`);
  return { ok: true as const };
}

export async function deleteProductFileAction(fileId: string) {
  await requireUser();
  const file = await db.productFile.findUnique({ where: { id: fileId } });
  if (!file) return { ok: true as const };

  await deleteFile(file.url);
  await db.productFile.delete({ where: { id: fileId } });
  revalidatePath(`/produkty/${file.productId}`);
  return { ok: true as const };
}

// ─── Price history (manual entries) ──────────────────────────────────

const priceEntrySchema = z.object({
  recordedAt: z.string().optional().nullable(),
  factoryPriceUsd: z.union([z.string(), z.number()]).optional().nullable(),
  factoryPriceCny: z.union([z.string(), z.number()]).optional().nullable(),
  factoryPricePln: z.union([z.string(), z.number()]).optional().nullable(),
  landedCostPln: z.union([z.string(), z.number()]).optional().nullable(),
  cbmPerUnit: z.union([z.string(), z.number()]).optional().nullable(),
  notes: z.string().optional().nullable(),
});

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function addPriceHistoryAction(
  productId: string,
  input: unknown,
) {
  await requireUser();
  const data = priceEntrySchema.parse(input);

  await db.productPriceHistory.create({
    data: {
      productId,
      recordedAt: data.recordedAt ? new Date(data.recordedAt) : new Date(),
      factoryPriceUsd: num(data.factoryPriceUsd),
      factoryPriceCny: num(data.factoryPriceCny),
      factoryPricePln: num(data.factoryPricePln),
      landedCostPln: num(data.landedCostPln),
      cbmPerUnit: num(data.cbmPerUnit),
      notes: data.notes?.trim() || null,
    },
  });

  revalidatePath(`/produkty/${productId}`);
  return { ok: true as const };
}

export async function deletePriceHistoryAction(id: string) {
  await requireUser();
  const entry = await db.productPriceHistory.findUnique({
    where: { id },
    select: { id: true, productId: true },
  });
  if (!entry) return { ok: true as const };

  await db.productPriceHistory.delete({ where: { id } });
  revalidatePath(`/produkty/${entry.productId}`);
  return { ok: true as const };
}
