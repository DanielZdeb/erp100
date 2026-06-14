"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { cbmFromBox, cbmFromBulk, cbmFromMasterBox } from "@/lib/kalkulacje";

/**
 * Server action dla widoku "Kontrola produktowa" — szybki patch pojedynczego
 * pola produktu z auto-save na blur. Akceptuje wąski zestaw pól które są
 * edytowalne z poziomu tabeli kontroli.
 *
 * Po każdej zmianie kartonu importowego / unitsPerBox / unitsPerContainer
 * przelicza `cbmPerUnit` (analogicznie do createProductAction), żeby kalkulacje
 * kontenera nie wisiały na zerze gdy ktoś tylko poprawi wymiary kartonu.
 */

async function requireUser() {
  const session = await auth();
  if (!session?.user) throw new Error("Brak autoryzacji");
  return session.user;
}

// WAŻNE: transforms zwracają `undefined` gdy klucz nie był obecny w input —
// żeby logika dalej (`if (v === undefined) continue`) wiedziała "user tego
// nie ruszał, nie nadpisuj". Wcześniej transformy konwertowały undefined → null
// i nadpisywały wszystkie pola które nie były wysłane (kasowanie categoryId itp.)
const optionalNumber = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined;
    if (v === null || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  });

const optionalInt = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined;
    if (v === null || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  });

const optionalString = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined;
    if (v === null) return null;
    const t = v.trim();
    return t || null;
  });

const patchSchema = z.object({
  // Podstawowe
  name: z.string().min(1, "Nazwa wymagana").optional(),
  productCode: z.string().min(1, "SKU wymagane").optional(),
  categoryId: optionalString,
  eanCode: optionalString,
  code128: optionalString,
  color: optionalString,
  widthCm: optionalNumber,
  heightCm: optionalNumber,
  depthCm: optionalNumber,
  weightKg: optionalNumber,

  // Pakowanie wysyłkowe
  shippingBoxWidthCm: optionalNumber,
  shippingBoxHeightCm: optionalNumber,
  shippingBoxDepthCm: optionalNumber,
  shippingBoxWeightKg: optionalNumber,
  unitsPerShippingBox: optionalInt,

  // Import
  importMode: z.enum(["KARTON", "LUZEM"]).optional(),
  boxWidthCm: optionalNumber,
  boxHeightCm: optionalNumber,
  boxDepthCm: optionalNumber,
  boxWeightKg: optionalNumber,
  unitsPerBox: optionalInt,
  masterBoxWidthCm: optionalNumber,
  masterBoxHeightCm: optionalNumber,
  masterBoxDepthCm: optionalNumber,
  masterBoxWeightKg: optionalNumber,
  innerBoxesPerMaster: optionalInt,
  unitsPerContainer: optionalInt,
  referenceContainerM3: optionalNumber,
  /** % w UI 0..100, konwertujemy na 0..1 przy zapisie. */
  customsDutyPct: optionalNumber,

  // Parametry / opis
  shortDescription: optionalString,
  shopDescription: optionalString,
  vatRatePct: optionalNumber,
  warrantyMonths: optionalInt,
  warrantyType: optionalString,
  producer: optionalString,
  loadCapacityKg: optionalInt,
});

export type AuditField = keyof z.input<typeof patchSchema>;

export async function updateProductAuditFieldAction(
  productId: string,
  input: unknown,
) {
  await requireUser();
  const data = patchSchema.parse(input);

  const existing = await db.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      importMode: true,
      boxWidthCm: true,
      boxHeightCm: true,
      boxDepthCm: true,
      unitsPerBox: true,
      masterBoxWidthCm: true,
      masterBoxHeightCm: true,
      masterBoxDepthCm: true,
      innerBoxesPerMaster: true,
      referenceContainerM3: true,
      unitsPerContainer: true,
    },
  });
  if (!existing) throw new Error("Produkt nie istnieje.");

  // Zbierz pola które zostały dostarczone w patch (filtrujemy undefined żeby
  // nie zerować pól których user nie ruszał).
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    // customsDutyPct: UI % → DB ułamek
    if (k === "customsDutyPct") {
      patch[k] = typeof v === "number" ? v / 100 : null;
    } else {
      patch[k] = v;
    }
  }

  // Auto-recalc cbmPerUnit gdy zmieniła się dowolna składowa wymiarów importu.
  // Master karton ma priorytet — bo uwzględnia realną gęstość pakowania
  // (np. zbiorczy 1 m³ z 30 sztukami → 0.033 m³/szt, NIE sum(inner) ÷ unit).
  const recalcKeys = new Set([
    "importMode",
    "boxWidthCm",
    "boxHeightCm",
    "boxDepthCm",
    "unitsPerBox",
    "masterBoxWidthCm",
    "masterBoxHeightCm",
    "masterBoxDepthCm",
    "innerBoxesPerMaster",
    "referenceContainerM3",
    "unitsPerContainer",
  ]);
  const shouldRecalcCbm = Object.keys(patch).some((k) => recalcKeys.has(k));
  if (shouldRecalcCbm) {
    const merged = {
      importMode: (patch.importMode as "KARTON" | "LUZEM" | undefined) ??
        existing.importMode,
      boxWidthCm: (patch.boxWidthCm as number | null | undefined) ??
        existing.boxWidthCm,
      boxHeightCm: (patch.boxHeightCm as number | null | undefined) ??
        existing.boxHeightCm,
      boxDepthCm: (patch.boxDepthCm as number | null | undefined) ??
        existing.boxDepthCm,
      unitsPerBox: (patch.unitsPerBox as number | null | undefined) ??
        existing.unitsPerBox,
      masterBoxWidthCm:
        (patch.masterBoxWidthCm as number | null | undefined) ??
        existing.masterBoxWidthCm,
      masterBoxHeightCm:
        (patch.masterBoxHeightCm as number | null | undefined) ??
        existing.masterBoxHeightCm,
      masterBoxDepthCm:
        (patch.masterBoxDepthCm as number | null | undefined) ??
        existing.masterBoxDepthCm,
      innerBoxesPerMaster:
        (patch.innerBoxesPerMaster as number | null | undefined) ??
        existing.innerBoxesPerMaster,
      referenceContainerM3:
        (patch.referenceContainerM3 as number | null | undefined) ??
        existing.referenceContainerM3,
      unitsPerContainer:
        (patch.unitsPerContainer as number | null | undefined) ??
        existing.unitsPerContainer,
    };
    if (merged.importMode === "KARTON") {
      // Priorytet: master jeśli wszystkie składowe są ustawione, fallback do inner.
      const fromMaster = cbmFromMasterBox(
        merged.masterBoxWidthCm,
        merged.masterBoxHeightCm,
        merged.masterBoxDepthCm,
        merged.innerBoxesPerMaster,
        merged.unitsPerBox,
      );
      patch.cbmPerUnit =
        fromMaster ??
        cbmFromBox(
          merged.boxWidthCm,
          merged.boxHeightCm,
          merged.boxDepthCm,
          merged.unitsPerBox,
        );
    } else {
      patch.cbmPerUnit = cbmFromBulk(
        merged.referenceContainerM3,
        merged.unitsPerContainer,
      );
    }
  }

  await db.product.update({
    where: { id: productId },
    data: patch,
  });

  revalidatePath("/produkty/kontrola");
  revalidatePath("/produkty");
  return { ok: true as const };
}

/**
 * Ustawia primary karton wysyłkowy produktu z biblioteki ShippingBox.
 *  - boxId=null → usuwa istniejący primary SHIPPING pin + czyści Product.shippingBox*Cm
 *  - boxId=string → pinuje karton jako primary SHIPPING, synchronizuje wymiary
 *    na Product (legacy fields), zachowuje istniejące unitsPerBox lub default 1
 */
const setShippingBoxSchema = z.object({
  boxId: z.string().nullable(),
});

export async function setAuditShippingBoxAction(
  productId: string,
  input: unknown,
) {
  await requireUser();
  const { boxId } = setShippingBoxSchema.parse(input);

  const existing = await db.productShippingBox.findFirst({
    where: { productId, purpose: "SHIPPING", isPrimary: true },
    select: { id: true, unitsPerBox: true, boxId: true },
  });

  if (boxId == null) {
    if (existing) {
      await db.productShippingBox.delete({ where: { id: existing.id } });
    }
    await db.product.update({
      where: { id: productId },
      data: {
        shippingBoxWidthCm: null,
        shippingBoxHeightCm: null,
        shippingBoxDepthCm: null,
        shippingBoxWeightKg: null,
        unitsPerShippingBox: null,
      },
    });
    revalidatePath("/produkty/kontrola");
    revalidatePath(`/produkty/${productId}`);
    return { ok: true as const };
  }

  const box = await db.shippingBox.findUnique({
    where: { id: boxId },
    select: {
      isCollective: true,
      origin: true,
      widthCm: true,
      heightCm: true,
      depthCm: true,
      weightKg: true,
    },
  });
  if (!box) throw new Error("Karton nie istnieje.");
  if (box.isCollective && box.origin === "CHINA_STANDARD") {
    throw new Error(
      "Karton zbiorczy z Chin nie może być przypięty jako wysyłkowy.",
    );
  }

  const unitsToKeep = existing?.unitsPerBox ?? 1;

  if (existing) {
    // Zwolnij conflict na productId_boxId jeśli userpodmienił karton
    if (existing.boxId !== boxId) {
      await db.productShippingBox.deleteMany({
        where: {
          productId,
          boxId,
        },
      });
    }
    await db.productShippingBox.update({
      where: { id: existing.id },
      data: { boxId, unitsPerBox: unitsToKeep, isPrimary: true },
    });
  } else {
    // Odznacz inne primary (defensive — nie powinno być, skoro findFirst zwrócił null)
    await db.productShippingBox.updateMany({
      where: { productId, purpose: "SHIPPING", isPrimary: true },
      data: { isPrimary: false },
    });
    await db.productShippingBox.upsert({
      where: { productId_boxId: { productId, boxId } },
      update: { purpose: "SHIPPING", isPrimary: true, unitsPerBox: unitsToKeep },
      create: {
        productId,
        boxId,
        purpose: "SHIPPING",
        isPrimary: true,
        unitsPerBox: unitsToKeep,
      },
    });
  }

  // Sync legacy Product.shippingBox*Cm — pakowanie wysyłkowe = wymiary kartonu
  await db.product.update({
    where: { id: productId },
    data: {
      shippingBoxWidthCm: box.widthCm,
      shippingBoxHeightCm: box.heightCm,
      shippingBoxDepthCm: box.depthCm,
      shippingBoxWeightKg: box.weightKg,
      unitsPerShippingBox: unitsToKeep,
    },
  });

  revalidatePath("/produkty/kontrola");
  revalidatePath(`/produkty/${productId}`);
  return { ok: true as const };
}

/**
 * Przypisuje karton z Chin jako FACTORY (importowy) box dla produktu.
 * Używane w trybie „Ten sam co importowy" w dialogu Edytuj pakowanie —
 * usuwa istniejący FACTORY pin, kasuje SHIPPING pin (skoro „ten sam"),
 * tworzy nowy FACTORY pin z wybranym kartonem.
 *
 * Walidacja:
 *  - box musi istnieć
 *  - musi mieć origin=CHINA_STANDARD (tryb dotyczy chińskich kartonów)
 *  - nie może być zbiorczy (master karton)
 */
const setFactoryBoxSchema = z.object({
  boxId: z.string().min(1),
  unitsPerBox: z
    .union([z.number(), z.string()])
    .optional()
    .nullable()
    .transform((v) => {
      if (v == null || v === "") return 1;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) && n >= 1 ? Math.trunc(n) : 1;
    }),
});

export async function setAuditFactoryBoxAction(
  productId: string,
  input: unknown,
) {
  await requireUser();
  const { boxId, unitsPerBox } = setFactoryBoxSchema.parse(input);

  const box = await db.shippingBox.findUnique({
    where: { id: boxId },
    select: { isCollective: true, origin: true },
  });
  if (!box) throw new Error("Karton nie istnieje.");
  if (box.isCollective) {
    throw new Error(
      "Karton zbiorczy nie może być przypięty jako FACTORY do produktu.",
    );
  }

  // Usuń stary FACTORY pin (inny boxId)
  await db.productShippingBox.deleteMany({
    where: {
      productId,
      purpose: "FACTORY",
      boxId: { not: boxId },
    },
  });

  // Usuń SHIPPING pin — tryb „Ten sam co importowy" znaczy że SHIPPING jest
  // dziedziczone z FACTORY przez inferred logic.
  await db.productShippingBox.deleteMany({
    where: { productId, purpose: "SHIPPING" },
  });

  // Upsert FACTORY pin dla wybranego boxa
  await db.productShippingBox.upsert({
    where: { productId_boxId: { productId, boxId } },
    update: { purpose: "FACTORY", unitsPerBox, isPrimary: false },
    create: {
      productId,
      boxId,
      purpose: "FACTORY",
      unitsPerBox,
      isPrimary: false,
    },
  });

  revalidatePath("/produkty/kontrola");
  revalidatePath(`/produkty/${productId}`);
  return { ok: true as const };
}

/**
 * Ustawia liczbę sztuk produktu w przypiętym primary kartonie wysyłkowym.
 * Synchronizuje też Product.unitsPerShippingBox (legacy field).
 * Wymaga aby produkt miał przypięty primary SHIPPING box.
 */
const setUnitsSchema = z.object({
  unitsPerBox: z.union([z.number(), z.string()]).transform((v) => {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n) || n < 1) {
      throw new Error("Liczba sztuk musi być >= 1");
    }
    return Math.trunc(n);
  }),
});

export async function setAuditShippingUnitsAction(
  productId: string,
  input: unknown,
) {
  await requireUser();
  const { unitsPerBox } = setUnitsSchema.parse(input);

  const existing = await db.productShippingBox.findFirst({
    where: { productId, purpose: "SHIPPING", isPrimary: true },
    select: { id: true },
  });
  if (!existing) {
    throw new Error("Najpierw przypisz karton, potem ustaw liczbę sztuk.");
  }

  await db.productShippingBox.update({
    where: { id: existing.id },
    data: { unitsPerBox },
  });
  await db.product.update({
    where: { id: productId },
    data: { unitsPerShippingBox: unitsPerBox },
  });

  revalidatePath("/produkty/kontrola");
  revalidatePath(`/produkty/${productId}`);
  return { ok: true as const };
}
