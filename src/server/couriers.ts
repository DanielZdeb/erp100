"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";
import { uploadFile, deleteFile } from "@/lib/storage";

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Brak autoryzacji");
  return session.user as { id: string };
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function dateOrNull(v: unknown): Date | null {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const courierSchema = z.object({
  name: z.string().min(1, "Podaj nazwę"),
  active: z
    .union([z.boolean(), z.string()])
    .transform((v) => v === true || v === "true" || v === "on")
    .optional(),
  notes: z.string().optional().nullable(),
});

export async function createCourierAction(input: unknown) {
  await requireUser();
  const companyId = await getCurrentCompanyId();
  const data = courierSchema.parse(input);
  const courier = await db.courier.create({
    data: {
      name: data.name.trim(),
      active: data.active ?? true,
      notes: data.notes?.trim() || null,
      companyId,
    },
  });
  revalidatePath("/kurierzy");
  return { ok: true as const, id: courier.id };
}

export async function updateCourierAction(id: string, input: unknown) {
  await requireUser();
  const data = courierSchema.parse(input);
  await db.courier.update({
    where: { id },
    data: {
      name: data.name.trim(),
      active: data.active ?? true,
      notes: data.notes?.trim() || null,
    },
  });
  revalidatePath("/kurierzy");
  revalidatePath(`/kurierzy/${id}`);
  return { ok: true as const };
}

export async function deleteCourierAction(id: string) {
  await requireUser();
  await db.courier.delete({ where: { id } });
  revalidatePath("/kurierzy");
  return { ok: true as const };
}

// ─── Stawki ─────────────────────────────────────────────────────────

const rateSchema = z.object({
  serviceType: z.string().min(1, "Podaj nazwę usługi"),
  pricePln: z.union([z.string(), z.number()]),
  maxWeightKg: z.union([z.string(), z.number()]).optional().nullable(),
  maxLengthCm: z.union([z.string(), z.number()]).optional().nullable(),
  maxWidthCm: z.union([z.string(), z.number()]).optional().nullable(),
  maxHeightCm: z.union([z.string(), z.number()]).optional().nullable(),
  maxSumDimsCm: z.union([z.string(), z.number()]).optional().nullable(),
  isPaczkomat: z
    .union([z.boolean(), z.string()])
    .transform((v) => v === true || v === "true" || v === "on")
    .optional(),
  validFrom: z.string().optional().nullable(),
  validTo: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function addCourierRateAction(
  courierId: string,
  input: unknown,
) {
  await requireUser();
  const data = rateSchema.parse(input);
  await db.courierRate.create({
    data: {
      courierId,
      serviceType: data.serviceType.trim(),
      pricePln: num(data.pricePln) ?? 0,
      maxWeightKg: num(data.maxWeightKg),
      maxLengthCm: num(data.maxLengthCm),
      maxWidthCm: num(data.maxWidthCm),
      maxHeightCm: num(data.maxHeightCm),
      maxSumDimsCm: num(data.maxSumDimsCm),
      isPaczkomat: data.isPaczkomat ?? false,
      validFrom: dateOrNull(data.validFrom),
      validTo: dateOrNull(data.validTo),
      notes: data.notes?.trim() || null,
    },
  });
  revalidatePath(`/kurierzy/${courierId}`);
  return { ok: true as const };
}

export async function updateCourierRateAction(rateId: string, input: unknown) {
  await requireUser();
  const data = rateSchema.parse(input);
  const rate = await db.courierRate.findUnique({
    where: { id: rateId },
    select: { courierId: true },
  });
  if (!rate) throw new Error("Stawka nie istnieje.");
  await db.courierRate.update({
    where: { id: rateId },
    data: {
      serviceType: data.serviceType.trim(),
      pricePln: num(data.pricePln) ?? 0,
      maxWeightKg: num(data.maxWeightKg),
      maxLengthCm: num(data.maxLengthCm),
      maxWidthCm: num(data.maxWidthCm),
      maxHeightCm: num(data.maxHeightCm),
      maxSumDimsCm: num(data.maxSumDimsCm),
      isPaczkomat: data.isPaczkomat ?? false,
      validFrom: dateOrNull(data.validFrom),
      validTo: dateOrNull(data.validTo),
      notes: data.notes?.trim() || null,
    },
  });
  revalidatePath(`/kurierzy/${rate.courierId}`);
  return { ok: true as const };
}

export async function deleteCourierRateAction(rateId: string) {
  await requireUser();
  const rate = await db.courierRate.findUnique({
    where: { id: rateId },
    select: { courierId: true },
  });
  if (!rate) return { ok: true as const };
  await db.courierRate.delete({ where: { id: rateId } });
  revalidatePath(`/kurierzy/${rate.courierId}`);
  return { ok: true as const };
}

// ─── Umowy ──────────────────────────────────────────────────────────

export async function addCourierContractAction(
  courierId: string,
  formData: FormData,
) {
  await requireUser();
  const startsAt = dateOrNull(formData.get("startsAt"));
  const endsAt = dateOrNull(formData.get("endsAt"));
  const notesRaw = formData.get("notes");
  const notes = typeof notesRaw === "string" ? notesRaw.trim() || null : null;
  const file = formData.get("file");

  if (!startsAt) throw new Error("Podaj datę rozpoczęcia.");

  let fileUrl: string | null = null;
  let filename: string | null = null;
  if (file instanceof File && file.size > 0) {
    const up = await uploadFile(file, {
      folder: `couriers/${courierId}/contracts`,
    });
    fileUrl = up.url;
    filename = up.filename;
  }

  await db.courierContract.create({
    data: {
      courierId,
      startsAt,
      endsAt,
      fileUrl,
      filename,
      notes,
    },
  });

  revalidatePath(`/kurierzy/${courierId}`);
  return { ok: true as const };
}

export async function deleteCourierContractAction(contractId: string) {
  await requireUser();
  const c = await db.courierContract.findUnique({ where: { id: contractId } });
  if (!c) return { ok: true as const };
  if (c.fileUrl) await deleteFile(c.fileUrl);
  await db.courierContract.delete({ where: { id: contractId } });
  revalidatePath(`/kurierzy/${c.courierId}`);
  return { ok: true as const };
}

// ─── Rekomendacje per produkt ───────────────────────────────────────

export async function setCourierRecommendationAction(
  productId: string,
  courierId: string,
  priority: number,
  notes?: string,
) {
  await requireUser();
  const existing = await db.courierRecommendation.findUnique({
    where: { productId_courierId: { productId, courierId } },
  });

  if (existing) {
    await db.courierRecommendation.update({
      where: { id: existing.id },
      data: { priority, notes: notes?.trim() || null },
    });
  } else {
    await db.courierRecommendation.create({
      data: {
        productId,
        courierId,
        priority,
        notes: notes?.trim() || null,
      },
    });
  }

  revalidatePath(`/produkty/${productId}`);
  revalidatePath(`/kurierzy/${courierId}`);
  return { ok: true as const };
}

export async function removeCourierRecommendationAction(
  productId: string,
  courierId: string,
) {
  await requireUser();
  await db.courierRecommendation.deleteMany({
    where: { productId, courierId },
  });
  revalidatePath(`/produkty/${productId}`);
  revalidatePath(`/kurierzy/${courierId}`);
  return { ok: true as const };
}
