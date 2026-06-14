"use server";

import { promises as fs } from "node:fs";
import path from "node:path";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";

type PolandOrderKindT = "MATERIAL_SZARFY";
type PdfTargetT = "FABRYKA" | "KRAJALNIA";
const targetSchema = z.enum(["FABRYKA", "KRAJALNIA"]);

const defaultRatesSchema = z.object({
  defaultKrojeniePerSztPln: z
    .union([z.string(), z.number()])
    .nullable()
    .optional()
    .transform((v) => {
      if (v === null || v === undefined || v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? n : null;
    }),
  defaultSzwalniaPerSztPln: z
    .union([z.string(), z.number()])
    .nullable()
    .optional()
    .transform((v) => {
      if (v === null || v === undefined || v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? n : null;
    }),
});

/**
 * Aktualizuje domyślne stawki za krojenie i szwalnię (per szt) na firmie.
 * Te wartości są automatycznie wstawiane do pola input w Płatnościach
 * nowego zamówienia PL gdy odpowiedni koszt nie ma jeszcze wpisanej wartości.
 */
export async function updateCompanyDefaultRatesAction(input: unknown) {
  await requireUser();
  const companyId = await getCurrentCompanyId();
  const data = defaultRatesSchema.parse(input);
  await db.company.update({
    where: { id: companyId },
    data,
  });
  revalidatePath("/ustawienia/szablony-zamowien");
  revalidatePath("/zamowienia");
  return { ok: true as const };
}

async function requireUser() {
  const session = await auth();
  if (!session?.user) throw new Error("Brak autoryzacji");
  return session.user;
}

async function requireTemplateSectionInCompany(sectionId: string) {
  const companyId = await getCurrentCompanyId();
  const section = await db.orderTemplateSection.findFirst({
    where: { id: sectionId, companyId },
    select: { id: true, kind: true },
  });
  if (!section) throw new Error("Szablon sekcji nie istnieje.");
  return { section, companyId };
}

const kindSchema = z.enum(["MATERIAL_SZARFY"]);

export async function createTemplateSectionAction(
  kind: PolandOrderKindT,
  target: PdfTargetT,
  input: { title: string },
) {
  await requireUser();
  const companyId = await getCurrentCompanyId();
  const k = kindSchema.parse(kind);
  const t = targetSchema.parse(target);
  const title = z
    .string()
    .min(1, "Podaj nazwę sekcji")
    .trim()
    .parse(input.title);
  const max = await db.orderTemplateSection.aggregate({
    where: { companyId, kind: k, target: t },
    _max: { sortOrder: true },
  });
  const next = (max._max.sortOrder ?? -1) + 1;
  const section = await db.orderTemplateSection.create({
    data: { companyId, kind: k, target: t, title, sortOrder: next },
    select: { id: true },
  });
  revalidatePath("/ustawienia/szablony-zamowien");
  return { ok: true as const, id: section.id };
}

export async function updateTemplateSectionAction(
  sectionId: string,
  patch: { title?: string; content?: string | null; target?: PdfTargetT },
) {
  await requireUser();
  await requireTemplateSectionInCompany(sectionId);
  const data: {
    title?: string;
    content?: string | null;
    target?: PdfTargetT;
  } = {};
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t) throw new Error("Tytuł nie może być pusty.");
    data.title = t;
  }
  if (patch.content !== undefined) {
    data.content = patch.content?.trim() ? patch.content : null;
  }
  if (patch.target !== undefined) data.target = targetSchema.parse(patch.target);
  if (Object.keys(data).length === 0) return { ok: true as const };
  await db.orderTemplateSection.update({
    where: { id: sectionId },
    data,
  });
  revalidatePath("/ustawienia/szablony-zamowien");
  return { ok: true as const };
}

export async function deleteTemplateSectionAction(sectionId: string) {
  await requireUser();
  await requireTemplateSectionInCompany(sectionId);
  const images = await db.orderTemplateSectionImage.findMany({
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
  await db.orderTemplateSection.delete({ where: { id: sectionId } });
  revalidatePath("/ustawienia/szablony-zamowien");
  return { ok: true as const };
}

export async function reorderTemplateSectionsAction(
  kind: PolandOrderKindT,
  target: PdfTargetT,
  ids: string[],
) {
  await requireUser();
  const companyId = await getCurrentCompanyId();
  const k = kindSchema.parse(kind);
  const t = targetSchema.parse(target);
  await db.$transaction(
    ids.map((id, idx) =>
      db.orderTemplateSection.updateMany({
        where: { id, companyId, kind: k, target: t },
        data: { sortOrder: idx },
      }),
    ),
  );
  revalidatePath("/ustawienia/szablony-zamowien");
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

export async function addTemplateSectionImageAction(
  sectionId: string,
  input: { dataUri: string; alt?: string | null },
) {
  await requireUser();
  const { companyId } = await requireTemplateSectionInCompany(sectionId);
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
    "order-templates",
    companyId,
  );
  await fs.mkdir(folder, { recursive: true });
  const filename = `${sectionId}-${Date.now()}.${ext}`;
  await fs.writeFile(path.join(folder, filename), buf);
  const url = `/uploads/order-templates/${companyId}/${filename}`;

  const max = await db.orderTemplateSectionImage.aggregate({
    where: { sectionId },
    _max: { sortOrder: true },
  });
  const next = (max._max.sortOrder ?? -1) + 1;
  const image = await db.orderTemplateSectionImage.create({
    data: {
      sectionId,
      url,
      alt: input.alt?.trim() || null,
      sortOrder: next,
    },
    select: { id: true, url: true },
  });
  revalidatePath("/ustawienia/szablony-zamowien");
  return { ok: true as const, id: image.id, url: image.url };
}

export async function removeTemplateSectionImageAction(imageId: string) {
  await requireUser();
  const companyId = await getCurrentCompanyId();
  const img = await db.orderTemplateSectionImage.findFirst({
    where: { id: imageId, section: { companyId } },
    select: { id: true, url: true },
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
  await db.orderTemplateSectionImage.delete({ where: { id: imageId } });
  revalidatePath("/ustawienia/szablony-zamowien");
  return { ok: true as const };
}

/**
 * Kopiuje wszystkie szablony danego kind (per-firma) na nowe sekcje zamówienia.
 * Pliki obrazków są DUPLIKOWANE na dysku — edycja szablonu nie wpływa na
 * już utworzone zamówienia. Wywoływane:
 *   • automatycznie z `createOrderAction` przy tworzeniu PL zamówienia
 *   • ręcznie przyciskiem „Pobierz z szablonu" w zakładce wytycznych
 *
 * @param replace  gdy true — usuwa wszystkie istniejące sekcje zamówienia
 *                 przed sklonowaniem (przydatne dla manualnego odświeżenia).
 */
export async function cloneTemplateSectionsToOrder(input: {
  orderId: string;
  companyId: string;
  kind: PolandOrderKindT;
  replace?: boolean;
}): Promise<{ created: number }> {
  const { orderId, companyId, kind, replace = false } = input;
  const templates = await db.orderTemplateSection.findMany({
    where: { companyId, kind },
    orderBy: { sortOrder: "asc" },
    include: { images: { orderBy: { sortOrder: "asc" } } },
  });
  if (templates.length === 0) return { created: 0 };

  if (replace) {
    const oldImages = await db.importOrderPdfSectionImage.findMany({
      where: { section: { orderId } },
      select: { url: true },
    });
    for (const img of oldImages) {
      if (img.url.startsWith("/uploads/")) {
        const filePath = path.join(
          process.cwd(),
          "public",
          img.url.replace(/^\//, ""),
        );
        await fs.unlink(filePath).catch(() => undefined);
      }
    }
    await db.importOrderPdfSection.deleteMany({ where: { orderId } });
  }

  const max = await db.importOrderPdfSection.aggregate({
    where: { orderId },
    _max: { sortOrder: true },
  });
  let nextOrder = (max._max.sortOrder ?? -1) + 1;

  for (const tpl of templates) {
    const sec = await db.importOrderPdfSection.create({
      data: {
        orderId,
        title: tpl.title,
        content: tpl.content,
        sortOrder: nextOrder++,
        target: tpl.target,
      },
      select: { id: true },
    });
    // Kopiowanie plików obrazków: src = uploads/order-templates/<companyId>/...
    // dst = uploads/order-pdf/<orderId>/<sectionId>-<n>.<ext>
    const dstFolder = path.join(
      process.cwd(),
      "public",
      "uploads",
      "order-pdf",
      orderId,
    );
    await fs.mkdir(dstFolder, { recursive: true });
    for (let i = 0; i < tpl.images.length; i++) {
      const img = tpl.images[i];
      if (!img.url.startsWith("/uploads/")) continue;
      const srcPath = path.join(
        process.cwd(),
        "public",
        img.url.replace(/^\//, ""),
      );
      const ext = path.extname(img.url) || ".png";
      const dstName = `${sec.id}-${Date.now()}-${i}${ext}`;
      const dstPath = path.join(dstFolder, dstName);
      try {
        await fs.copyFile(srcPath, dstPath);
      } catch {
        // pomijamy brakujące pliki — szablon mógł zostać zmodyfikowany ręcznie
        continue;
      }
      const dstUrl = `/uploads/order-pdf/${orderId}/${dstName}`;
      await db.importOrderPdfSectionImage.create({
        data: {
          sectionId: sec.id,
          url: dstUrl,
          alt: img.alt,
          sortOrder: i,
        },
      });
    }
  }
  return { created: templates.length };
}

/**
 * Ręczne wywołanie klonowania dla istniejącego zamówienia. Sprawdza, że
 * zamówienie należy do firmy usera. `replace` domyślnie false — szablony
 * dokleją się na koniec listy istniejących sekcji.
 */
export async function applyTemplateToOrderAction(
  orderId: string,
  options?: { replace?: boolean },
): Promise<{ ok: true; created: number }> {
  await requireUser();
  const companyId = await getCurrentCompanyId();
  const order = await db.importOrder.findFirst({
    where: { id: orderId, companyId },
    select: { id: true, country: true },
  });
  if (!order) throw new Error("Zamówienie nie istnieje.");
  if (order.country !== "POLAND") {
    throw new Error("Szablon dostępny tylko dla zamówień PL.");
  }
  const res = await cloneTemplateSectionsToOrder({
    orderId,
    companyId,
    kind: "MATERIAL_SZARFY",
    replace: options?.replace ?? false,
  });
  revalidatePath(`/zamowienia/${orderId}`);
  revalidatePath(`/zamowienia/z-polski/${orderId}`);
  return { ok: true as const, created: res.created };
}
