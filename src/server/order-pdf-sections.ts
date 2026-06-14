"use server";

import { promises as fs } from "node:fs";
import path from "node:path";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";

async function requireUser() {
  const session = await auth();
  if (!session?.user) throw new Error("Brak autoryzacji");
  return session.user;
}

async function requireOrderInCompany(orderId: string) {
  const companyId = await getCurrentCompanyId();
  const order = await db.importOrder.findFirst({
    where: { id: orderId, companyId },
    select: { id: true },
  });
  if (!order) throw new Error("Zamówienie nie istnieje.");
  return order;
}

async function requireSectionInCompany(sectionId: string) {
  const companyId = await getCurrentCompanyId();
  const section = await db.importOrderPdfSection.findFirst({
    where: { id: sectionId, order: { companyId } },
    select: { id: true, orderId: true },
  });
  if (!section) throw new Error("Sekcja nie istnieje.");
  return section;
}

export async function createPdfSectionAction(
  orderId: string,
  input: { title: string },
) {
  await requireUser();
  await requireOrderInCompany(orderId);
  const title = z.string().min(1, "Podaj nazwę sekcji").trim().parse(
    input.title,
  );
  const max = await db.importOrderPdfSection.aggregate({
    where: { orderId },
    _max: { sortOrder: true },
  });
  const next = (max._max.sortOrder ?? -1) + 1;
  const section = await db.importOrderPdfSection.create({
    data: { orderId, title, sortOrder: next },
    select: { id: true },
  });
  revalidatePath(`/zamowienia/${orderId}`);
  revalidatePath(`/zamowienia/z-polski/${orderId}`);
  return { ok: true as const, id: section.id };
}

export async function updatePdfSectionAction(
  sectionId: string,
  patch: { title?: string; content?: string | null },
) {
  await requireUser();
  const sec = await requireSectionInCompany(sectionId);
  const data: { title?: string; content?: string | null } = {};
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t) throw new Error("Tytuł nie może być pusty.");
    data.title = t;
  }
  if (patch.content !== undefined) {
    data.content = patch.content?.trim() ? patch.content : null;
  }
  if (Object.keys(data).length === 0) return { ok: true as const };
  await db.importOrderPdfSection.update({
    where: { id: sectionId },
    data,
  });
  revalidatePath(`/zamowienia/${sec.orderId}`);
  revalidatePath(`/zamowienia/z-polski/${sec.orderId}`);
  return { ok: true as const };
}

export async function deletePdfSectionAction(sectionId: string) {
  await requireUser();
  const sec = await requireSectionInCompany(sectionId);
  // Usuń wszystkie pliki obrazków z dysku przed kaskadowym DELETE w DB.
  const images = await db.importOrderPdfSectionImage.findMany({
    where: { sectionId },
    select: { url: true },
  });
  for (const img of images) {
    if (img.url.startsWith("/uploads/")) {
      const filePath = path.join(
        process.cwd(),
        "public",
        img.url.replace(/^\//, ""),
      );
      await fs.unlink(filePath).catch(() => undefined);
    }
  }
  await db.importOrderPdfSection.delete({ where: { id: sectionId } });
  revalidatePath(`/zamowienia/${sec.orderId}`);
  revalidatePath(`/zamowienia/z-polski/${sec.orderId}`);
  return { ok: true as const };
}

export async function reorderPdfSectionsAction(
  orderId: string,
  ids: string[],
) {
  await requireUser();
  await requireOrderInCompany(orderId);
  // Atomicznie ustaw sortOrder zgodnie z kolejnością `ids`. Każde ID musi
  // należeć do tego zamówienia — Prisma updateMany filtruje po orderId.
  await db.$transaction(
    ids.map((id, idx) =>
      db.importOrderPdfSection.updateMany({
        where: { id, orderId },
        data: { sortOrder: idx },
      }),
    ),
  );
  revalidatePath(`/zamowienia/${orderId}`);
  revalidatePath(`/zamowienia/z-polski/${orderId}`);
  return { ok: true as const };
}

/**
 * Parser data URI bez regexa — regex z greedy `(.+)` wybucha „Maximum call
 * stack size exceeded" na stringach >~3MB (silnik V8 rekursywnie iteruje
 * po długim base64). startsWith + slice działa O(1) na prefixie.
 */
function parseImageDataUri(
  dataUri: string,
): { mime: string; base64: string } | null {
  const allowed = ["png", "jpeg", "jpg", "webp", "gif"];
  if (!dataUri.startsWith("data:image/")) return null;
  const semiIdx = dataUri.indexOf(";", 11);
  if (semiIdx < 0) return null;
  const mimeSuffix = dataUri.slice(11, semiIdx).toLowerCase();
  if (!allowed.includes(mimeSuffix)) return null;
  const headerEnd = dataUri.indexOf(",", semiIdx);
  if (headerEnd < 0) return null;
  if (dataUri.slice(semiIdx + 1, headerEnd) !== "base64") return null;
  return {
    mime: mimeSuffix === "jpg" ? "jpeg" : mimeSuffix,
    base64: dataUri.slice(headerEnd + 1),
  };
}

export async function addPdfSectionImageAction(
  sectionId: string,
  input: { dataUri: string; alt?: string | null },
) {
  await requireUser();
  const sec = await requireSectionInCompany(sectionId);
  const parsed = parseImageDataUri(input.dataUri);
  if (!parsed) throw new Error("Obraz musi być w formacie PNG/JPG/WEBP/GIF");
  const mime = parsed.mime;
  const ext = mime === "jpeg" ? "jpg" : mime;
  const buf = Buffer.from(parsed.base64, "base64");
  if (buf.length > 5 * 1024 * 1024) {
    throw new Error("Maksymalny rozmiar obrazu: 5 MB");
  }
  const folder = path.join(
    process.cwd(),
    "public",
    "uploads",
    "order-pdf",
    sec.orderId,
  );
  await fs.mkdir(folder, { recursive: true });
  const filename = `${sectionId}-${Date.now()}.${ext}`;
  await fs.writeFile(path.join(folder, filename), buf);
  const url = `/uploads/order-pdf/${sec.orderId}/${filename}`;

  const max = await db.importOrderPdfSectionImage.aggregate({
    where: { sectionId },
    _max: { sortOrder: true },
  });
  const next = (max._max.sortOrder ?? -1) + 1;
  const image = await db.importOrderPdfSectionImage.create({
    data: {
      sectionId,
      url,
      alt: input.alt?.trim() || null,
      sortOrder: next,
    },
    select: { id: true, url: true },
  });
  revalidatePath(`/zamowienia/${sec.orderId}`);
  revalidatePath(`/zamowienia/z-polski/${sec.orderId}`);
  return { ok: true as const, id: image.id, url: image.url };
}

export async function removePdfSectionImageAction(imageId: string) {
  await requireUser();
  const companyId = await getCurrentCompanyId();
  const img = await db.importOrderPdfSectionImage.findFirst({
    where: { id: imageId, section: { order: { companyId } } },
    select: { id: true, url: true, section: { select: { orderId: true } } },
  });
  if (!img) throw new Error("Obraz nie istnieje.");
  if (img.url.startsWith("/uploads/")) {
    const filePath = path.join(
      process.cwd(),
      "public",
      img.url.replace(/^\//, ""),
    );
    await fs.unlink(filePath).catch(() => undefined);
  }
  await db.importOrderPdfSectionImage.delete({ where: { id: imageId } });
  revalidatePath(`/zamowienia/${img.section.orderId}`);
  revalidatePath(`/zamowienia/z-polski/${img.section.orderId}`);
  return { ok: true as const };
}
