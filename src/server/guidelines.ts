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

type GuidelineKindT = "PRODUCTION" | "IMPORT" | "USER_MANUAL";
const KINDS: GuidelineKindT[] = ["PRODUCTION", "IMPORT", "USER_MANUAL"];

function assertKind(k: string): asserts k is GuidelineKindT {
  if (!(KINDS as string[]).includes(k))
    throw new Error(`Nieobsługiwany typ wytycznych: ${k}`);
}

// ─── Punkty ──────────────────────────────────────────────────────────

export async function addGuidelinePointAction(
  productId: string,
  kind: string,
  text: string,
) {
  await requireUser();
  assertKind(kind);
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Treść punktu nie może być pusta.");

  // Ostatni sortOrder w obrębie kind żeby nowe punkty wpadały na koniec
  const last = await db.productGuidelinePoint.findFirst({
    where: { productId, kind },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (last?.sortOrder ?? -1) + 1;

  const created = await db.productGuidelinePoint.create({
    data: { productId, kind, text: trimmed, sortOrder },
    select: { id: true },
  });
  revalidatePath(`/produkty/${productId}`);
  return { ok: true as const, id: created.id };
}

export async function updateGuidelinePointAction(
  pointId: string,
  text: string,
) {
  await requireUser();
  const point = await db.productGuidelinePoint.findUnique({
    where: { id: pointId },
    select: { productId: true },
  });
  if (!point) throw new Error("Punkt nie istnieje.");
  await db.productGuidelinePoint.update({
    where: { id: pointId },
    data: { text: text.trim() },
  });
  revalidatePath(`/produkty/${point.productId}`);
  return { ok: true as const };
}

export async function deleteGuidelinePointAction(pointId: string) {
  await requireUser();
  const point = await db.productGuidelinePoint.findUnique({
    where: { id: pointId },
    select: { productId: true, images: { select: { url: true } } },
  });
  if (!point) return { ok: true as const };
  for (const img of point.images) {
    await deleteFile(img.url).catch(() => undefined);
  }
  await db.productGuidelinePoint.delete({ where: { id: pointId } });
  revalidatePath(`/produkty/${point.productId}`);
  return { ok: true as const };
}

export async function reorderGuidelinePointsAction(
  productId: string,
  kind: string,
  pointIds: string[],
) {
  await requireUser();
  assertKind(kind);
  const owned = await db.productGuidelinePoint.findMany({
    where: { productId, kind, id: { in: pointIds } },
    select: { id: true },
  });
  const ownedSet = new Set(owned.map((p) => p.id));
  const validIds = pointIds.filter((id) => ownedSet.has(id));
  await db.$transaction(async (tx) => {
    for (let i = 0; i < validIds.length; i++) {
      await tx.productGuidelinePoint.update({
        where: { id: validIds[i] },
        data: { sortOrder: i },
      });
    }
  });
  revalidatePath(`/produkty/${productId}`);
  return { ok: true as const };
}

// ─── Grafiki (sekcji albo punktu) ────────────────────────────────────

export async function uploadGuidelineImageAction(
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
  const kindRaw = formData.get("kind");
  if (typeof kindRaw !== "string") throw new Error("Brak `kind`.");
  assertKind(kindRaw);
  const pointIdRaw = formData.get("pointId");
  const pointId =
    typeof pointIdRaw === "string" && pointIdRaw ? pointIdRaw : null;

  // Gdy podano pointId — zweryfikuj że należy do tego produktu i kind się zgadza
  if (pointId) {
    const point = await db.productGuidelinePoint.findUnique({
      where: { id: pointId },
      select: { productId: true, kind: true },
    });
    if (!point || point.productId !== productId)
      throw new Error("Punkt nie należy do tego produktu.");
    if (point.kind !== kindRaw)
      throw new Error("Niezgodność `kind` z punktem.");
  }

  const uploaded = await uploadFile(file, {
    folder: `products/${productId}/guidelines/${kindRaw.toLowerCase()}`,
  });

  // Następny sortOrder w obrębie (productId, kind, pointId)
  const last = await db.productGuidelineImage.findFirst({
    where: { productId, kind: kindRaw, pointId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (last?.sortOrder ?? -1) + 1;

  await db.productGuidelineImage.create({
    data: {
      productId,
      kind: kindRaw,
      pointId,
      url: uploaded.url,
      alt: file.name,
      sortOrder,
    },
  });
  revalidatePath(`/produkty/${productId}`);
  return { ok: true as const };
}

export async function deleteGuidelineImageAction(imageId: string) {
  await requireUser();
  const img = await db.productGuidelineImage.findUnique({
    where: { id: imageId },
    select: { productId: true, url: true },
  });
  if (!img) return { ok: true as const };
  await deleteFile(img.url).catch(() => undefined);
  await db.productGuidelineImage.delete({ where: { id: imageId } });
  revalidatePath(`/produkty/${img.productId}`);
  return { ok: true as const };
}
