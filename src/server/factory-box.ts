"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { uploadFile, deleteFile } from "@/lib/storage";

async function requireUser() {
  const session = await auth();
  if (!session?.user) throw new Error("Brak autoryzacji");
  return session.user;
}

/**
 * Toggle "pudełko z fabryki" + edycja notatki. Nie ruszamy URLi obrazka /
 * pliku — te są nadpisywane przez osobne uploady.
 */
export async function setFactoryBoxAction(
  productId: string,
  patch: {
    included?: boolean;
    accepted?: boolean;
    packagingType?: "BOX" | "POLY_BAG";
    notes?: string | null;
    widthCm?: number | null;
    heightCm?: number | null;
    depthCm?: number | null;
    weightKg?: number | null;
  },
) {
  await requireUser();
  await db.product.update({
    where: { id: productId },
    data: {
      ...(patch.included !== undefined
        ? { factoryBoxIncluded: patch.included }
        : {}),
      ...(patch.accepted !== undefined
        ? { factoryPackagingAccepted: patch.accepted }
        : {}),
      ...(patch.packagingType !== undefined
        ? {
            factoryPackagingType: patch.packagingType,
            // Zmiana typu kasuje akceptację — user musi ponownie zatwierdzić
            factoryPackagingAccepted: false,
            // Foliopak nie ma głębokości — wyzeruj
            ...(patch.packagingType === "POLY_BAG"
              ? { factoryBoxDepthCm: null }
              : {}),
          }
        : {}),
      ...(patch.notes !== undefined
        ? { factoryBoxNotes: patch.notes?.trim() || null }
        : {}),
      ...(patch.widthCm !== undefined
        ? { factoryBoxWidthCm: patch.widthCm }
        : {}),
      ...(patch.heightCm !== undefined
        ? { factoryBoxHeightCm: patch.heightCm }
        : {}),
      ...(patch.depthCm !== undefined
        ? { factoryBoxDepthCm: patch.depthCm }
        : {}),
      ...(patch.weightKg !== undefined
        ? { factoryBoxWeightKg: patch.weightKg }
        : {}),
    },
  });
  revalidatePath(`/produkty/${productId}`);
  return { ok: true as const };
}

/**
 * Upload zdjęcia pudełka z fabryki. Stare zdjęcie (jeśli było) usuwane
 * z storage. Trzymamy maksymalnie jedno zdjęcie referencyjne.
 */
export async function uploadFactoryBoxImageAction(
  productId: string,
  formData: FormData,
) {
  await requireUser();
  const product = await db.product.findUnique({
    where: { id: productId },
    select: { id: true, factoryBoxImageUrl: true },
  });
  if (!product) throw new Error("Produkt nie istnieje.");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Brak pliku.");
  }
  if (!file.type.startsWith("image/")) {
    throw new Error("To nie jest grafika.");
  }

  const uploaded = await uploadFile(file, {
    folder: `products/${productId}/factory-box`,
  });

  // Usuń poprzednie zdjęcie z storage (jeśli było)
  if (product.factoryBoxImageUrl) {
    await deleteFile(product.factoryBoxImageUrl).catch(() => undefined);
  }

  await db.product.update({
    where: { id: productId },
    data: {
      factoryBoxImageUrl: uploaded.url,
      factoryBoxImageAlt: file.name,
      // Automatycznie zaznacz „pakowane w Chinach" jeśli user dodaje zdjęcie
      factoryBoxIncluded: true,
    },
  });

  revalidatePath(`/produkty/${productId}`);
  return { ok: true as const };
}

export async function removeFactoryBoxImageAction(productId: string) {
  await requireUser();
  const product = await db.product.findUnique({
    where: { id: productId },
    select: { factoryBoxImageUrl: true },
  });
  if (product?.factoryBoxImageUrl) {
    await deleteFile(product.factoryBoxImageUrl).catch(() => undefined);
  }
  await db.product.update({
    where: { id: productId },
    data: { factoryBoxImageUrl: null, factoryBoxImageAlt: null },
  });
  revalidatePath(`/produkty/${productId}`);
  return { ok: true as const };
}

/**
 * Upload pliku designu pudełka (np. PDF z print-ready grafikami).
 * Stary plik (jeśli był) usuwany ze storage.
 */
export async function uploadFactoryBoxDesignAction(
  productId: string,
  formData: FormData,
) {
  await requireUser();
  const product = await db.product.findUnique({
    where: { id: productId },
    select: { id: true, factoryBoxDesignUrl: true },
  });
  if (!product) throw new Error("Produkt nie istnieje.");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Brak pliku.");
  }

  const uploaded = await uploadFile(file, {
    folder: `products/${productId}/factory-box-design`,
  });

  if (product.factoryBoxDesignUrl) {
    await deleteFile(product.factoryBoxDesignUrl).catch(() => undefined);
  }

  await db.product.update({
    where: { id: productId },
    data: {
      factoryBoxDesignUrl: uploaded.url,
      factoryBoxDesignName: file.name,
      factoryBoxIncluded: true,
    },
  });

  revalidatePath(`/produkty/${productId}`);
  return { ok: true as const };
}

export async function removeFactoryBoxDesignAction(productId: string) {
  await requireUser();
  const product = await db.product.findUnique({
    where: { id: productId },
    select: { factoryBoxDesignUrl: true },
  });
  if (product?.factoryBoxDesignUrl) {
    await deleteFile(product.factoryBoxDesignUrl).catch(() => undefined);
  }
  await db.product.update({
    where: { id: productId },
    data: { factoryBoxDesignUrl: null, factoryBoxDesignName: null },
  });
  revalidatePath(`/produkty/${productId}`);
  return { ok: true as const };
}
