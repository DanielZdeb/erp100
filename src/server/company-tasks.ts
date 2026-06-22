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

const statusEnum = z.enum(["TODO", "IN_PROGRESS", "DONE"]);
const priorityEnum = z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]);

const createSchema = z.object({
  title: z.string().trim().min(1, "Tytuł wymagany").max(200),
  description: z.string().trim().max(5000).optional().nullable(),
  status: statusEnum.optional(),
  priority: priorityEnum.optional(),
  assignedToId: z.string().optional().nullable(),
  dueAt: z.string().optional().nullable(),
});

const updateSchema = createSchema.partial();

function refresh() {
  revalidatePath("/dashboard");
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

export async function createCompanyTaskAction(input: unknown) {
  const user = await requireUser();
  const companyId = await getCurrentCompanyId();
  const data = createSchema.parse(input);

  // sortOrder: na sam górę kolumny (najnowsze najwyżej)
  const minOrder = await db.companyTask.aggregate({
    where: { companyId, status: data.status ?? "TODO" },
    _min: { sortOrder: true },
  });
  const sortOrder = (minOrder._min.sortOrder ?? 0) - 10;

  const task = await db.companyTask.create({
    data: {
      companyId,
      title: data.title,
      description: data.description?.trim() || null,
      status: data.status ?? "TODO",
      priority: data.priority ?? "NORMAL",
      assignedToId: data.assignedToId || null,
      dueAt: parseDate(data.dueAt),
      createdById: user.id,
      sortOrder,
    },
    select: { id: true },
  });

  refresh();
  return { ok: true as const, id: task.id };
}

export async function updateCompanyTaskAction(
  id: string,
  input: unknown,
) {
  await requireUser();
  const companyId = await getCurrentCompanyId();
  const data = updateSchema.parse(input);

  const existing = await db.companyTask.findFirst({
    where: { id, companyId },
    select: { id: true, status: true },
  });
  if (!existing) throw new Error("Zadanie nie istnieje");

  // completedAt: ustaw timestamp przy przejściu na DONE, czyść przy powrocie
  // na inny status. undefined = nie zmieniaj (status nie był w payloadzie).
  const completedAt =
    data.status === "DONE"
      ? new Date()
      : data.status
        ? null
        : undefined;

  await db.companyTask.update({
    where: { id },
    data: {
      ...(data.title != null && { title: data.title }),
      ...(data.description !== undefined && {
        description: data.description?.trim() || null,
      }),
      ...(data.status != null && { status: data.status }),
      ...(data.priority != null && { priority: data.priority }),
      ...(data.assignedToId !== undefined && {
        assignedToId: data.assignedToId || null,
      }),
      ...(data.dueAt !== undefined && { dueAt: parseDate(data.dueAt) }),
      ...(completedAt !== undefined && { completedAt }),
    },
  });

  refresh();
  return { ok: true as const };
}

export async function changeCompanyTaskStatusAction(
  id: string,
  status: unknown,
) {
  await requireUser();
  const companyId = await getCurrentCompanyId();
  const parsed = statusEnum.parse(status);

  const existing = await db.companyTask.findFirst({
    where: { id, companyId },
    select: { id: true, status: true },
  });
  if (!existing) throw new Error("Zadanie nie istnieje");
  if (existing.status === parsed) return { ok: true as const };

  // sortOrder: na górę nowej kolumny
  const minOrder = await db.companyTask.aggregate({
    where: { companyId, status: parsed },
    _min: { sortOrder: true },
  });
  const sortOrder = (minOrder._min.sortOrder ?? 0) - 10;

  await db.companyTask.update({
    where: { id },
    data: {
      status: parsed,
      sortOrder,
      completedAt: parsed === "DONE" ? new Date() : null,
    },
  });

  refresh();
  return { ok: true as const };
}

export async function assignCompanyTaskAction(
  id: string,
  userId: string | null,
) {
  await requireUser();
  const companyId = await getCurrentCompanyId();

  const existing = await db.companyTask.findFirst({
    where: { id, companyId },
    select: { id: true },
  });
  if (!existing) throw new Error("Zadanie nie istnieje");

  // Walidacja: userId musi należeć do tej firmy (jeśli podany)
  if (userId) {
    const member = await db.user.findFirst({
      where: { id: userId, companyId },
      select: { id: true },
    });
    if (!member) throw new Error("Użytkownik spoza firmy");
  }

  await db.companyTask.update({
    where: { id },
    data: { assignedToId: userId },
  });

  refresh();
  return { ok: true as const };
}

export async function deleteCompanyTaskAction(id: string) {
  await requireUser();
  const companyId = await getCurrentCompanyId();

  const existing = await db.companyTask.findFirst({
    where: { id, companyId },
    select: { id: true, attachments: { select: { url: true } } },
  });
  if (!existing) throw new Error("Zadanie nie istnieje");

  // Skasuj załączniki z storage (best-effort)
  for (const att of existing.attachments) {
    try {
      await deleteFile(att.url);
    } catch {
      /* ignoruj */
    }
  }

  await db.companyTask.delete({ where: { id } });
  refresh();
  return { ok: true as const };
}

export async function uploadCompanyTaskAttachmentAction(
  taskId: string,
  formData: FormData,
) {
  const user = await requireUser();
  const companyId = await getCurrentCompanyId();

  const task = await db.companyTask.findFirst({
    where: { id: taskId, companyId },
    select: { id: true },
  });
  if (!task) throw new Error("Zadanie nie istnieje");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Brak pliku");
  }

  const uploaded = await uploadFile(file, {
    folder: `company-tasks/${taskId}`,
  });

  const isImageFile = (file.type || "").startsWith("image/");

  await db.companyTaskAttachment.create({
    data: {
      taskId,
      url: uploaded.url,
      filename: uploaded.filename,
      contentType: uploaded.contentType,
      sizeBytes: uploaded.sizeBytes,
      isImage: isImageFile,
      uploadedById: user.id,
    },
  });

  refresh();
  return { ok: true as const };
}

export async function deleteCompanyTaskAttachmentAction(attachmentId: string) {
  await requireUser();
  const companyId = await getCurrentCompanyId();

  const att = await db.companyTaskAttachment.findFirst({
    where: { id: attachmentId, task: { companyId } },
    select: { id: true, url: true },
  });
  if (!att) throw new Error("Załącznik nie istnieje");

  try {
    await deleteFile(att.url);
  } catch {
    /* ignoruj — DB zostanie wyczyszczone */
  }

  await db.companyTaskAttachment.delete({ where: { id: attachmentId } });
  refresh();
  return { ok: true as const };
}
