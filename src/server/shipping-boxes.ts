"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";
import { uploadFile, deleteFile } from "@/lib/storage";

async function requireUser() {
  const session = await auth();
  if (!session?.user) throw new Error("Brak autoryzacji");
  return session.user;
}

const numericOpt = z
  .union([z.string(), z.number()])
  .optional()
  .nullable()
  .transform((v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  });

const numeric = z
  .union([z.string(), z.number()])
  .transform((v) => {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) {
      throw new Error("Nieprawidłowa wartość liczbowa");
    }
    return n;
  });

const boxSchema = z.object({
  name: z.string().min(1, "Podaj nazwę"),
  internalCode: z.string().optional().nullable(),
  packagingType: z.enum(["BOX", "POLY_BAG"]).default("BOX"),
  origin: z.enum(["POLAND", "CHINA_STANDARD"]).default("POLAND"),
  /** Zbiorcze (master) = pudełko zawierające N inner kartonów. */
  isCollective: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => v === true || v === "true"),
  widthCm: numeric,
  heightCm: numeric,
  // POLY_BAG też ma głębokość (grubość) — kurier liczy gabaryt 3D
  depthCm: numeric,
  weightKg: numericOpt,
  // Liczba warstw kartonu (3/5/7); tylko dla BOX
  cardboardLayers: numericOpt,
  purchasePricePln: numericOpt,
  purposeText: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// ─── CRUD pudełek ────────────────────────────────────────────────────

export async function createShippingBoxAction(input: unknown) {
  await requireUser();
  const companyId = await getCurrentCompanyId();
  const data = boxSchema.parse(input);

  if (data.internalCode) {
    const conflict = await db.shippingBox.findFirst({
      where: { companyId, internalCode: data.internalCode },
      select: { id: true },
    });
    if (conflict)
      throw new Error(`Kod ${data.internalCode} już istnieje.`);
  }

  // Foliopak nigdy nie jest zbiorczy — taki produkt nie występuje
  const isCollective =
    data.packagingType === "POLY_BAG" ? false : data.isCollective ?? false;

  const created = await db.shippingBox.create({
    data: {
      companyId,
      name: data.name.trim(),
      internalCode: data.internalCode?.trim() || null,
      packagingType: data.packagingType,
      origin: data.origin,
      isCollective,
      widthCm: data.widthCm,
      heightCm: data.heightCm,
      depthCm: data.depthCm,
      weightKg: data.weightKg,
      cardboardLayers:
        data.packagingType === "POLY_BAG"
          ? null
          : data.cardboardLayers
            ? Math.trunc(data.cardboardLayers)
            : null,
      purchasePricePln: data.purchasePricePln,
      purposeText: data.purposeText?.trim() || null,
      notes: data.notes?.trim() || null,
    },
  });
  revalidatePath("/produkty/pudelka");
  return { ok: true as const, id: created.id };
}

export async function updateShippingBoxAction(id: string, input: unknown) {
  await requireUser();
  const data = boxSchema.parse(input);

  const existing = await db.shippingBox.findUnique({ where: { id } });
  if (!existing) throw new Error("Pudełko nie istnieje.");

  if (data.internalCode && data.internalCode !== existing.internalCode) {
    const conflict = await db.shippingBox.findFirst({
      where: { internalCode: data.internalCode },
      select: { id: true },
    });
    if (conflict)
      throw new Error(`Kod ${data.internalCode} już istnieje.`);
  }

  // Foliopak nigdy nie jest zbiorczy — taki produkt nie występuje
  const isCollective =
    data.packagingType === "POLY_BAG" ? false : data.isCollective ?? false;

  await db.shippingBox.update({
    where: { id },
    data: {
      name: data.name.trim(),
      internalCode: data.internalCode?.trim() || null,
      packagingType: data.packagingType,
      origin: data.origin,
      isCollective,
      widthCm: data.widthCm,
      heightCm: data.heightCm,
      depthCm: data.depthCm,
      weightKg: data.weightKg,
      cardboardLayers:
        data.packagingType === "POLY_BAG"
          ? null
          : data.cardboardLayers
            ? Math.trunc(data.cardboardLayers)
            : null,
      purchasePricePln: data.purchasePricePln,
      purposeText: data.purposeText?.trim() || null,
      notes: data.notes?.trim() || null,
    },
  });
  revalidatePath("/produkty/pudelka");
  return { ok: true as const };
}

export async function deleteShippingBoxAction(id: string) {
  await requireUser();
  const usage = await db.productShippingBox.count({ where: { boxId: id } });
  if (usage > 0) {
    throw new Error(
      `Pudełko jest używane w ${usage} produktach — najpierw odepnij je od produktów.`,
    );
  }
  await db.shippingBox.delete({ where: { id } });
  revalidatePath("/produkty/pudelka");
  return { ok: true as const };
}

export async function archiveShippingBoxAction(id: string, archived: boolean) {
  await requireUser();
  await db.shippingBox.update({ where: { id }, data: { archived } });
  revalidatePath("/produkty/pudelka");
  return { ok: true as const };
}

/**
 * Upload pliku z nadrukiem (PDF lub grafika) na konkretne pudełko.
 * Zastępuje poprzedni plik, jeśli istnieje.
 */
export async function uploadShippingBoxPrintAction(
  boxId: string,
  formData: FormData,
) {
  await requireUser();
  const box = await db.shippingBox.findUnique({
    where: { id: boxId },
    select: { id: true, printFileUrl: true },
  });
  if (!box) throw new Error("Pudełko nie istnieje.");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Brak pliku.");
  }

  const uploaded = await uploadFile(file, {
    folder: `shipping-boxes/${boxId}/print`,
  });

  if (box.printFileUrl) {
    await deleteFile(box.printFileUrl).catch(() => undefined);
  }

  await db.shippingBox.update({
    where: { id: boxId },
    data: {
      printFileUrl: uploaded.url,
      printFileName: file.name,
      printContentType: file.type || null,
    },
  });
  revalidatePath("/produkty/pudelka");
  return { ok: true as const, url: uploaded.url, name: file.name };
}

/**
 * Ustawia relację master → inner box dla kartonu zbiorczego z Chin.
 * Master karton zawiera N sztuk innego pudełka (inner). Stąd liczymy
 * ile sztuk produktu mieści się w masterze (przez factoryBox -> inner -> master).
 *
 * Wymagania:
 * - master musi być isCollective=true (CN_ZBIORCZE)
 * - innerBox musi NIE być isCollective (pojedyncze) i nie być masterem siebie
 */
const masterInnerSchema = z.object({
  innerBoxId: z.string().min(1, "Wybierz inner karton"),
  innerBoxesPerMaster: z
    .union([z.string(), z.number()])
    .transform((v) => {
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(n) || n < 1)
        throw new Error("Podaj liczbę sztuk inner (>=1)");
      return Math.trunc(n);
    }),
});

export async function setMasterInnerBoxAction(
  masterBoxId: string,
  input: unknown,
) {
  await requireUser();
  const data = masterInnerSchema.parse(input);

  const master = await db.shippingBox.findUnique({
    where: { id: masterBoxId },
    select: { id: true, isCollective: true, name: true },
  });
  if (!master) throw new Error("Master karton nie istnieje.");
  if (!master.isCollective)
    throw new Error("Inner box ustawia się tylko dla kartonów zbiorczych.");
  if (data.innerBoxId === masterBoxId)
    throw new Error("Master nie może być swoim własnym inner kartonem.");

  const inner = await db.shippingBox.findUnique({
    where: { id: data.innerBoxId },
    select: { id: true, isCollective: true, name: true },
  });
  if (!inner) throw new Error("Inner karton nie istnieje.");
  if (inner.isCollective)
    throw new Error(
      "Inner karton musi być pojedynczy — wybierz CN wysyłkowe, nie zbiorczy.",
    );

  await db.shippingBox.update({
    where: { id: masterBoxId },
    data: {
      innerBoxId: data.innerBoxId,
      innerBoxesPerMaster: data.innerBoxesPerMaster,
    },
  });
  revalidatePath("/produkty/pudelka");
  return { ok: true as const };
}

export async function clearMasterInnerBoxAction(masterBoxId: string) {
  await requireUser();
  await db.shippingBox.update({
    where: { id: masterBoxId },
    data: { innerBoxId: null, innerBoxesPerMaster: null },
  });
  revalidatePath("/produkty/pudelka");
  return { ok: true as const };
}

export async function removeShippingBoxPrintAction(boxId: string) {
  await requireUser();
  const box = await db.shippingBox.findUnique({
    where: { id: boxId },
    select: { printFileUrl: true },
  });
  if (box?.printFileUrl) {
    await deleteFile(box.printFileUrl).catch(() => undefined);
  }
  await db.shippingBox.update({
    where: { id: boxId },
    data: { printFileUrl: null, printFileName: null, printContentType: null },
  });
  revalidatePath("/produkty/pudelka");
  return { ok: true as const };
}

// ─── Przypisywanie pudełka do produktu ───────────────────────────────

const assignSchema = z.object({
  boxId: z.string().min(1, "Wybierz pudełko"),
  purpose: z.enum(["SHIPPING", "FACTORY"]).default("SHIPPING"),
  unitsPerBox: z.coerce.number().int().min(1, "Min. 1 szt."),
  isPrimary: z.boolean().optional(),
  notes: z.string().optional().nullable(),
});

export async function assignBoxToProductAction(
  productId: string,
  input: unknown,
) {
  await requireUser();
  const data = assignSchema.parse(input);

  // Kartonów zbiorczych nie pinujemy bezpośrednio do produktu — to relacja
  // master → inner box (patrz setMasterInnerBoxAction).
  const box = await db.shippingBox.findUnique({
    where: { id: data.boxId },
    select: { isCollective: true, origin: true },
  });
  if (box?.isCollective && box.origin === "CHINA_STANDARD") {
    throw new Error(
      "Karton zbiorczy z Chin nie może być przypięty bezpośrednio do produktu. Powiąż go z pudełkiem produktu (inner kartonem).",
    );
  }

  const existing = await db.productShippingBox.findUnique({
    where: { productId_boxId: { productId, boxId: data.boxId } },
  });
  if (existing) throw new Error("To pudełko jest już przypięte do produktu.");

  // Primary tylko w obrębie pudełek wysyłkowych — fabryczne nie mają primary
  if (data.isPrimary && data.purpose === "SHIPPING") {
    await db.productShippingBox.updateMany({
      where: { productId, purpose: "SHIPPING", isPrimary: true },
      data: { isPrimary: false },
    });
  }

  await db.productShippingBox.create({
    data: {
      productId,
      boxId: data.boxId,
      purpose: data.purpose,
      unitsPerBox: data.unitsPerBox,
      isPrimary: data.purpose === "SHIPPING" ? !!data.isPrimary : false,
      notes: data.notes?.trim() || null,
    },
  });
  revalidatePath(`/produkty/${productId}`);
  return { ok: true as const };
}

/**
 * Inline create + pin pudełka fabrycznego. Tworzy jednorazowy wpis w
 * katalogu ShippingBox (nazwa auto-gen z kodu produktu) i od razu pinuje
 * go z purpose=FACTORY. Używane przy "Przypnij z Chin" gdzie user wpisuje
 * własne wymiary zamiast wybierać z katalogu.
 */
const inlineFactorySchema = z.object({
  packagingType: z.enum(["BOX", "POLY_BAG"]).default("BOX"),
  widthCm: numeric,
  heightCm: numeric,
  depthCm: numeric,
  weightKg: numericOpt,
  cardboardLayers: numericOpt,
  unitsPerBox: z.coerce.number().int().min(1, "Min. 1 szt.").default(1),
  notes: z.string().optional().nullable(),
});

export async function assignFactoryBoxInlineAction(
  productId: string,
  input: unknown,
) {
  await requireUser();
  const data = inlineFactorySchema.parse(input);

  const product = await db.product.findUnique({
    where: { id: productId },
    select: { productCode: true, name: true },
  });
  if (!product) throw new Error("Produkt nie istnieje.");

  // Nazwa auto-gen — żeby dało się ją rozpoznać w katalogu jako one-off fabryczny
  const dims = `${data.widthCm}×${data.heightCm}×${data.depthCm}`;
  const typeLabel = data.packagingType === "POLY_BAG" ? "Foliopak" : "Pudełko";
  const autoName = `[FAB] ${typeLabel} ${product.productCode} ${dims}`;

  // Tworzymy katalog + pin w transakcji
  const result = await db.$transaction(async (tx) => {
    const created = await tx.shippingBox.create({
      data: {
        name: autoName,
        internalCode: null,
        packagingType: data.packagingType,
        widthCm: data.widthCm,
        heightCm: data.heightCm,
        depthCm: data.depthCm,
        weightKg: data.weightKg,
        cardboardLayers:
          data.packagingType === "POLY_BAG"
            ? null
            : data.cardboardLayers
              ? Math.trunc(data.cardboardLayers)
              : null,
        purchasePricePln: null,
        notes: `Auto-utworzone przy przypinaniu do produktu ${product.name}.`,
      },
    });
    await tx.productShippingBox.create({
      data: {
        productId,
        boxId: created.id,
        purpose: "FACTORY",
        unitsPerBox: data.unitsPerBox,
        isPrimary: false,
        notes: data.notes?.trim() || null,
      },
    });
    return created;
  });

  revalidatePath(`/produkty/${productId}`);
  revalidatePath("/produkty/pudelka");
  return { ok: true as const, boxId: result.id };
}

export async function updateProductBoxAction(
  linkId: string,
  patch: {
    unitsPerBox?: number | string;
    isPrimary?: boolean;
    notes?: string | null;
  },
) {
  await requireUser();
  const link = await db.productShippingBox.findUnique({
    where: { id: linkId },
    select: { id: true, productId: true },
  });
  if (!link) throw new Error("Powiązanie nie istnieje.");

  if (patch.isPrimary === true) {
    await db.productShippingBox.updateMany({
      where: { productId: link.productId, isPrimary: true, id: { not: linkId } },
      data: { isPrimary: false },
    });
  }

  const data: {
    unitsPerBox?: number;
    isPrimary?: boolean;
    notes?: string | null;
  } = {};
  if (patch.unitsPerBox !== undefined) {
    const n = Number(patch.unitsPerBox);
    if (Number.isFinite(n) && n >= 1) data.unitsPerBox = Math.trunc(n);
  }
  if (patch.isPrimary !== undefined) data.isPrimary = !!patch.isPrimary;
  if (patch.notes !== undefined) {
    data.notes =
      typeof patch.notes === "string" ? patch.notes.trim() || null : null;
  }

  await db.productShippingBox.update({ where: { id: linkId }, data });
  revalidatePath(`/produkty/${link.productId}`);
  return { ok: true as const };
}

export async function removeBoxFromProductAction(linkId: string) {
  await requireUser();
  const link = await db.productShippingBox.findUnique({
    where: { id: linkId },
    select: { id: true, productId: true, imageUrl: true, designUrl: true },
  });
  if (!link) return { ok: true as const };
  // Posprzątaj attachments z Vercel Blob
  if (link.imageUrl) await deleteFile(link.imageUrl).catch(() => undefined);
  if (link.designUrl) await deleteFile(link.designUrl).catch(() => undefined);
  await db.productShippingBox.delete({ where: { id: linkId } });
  revalidatePath(`/produkty/${link.productId}`);
  return { ok: true as const };
}

// ─── Per-pin attachments (zdjęcie + plik designu) ────────────────────

export async function uploadProductBoxImageAction(
  linkId: string,
  formData: FormData,
) {
  await requireUser();
  const link = await db.productShippingBox.findUnique({
    where: { id: linkId },
    select: { id: true, productId: true, imageUrl: true },
  });
  if (!link) throw new Error("Powiązanie nie istnieje.");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Brak pliku.");
  }
  if (!file.type.startsWith("image/")) {
    throw new Error("To nie jest grafika.");
  }

  const uploaded = await uploadFile(file, {
    folder: `products/${link.productId}/box-pins/${linkId}/image`,
  });

  if (link.imageUrl) await deleteFile(link.imageUrl).catch(() => undefined);

  await db.productShippingBox.update({
    where: { id: linkId },
    data: { imageUrl: uploaded.url, imageAlt: file.name },
  });
  revalidatePath(`/produkty/${link.productId}`);
  return { ok: true as const };
}

export async function removeProductBoxImageAction(linkId: string) {
  await requireUser();
  const link = await db.productShippingBox.findUnique({
    where: { id: linkId },
    select: { productId: true, imageUrl: true },
  });
  if (link?.imageUrl) await deleteFile(link.imageUrl).catch(() => undefined);
  if (link) {
    await db.productShippingBox.update({
      where: { id: linkId },
      data: { imageUrl: null, imageAlt: null },
    });
    revalidatePath(`/produkty/${link.productId}`);
  }
  return { ok: true as const };
}

export async function uploadProductBoxDesignAction(
  linkId: string,
  formData: FormData,
) {
  await requireUser();
  const link = await db.productShippingBox.findUnique({
    where: { id: linkId },
    select: { id: true, productId: true, designUrl: true },
  });
  if (!link) throw new Error("Powiązanie nie istnieje.");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Brak pliku.");
  }

  const uploaded = await uploadFile(file, {
    folder: `products/${link.productId}/box-pins/${linkId}/design`,
  });

  if (link.designUrl) await deleteFile(link.designUrl).catch(() => undefined);

  await db.productShippingBox.update({
    where: { id: linkId },
    data: { designUrl: uploaded.url, designName: file.name },
  });
  revalidatePath(`/produkty/${link.productId}`);
  return { ok: true as const };
}

export async function removeProductBoxDesignAction(linkId: string) {
  await requireUser();
  const link = await db.productShippingBox.findUnique({
    where: { id: linkId },
    select: { productId: true, designUrl: true },
  });
  if (link?.designUrl) await deleteFile(link.designUrl).catch(() => undefined);
  if (link) {
    await db.productShippingBox.update({
      where: { id: linkId },
      data: { designUrl: null, designName: null },
    });
    revalidatePath(`/produkty/${link.productId}`);
  }
  return { ok: true as const };
}

// ─── AUTO-PRZYPISANIA ───────────────────────────────────────────────
// Reguły „pudełko X jest auto-pinowane do kategorii Y / produktu Z".
// Tworzenie reguły → bulk-upsert ProductShippingBox dla wszystkich
// pasujących produktów (z dziedziczeniem kategorii — reguła dla głównej
// łapie też podkategorie i typy).

const ruleSchema = z.object({
  boxId: z.string().min(1),
  purpose: z.enum(["SHIPPING", "FACTORY"]).default("SHIPPING"),
  unitsPerBox: z
    .union([z.number(), z.string()])
    .transform((v) => {
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) && n > 0 ? Math.round(n) : 1;
    })
    .default(1),
  isPrimary: z.boolean().default(false),
});

const categoryRuleSchema = ruleSchema.extend({
  categoryId: z.string().min(1, "Wybierz kategorię"),
});

const productRuleSchema = ruleSchema.extend({
  productId: z.string().min(1, "Wybierz produkt"),
});

/**
 * Rekurencyjnie wyznacza ID kategorii potomnych (włącznie z rootem).
 * Reguła na kategorii głównej obejmuje też wszystkie podkategorie / typy.
 */
async function getDescendantCategoryIds(rootId: string): Promise<string[]> {
  const all: string[] = [];
  let frontier = [rootId];
  while (frontier.length > 0) {
    all.push(...frontier);
    const children = await db.category.findMany({
      where: { parentId: { in: frontier } },
      select: { id: true },
    });
    frontier = children.map((c) => c.id);
  }
  return all;
}

/**
 * Bulk-pinowanie pudełka do listy produktów. Tworzy ProductShippingBox
 * tylko gdy nie istnieje (skipDuplicates) — manualne piny zachowywane.
 * Zwraca liczbę faktycznie utworzonych pinów.
 */
async function bulkPinBox(args: {
  boxId: string;
  productIds: string[];
  purpose: "SHIPPING" | "FACTORY";
  unitsPerBox: number;
  isPrimary: boolean;
}): Promise<number> {
  if (args.productIds.length === 0) return 0;
  const result = await db.productShippingBox.createMany({
    data: args.productIds.map((productId) => ({
      productId,
      boxId: args.boxId,
      purpose: args.purpose,
      unitsPerBox: args.unitsPerBox,
      isPrimary: args.isPrimary,
      autoFromRule: true,
    })),
    skipDuplicates: true,
  });
  return result.count;
}

/** Tworzy regułę kategoryjną + bulk-pin wszystkich pasujących produktów. */
export async function createBoxCategoryRuleAction(input: unknown) {
  await requireUser();
  const data = categoryRuleSchema.parse(input);

  // Kartonów zbiorczych z Chin nie da się przypisać do kategorii — relacja
  // master → inner box jest zdefiniowana na poziomie samego pudełka.
  const box = await db.shippingBox.findUnique({
    where: { id: data.boxId },
    select: { isCollective: true, origin: true },
  });
  if (box?.isCollective && box.origin === "CHINA_STANDARD") {
    throw new Error(
      "Karton zbiorczy z Chin nie może być przypisany do kategorii. Powiąż go z pudełkiem produktu (inner kartonem).",
    );
  }

  // Reguła (idempotentnie po unique [boxId, categoryId, purpose]).
  const existing = await db.shippingBoxCategoryRule.findUnique({
    where: {
      boxId_categoryId_purpose: {
        boxId: data.boxId,
        categoryId: data.categoryId,
        purpose: data.purpose,
      },
    },
    select: { id: true },
  });
  if (existing) {
    await db.shippingBoxCategoryRule.update({
      where: { id: existing.id },
      data: {
        unitsPerBox: data.unitsPerBox,
        isPrimary: data.isPrimary,
      },
    });
  } else {
    await db.shippingBoxCategoryRule.create({
      data: {
        boxId: data.boxId,
        categoryId: data.categoryId,
        purpose: data.purpose,
        unitsPerBox: data.unitsPerBox,
        isPrimary: data.isPrimary,
      },
    });
  }

  // Pinuj do wszystkich produktów w kategorii + jej potomkach.
  const categoryIds = await getDescendantCategoryIds(data.categoryId);
  const products = await db.product.findMany({
    where: { categoryId: { in: categoryIds }, archived: false },
    select: { id: true },
  });
  const pinned = await bulkPinBox({
    boxId: data.boxId,
    productIds: products.map((p) => p.id),
    purpose: data.purpose,
    unitsPerBox: data.unitsPerBox,
    isPrimary: data.isPrimary,
  });

  revalidatePath("/produkty/pudelka");
  revalidatePath("/produkty");
  return { ok: true as const, pinned };
}

/** Tworzy regułę dla konkretnego produktu + od razu pinuje pudełko. */
export async function createBoxProductRuleAction(input: unknown) {
  await requireUser();
  const data = productRuleSchema.parse(input);

  // Kartonów zbiorczych z Chin nie pinujemy bezpośrednio do produktu.
  const box = await db.shippingBox.findUnique({
    where: { id: data.boxId },
    select: { isCollective: true, origin: true },
  });
  if (box?.isCollective && box.origin === "CHINA_STANDARD") {
    throw new Error(
      "Karton zbiorczy z Chin nie może być przypisany do produktu. Powiąż go z pudełkiem produktu (inner kartonem).",
    );
  }

  const existing = await db.shippingBoxProductRule.findUnique({
    where: {
      boxId_productId_purpose: {
        boxId: data.boxId,
        productId: data.productId,
        purpose: data.purpose,
      },
    },
    select: { id: true },
  });
  if (existing) {
    await db.shippingBoxProductRule.update({
      where: { id: existing.id },
      data: {
        unitsPerBox: data.unitsPerBox,
        isPrimary: data.isPrimary,
      },
    });
  } else {
    await db.shippingBoxProductRule.create({
      data: {
        boxId: data.boxId,
        productId: data.productId,
        purpose: data.purpose,
        unitsPerBox: data.unitsPerBox,
        isPrimary: data.isPrimary,
      },
    });
  }

  const pinned = await bulkPinBox({
    boxId: data.boxId,
    productIds: [data.productId],
    purpose: data.purpose,
    unitsPerBox: data.unitsPerBox,
    isPrimary: data.isPrimary,
  });

  revalidatePath("/produkty/pudelka");
  revalidatePath(`/produkty/${data.productId}`);
  return { ok: true as const, pinned };
}

/**
 * Usuwa regułę kategoryjną. Auto-piny zachowywane (są niezależne
 * po utworzeniu) — user usuwa je manualnie z karty produktu.
 */
export async function deleteBoxCategoryRuleAction(ruleId: string) {
  await requireUser();
  await db.shippingBoxCategoryRule
    .delete({ where: { id: ruleId } })
    .catch(() => undefined);
  revalidatePath("/produkty/pudelka");
  return { ok: true as const };
}

/** Usuwa regułę produktową (auto-pin zachowywany — patrz wyżej). */
export async function deleteBoxProductRuleAction(ruleId: string) {
  await requireUser();
  await db.shippingBoxProductRule
    .delete({ where: { id: ruleId } })
    .catch(() => undefined);
  revalidatePath("/produkty/pudelka");
  return { ok: true as const };
}

/**
 * Hook wywoływany przy tworzeniu nowego produktu — sprawdza reguły dla
 * kategorii produktu (z dziedziczeniem od rodziców) i tworzy auto-piny.
 *
 * Wywoływany z `createProductAction` (po wstawieniu produktu).
 */
export async function applyBoxRulesToNewProduct(productId: string): Promise<{
  pinned: number;
}> {
  const product = await db.product.findUnique({
    where: { id: productId },
    select: { id: true, categoryId: true },
  });
  if (!product?.categoryId) return { pinned: 0 };

  // Wyznacz wszystkie przodków kategorii (kategoria + rodzice).
  const ancestors: string[] = [];
  let currentId: string | null = product.categoryId;
  while (currentId) {
    ancestors.push(currentId);
    const parent: { parentId: string | null } | null =
      await db.category.findUnique({
        where: { id: currentId },
        select: { parentId: true },
      });
    currentId = parent?.parentId ?? null;
  }

  // Wszystkie reguły kategoryjne pasujące do produktu + reguły produktowe.
  const [categoryRules, productRules] = await Promise.all([
    db.shippingBoxCategoryRule.findMany({
      where: { categoryId: { in: ancestors } },
    }),
    db.shippingBoxProductRule.findMany({
      where: { productId: product.id },
    }),
  ]);

  let pinned = 0;
  for (const rule of categoryRules) {
    pinned += await bulkPinBox({
      boxId: rule.boxId,
      productIds: [product.id],
      purpose: rule.purpose,
      unitsPerBox: rule.unitsPerBox,
      isPrimary: rule.isPrimary,
    });
  }
  for (const rule of productRules) {
    pinned += await bulkPinBox({
      boxId: rule.boxId,
      productIds: [product.id],
      purpose: rule.purpose,
      unitsPerBox: rule.unitsPerBox,
      isPrimary: rule.isPrimary,
    });
  }
  return { pinned };
}
