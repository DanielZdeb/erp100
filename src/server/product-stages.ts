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

export async function setStageCompleteAction(
  productId: string,
  stage: string,
  done: boolean,
  notes?: string,
) {
  await requireUser();
  const stageVal = stageSchema.parse(stage);

  if (done) {
    await db.productStageCompletion.upsert({
      where: { productId_stage: { productId, stage: stageVal } },
      create: {
        productId,
        stage: stageVal,
        notes: notes?.trim() || null,
      },
      update: {
        notes: notes?.trim() || null,
      },
    });
  } else {
    await db.productStageCompletion.deleteMany({
      where: { productId, stage: stageVal },
    });
  }

  revalidatePath(`/produkty/${productId}`);
  revalidatePath("/produkty");
  return { ok: true as const };
}

export async function updateStageNotesAction(
  productId: string,
  stage: string,
  notes: string,
) {
  await requireUser();
  const stageVal = stageSchema.parse(stage);

  await db.productStageCompletion.upsert({
    where: { productId_stage: { productId, stage: stageVal } },
    create: {
      productId,
      stage: stageVal,
      notes: notes.trim() || null,
    },
    update: {
      notes: notes.trim() || null,
    },
  });

  revalidatePath(`/produkty/${productId}`);
  return { ok: true as const };
}
