"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";

const stageSchema = z.enum([
  "PRODUKCJA",
  "IMPORT",
  "DOKUMENTACJA",
  "WYSYLKA",
  "OPIS",
  "GRAFIKI",
]);

async function requireUser() {
  const session = await auth();
  if (!session?.user) throw new Error("Brak autoryzacji");
  return session.user;
}

export async function addChecklistItemAction(
  productId: string,
  stage: string,
  title: string,
) {
  await requireUser();
  const stageVal = stageSchema.parse(stage);
  const cleanTitle = title.trim();
  if (!cleanTitle) throw new Error("Podaj treść punktu.");

  const last = await db.stageChecklistItem.findFirst({
    where: { productId, stage: stageVal },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  await db.stageChecklistItem.create({
    data: {
      productId,
      stage: stageVal,
      title: cleanTitle,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
  });

  revalidatePath(`/produkty/${productId}`);
  return { ok: true as const };
}

export async function toggleChecklistItemAction(
  itemId: string,
  done: boolean,
) {
  await requireUser();
  const item = await db.stageChecklistItem.findUnique({
    where: { id: itemId },
    select: { id: true, productId: true },
  });
  if (!item) throw new Error("Punkt nie istnieje.");

  await db.stageChecklistItem.update({
    where: { id: itemId },
    data: { done, doneAt: done ? new Date() : null },
  });
  revalidatePath(`/produkty/${item.productId}`);
  return { ok: true as const };
}

export async function updateChecklistItemAction(
  itemId: string,
  title: string,
) {
  await requireUser();
  const cleanTitle = title.trim();
  if (!cleanTitle) throw new Error("Podaj treść punktu.");

  const item = await db.stageChecklistItem.findUnique({
    where: { id: itemId },
    select: { id: true, productId: true },
  });
  if (!item) throw new Error("Punkt nie istnieje.");

  await db.stageChecklistItem.update({
    where: { id: itemId },
    data: { title: cleanTitle },
  });
  revalidatePath(`/produkty/${item.productId}`);
  return { ok: true as const };
}

export async function deleteChecklistItemAction(itemId: string) {
  await requireUser();
  const item = await db.stageChecklistItem.findUnique({
    where: { id: itemId },
    select: { id: true, productId: true },
  });
  if (!item) return { ok: true as const };
  await db.stageChecklistItem.delete({ where: { id: itemId } });
  revalidatePath(`/produkty/${item.productId}`);
  return { ok: true as const };
}
