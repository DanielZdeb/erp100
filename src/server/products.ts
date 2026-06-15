"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";
import { ensureComponentLinksForProduct } from "@/lib/component-rules";
import { cbmFromBox, cbmFromBulk, cbmFromMasterBox } from "@/lib/kalkulacje";
import { applyBoxRulesToNewProduct } from "@/server/shipping-boxes";

const optionalNumber = z
  .union([z.number(), z.string()])
  .nullable()
  .optional()
  .transform((v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  });

const optionalInt = z
  .union([z.number(), z.string()])
  .nullable()
  .optional()
  .transform((v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  });

const optionalString = z
  .string()
  .nullable()
  .optional()
  .transform((v) => {
    if (!v) return null;
    const trimmed = v.trim();
    return trimmed || null;
  });

const productSchema = z.object({
  name: z.string().min(1, "Podaj nazwę"),
  productCode: z.string().min(1, "Podaj kod produktu"),
  eanCode: optionalString,
  code128: optionalString,
  categoryId: optionalString,
  status: z.enum(["PLANOWANY", "IMPORTOWANY", "AKTYWNY"]).optional(),
  importMode: z.enum(["KARTON", "LUZEM"]).optional(),
  compositionMode: z.enum(["CALOSCIOWY", "KOMPONENTOWY"]).optional(),
  /** Wymagana liczba komponentów dla skompletowania produktu KOMPONENTOWEGO. */
  requiredComponentsTotal: optionalInt,
  color: optionalString,

  widthCm: optionalNumber,
  heightCm: optionalNumber,
  depthCm: optionalNumber,
  weightKg: optionalNumber,

  // Karton importowy (INNER — bezpośrednio okrywa produkt)
  boxWidthCm: optionalNumber,
  boxHeightCm: optionalNumber,
  boxDepthCm: optionalNumber,
  boxWeightKg: optionalNumber,
  unitsPerBox: optionalInt,

  // MASTER karton (opcjonalny — zewnętrzne pudło, mieści N inner kartonów)
  masterBoxWidthCm: optionalNumber,
  masterBoxHeightCm: optionalNumber,
  masterBoxDepthCm: optionalNumber,
  masterBoxWeightKg: optionalNumber,
  innerBoxesPerMaster: optionalInt,

  // Tryb LUZEM
  unitsPerContainer: optionalInt,
  referenceContainerM3: optionalNumber,

  // Pudło wysyłkowe
  shippingBoxWidthCm: optionalNumber,
  shippingBoxHeightCm: optionalNumber,
  shippingBoxDepthCm: optionalNumber,
  shippingBoxWeightKg: optionalNumber,
  unitsPerShippingBox: optionalInt,
  unitsPerPallet: optionalInt,

  cbmPerUnit: optionalNumber,

  /** Stawka cła w % (0..100) — UI; konwertujemy na 0..1 przy zapisie. */
  customsDutyPct: optionalNumber,

  isComponent: z
    .union([z.string(), z.boolean()])
    .optional()
    .transform((v) => (v === true || v === "true" ? true : false)),

  defaultUnitPriceUsd: optionalNumber,
  defaultUnitPriceCny: optionalNumber,
  defaultUnitPricePln: optionalNumber,
  defaultPricePerMeterPln: optionalNumber,
  lengthM: optionalNumber,
  defaultSalePriceAllegroPln: optionalNumber,
  defaultSalePriceSklepPln: optionalNumber,
  // procent UI 0..100, konwertujemy na 0..1 przy zapisie
  defaultAllegroCommissionPct: optionalNumber,

  importGuidelines: optionalString,
  productionGuidelines: optionalString,
  userManual: optionalString,
  shopDescription: optionalString,
  internalNotes: optionalString,
}).superRefine((data, ctx) => {
  // Walidacja zależna od trybu importu: dla KARTON wymagane wymiary kartonu
  // + sztuk w kartonie (te dane = pudełko wysyłkowe + CBM). Dla LUZEM
  // wymagane unitsPerContainer (tylko z tego liczymy CBM/szt).
  const mode = data.importMode ?? "KARTON";
  if (mode === "KARTON") {
    const missing: string[] = [];
    if (data.boxWidthCm == null || data.boxWidthCm <= 0)
      missing.push("szerokość kartonu");
    if (data.boxHeightCm == null || data.boxHeightCm <= 0)
      missing.push("wysokość kartonu");
    if (data.boxDepthCm == null || data.boxDepthCm <= 0)
      missing.push("głębokość kartonu");
    if (data.boxWeightKg == null || data.boxWeightKg <= 0)
      missing.push("waga kartonu");
    if (data.unitsPerBox == null || data.unitsPerBox <= 0)
      missing.push("sztuk w kartonie");
    if (missing.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Tryb 'W kartonach' wymaga: ${missing.join(", ")}.`,
      });
    }
  } else if (mode === "LUZEM") {
    // Tryb LUZEM — pola opcjonalne. Brak ich oznacza że cbmPerUnit zostanie
    // null i user uzupełni dane przy edycji importu (lub przy dodawaniu do
    // zamówienia). Wcześniej blokowało tworzenie produktu na pustych polach,
    // co wkurzało przy szybkim tworzeniu produktu bez znania CBM/szt.
  }
  // Karton zbiorczy: jeśli podany cokolwiek z (wymiary lub innerPerMaster),
  // wymagamy KOMPLETU wymiarów + innerBoxesPerMaster > 0. Waga jest opcjonalna —
  // master karton wybierany z biblioteki (InlineBoxPicker) nie wymaga wagi do
  // kalkulacji CBM; user może ją wpisać ręcznie albo pominąć.
  const anyMasterField =
    data.masterBoxWidthCm != null ||
    data.masterBoxHeightCm != null ||
    data.masterBoxDepthCm != null ||
    data.masterBoxWeightKg != null ||
    data.innerBoxesPerMaster != null;
  if (anyMasterField) {
    const missing: string[] = [];
    if (!data.masterBoxWidthCm || data.masterBoxWidthCm <= 0)
      missing.push("szerokość zbiorczego");
    if (!data.masterBoxHeightCm || data.masterBoxHeightCm <= 0)
      missing.push("wysokość zbiorczego");
    if (!data.masterBoxDepthCm || data.masterBoxDepthCm <= 0)
      missing.push("głębokość zbiorczego");
    if (!data.innerBoxesPerMaster || data.innerBoxesPerMaster <= 0)
      missing.push("liczba prod. kartonów w zbiorczym");
    if (missing.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Karton zbiorczy wymaga kompletu danych. Brakuje: ${missing.join(", ")}.`,
      });
    }
  }
  // Produkt KOMPONENTOWY wymaga liczby komponentów do skompletowania
  if (data.compositionMode === "KOMPONENTOWY") {
    if (
      data.requiredComponentsTotal == null ||
      data.requiredComponentsTotal <= 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Produkt komponentowy wymaga liczby komponentów do skompletowania (>0).",
      });
    }
  }
});

async function requireUser() {
  const session = await auth();
  if (!session?.user) throw new Error("Brak autoryzacji");
  return session.user;
}

/**
 * Jeśli user nie wpisał `cbmPerUnit` ręcznie, ale wypełnił wymiary kartonu
 * (KARTON) lub kontener referencyjny (LUZEM), licz i zapisz auto. Bez tego
 * placeholder „auto: X.XXXX" na formularzu wprowadzał w błąd — produkt
 * trafiał do bazy z `cbmPerUnit = null` i kalkulacje pakowania kontenera
 * leciały na 0.
 */
function resolveCbmPerUnit(
  data: z.infer<typeof productSchema>,
): number | null {
  if (data.cbmPerUnit != null) return data.cbmPerUnit;
  if ((data.importMode ?? "KARTON") === "KARTON") {
    // Hierarchia: jeśli master karton jest podany, liczymy z niego (bardziej
    // precyzyjne — master ma realne packing density).
    if (
      data.masterBoxWidthCm &&
      data.masterBoxHeightCm &&
      data.masterBoxDepthCm &&
      data.innerBoxesPerMaster &&
      data.unitsPerBox
    ) {
      return cbmFromMasterBox(
        data.masterBoxWidthCm,
        data.masterBoxHeightCm,
        data.masterBoxDepthCm,
        data.innerBoxesPerMaster,
        data.unitsPerBox,
      );
    }
    return cbmFromBox(
      data.boxWidthCm,
      data.boxHeightCm,
      data.boxDepthCm,
      data.unitsPerBox,
    );
  }
  return cbmFromBulk(data.referenceContainerM3, data.unitsPerContainer);
}

export async function createProductAction(input: unknown) {
  await requireUser();
  const companyId = await getCurrentCompanyId();
  const data = productSchema.parse(input);

  const existing = await db.product.findFirst({
    where: { companyId, productCode: data.productCode },
  });
  if (existing) {
    throw new Error(`Produkt o kodzie ${data.productCode} już istnieje.`);
  }

  const product = await db.product.create({
    data: {
      companyId,
      name: data.name.trim(),
      productCode: data.productCode.trim(),
      eanCode: data.eanCode,
      code128: data.code128,
      categoryId: data.categoryId,
      // Domyślnie AKTYWNY — formularz nie pyta już o status, archiwizacja
      // robi się osobnym przyciskiem.
      status: data.status ?? "AKTYWNY",
      importMode: data.importMode ?? "KARTON",
      compositionMode: data.compositionMode ?? "CALOSCIOWY",
      requiredComponentsTotal: data.requiredComponentsTotal ?? null,
      color: data.color,
      widthCm: data.widthCm,
      heightCm: data.heightCm,
      depthCm: data.depthCm,
      weightKg: data.weightKg,
      boxWidthCm: data.boxWidthCm,
      boxHeightCm: data.boxHeightCm,
      boxDepthCm: data.boxDepthCm,
      boxWeightKg: data.boxWeightKg,
      unitsPerBox: data.unitsPerBox,
      masterBoxWidthCm: data.masterBoxWidthCm,
      masterBoxHeightCm: data.masterBoxHeightCm,
      masterBoxDepthCm: data.masterBoxDepthCm,
      masterBoxWeightKg: data.masterBoxWeightKg,
      innerBoxesPerMaster: data.innerBoxesPerMaster,
      unitsPerContainer: data.unitsPerContainer,
      referenceContainerM3: data.referenceContainerM3,
      shippingBoxWidthCm: data.shippingBoxWidthCm,
      shippingBoxHeightCm: data.shippingBoxHeightCm,
      shippingBoxDepthCm: data.shippingBoxDepthCm,
      shippingBoxWeightKg: data.shippingBoxWeightKg,
      unitsPerShippingBox: data.unitsPerShippingBox,
      unitsPerPallet: data.unitsPerPallet,
      cbmPerUnit: resolveCbmPerUnit(data),
      customsDutyPct:
        data.customsDutyPct != null ? data.customsDutyPct / 100 : null,
      isComponent: data.isComponent,
      defaultUnitPriceUsd: data.defaultUnitPriceUsd,
      defaultUnitPriceCny: data.defaultUnitPriceCny,
      defaultUnitPricePln: data.defaultUnitPricePln,
      defaultPricePerMeterPln: data.defaultPricePerMeterPln,
      lengthM: data.lengthM,
      defaultSalePriceAllegroPln: data.defaultSalePriceAllegroPln,
      defaultSalePriceSklepPln: data.defaultSalePriceSklepPln,
      defaultAllegroCommissionPct:
        data.defaultAllegroCommissionPct != null
          ? data.defaultAllegroCommissionPct / 100
          : null,
      importGuidelines: data.importGuidelines,
      productionGuidelines: data.productionGuidelines,
      userManual: data.userManual,
      shopDescription: data.shopDescription,
      internalNotes: data.internalNotes,
    },
  });

  // Auto-dopnij komponenty z reguł kategorii (np. "każdy produkt w 'Mebli'
  // dostaje komponent X"). Idempotentne — pomija istniejące powiązania.
  if (product.categoryId) {
    await ensureComponentLinksForProduct(product.id);
  }

  // Auto-pin pudełek z reguł kategoryjnych / produktowych (skipDuplicates).
  await applyBoxRulesToNewProduct(product.id);

  revalidatePath("/produkty");
  revalidateTag("products");
  return { ok: true as const, id: product.id };
}

export async function updateProductAction(id: string, input: unknown) {
  await requireUser();
  const companyId = await getCurrentCompanyId();
  const data = productSchema.parse(input);

  const existing = await db.product.findFirst({ where: { id, companyId } });
  if (!existing) throw new Error("Produkt nie istnieje.");

  if (data.productCode !== existing.productCode) {
    const conflict = await db.product.findFirst({
      where: { companyId, productCode: data.productCode },
    });
    if (conflict) {
      throw new Error(`Produkt o kodzie ${data.productCode} już istnieje.`);
    }
  }

  await db.product.update({
    where: { id },
    data: {
      name: data.name.trim(),
      productCode: data.productCode.trim(),
      eanCode: data.eanCode,
      code128: data.code128,
      categoryId: data.categoryId,
      ...(data.status ? { status: data.status } : {}),
      ...(data.importMode ? { importMode: data.importMode } : {}),
      ...(data.compositionMode
        ? { compositionMode: data.compositionMode }
        : {}),
      requiredComponentsTotal: data.requiredComponentsTotal ?? null,
      color: data.color,
      widthCm: data.widthCm,
      heightCm: data.heightCm,
      depthCm: data.depthCm,
      weightKg: data.weightKg,
      boxWidthCm: data.boxWidthCm,
      boxHeightCm: data.boxHeightCm,
      boxDepthCm: data.boxDepthCm,
      boxWeightKg: data.boxWeightKg,
      unitsPerBox: data.unitsPerBox,
      masterBoxWidthCm: data.masterBoxWidthCm,
      masterBoxHeightCm: data.masterBoxHeightCm,
      masterBoxDepthCm: data.masterBoxDepthCm,
      masterBoxWeightKg: data.masterBoxWeightKg,
      innerBoxesPerMaster: data.innerBoxesPerMaster,
      unitsPerContainer: data.unitsPerContainer,
      referenceContainerM3: data.referenceContainerM3,
      shippingBoxWidthCm: data.shippingBoxWidthCm,
      shippingBoxHeightCm: data.shippingBoxHeightCm,
      shippingBoxDepthCm: data.shippingBoxDepthCm,
      shippingBoxWeightKg: data.shippingBoxWeightKg,
      unitsPerShippingBox: data.unitsPerShippingBox,
      unitsPerPallet: data.unitsPerPallet,
      cbmPerUnit: resolveCbmPerUnit(data),
      customsDutyPct:
        data.customsDutyPct != null ? data.customsDutyPct / 100 : null,
      isComponent: data.isComponent,
      defaultUnitPriceUsd: data.defaultUnitPriceUsd,
      defaultUnitPriceCny: data.defaultUnitPriceCny,
      defaultUnitPricePln: data.defaultUnitPricePln,
      defaultPricePerMeterPln: data.defaultPricePerMeterPln,
      lengthM: data.lengthM,
      defaultSalePriceAllegroPln: data.defaultSalePriceAllegroPln,
      defaultSalePriceSklepPln: data.defaultSalePriceSklepPln,
      defaultAllegroCommissionPct:
        data.defaultAllegroCommissionPct != null
          ? data.defaultAllegroCommissionPct / 100
          : null,
      importGuidelines: data.importGuidelines,
      productionGuidelines: data.productionGuidelines,
      userManual: data.userManual,
      shopDescription: data.shopDescription,
      internalNotes: data.internalNotes,
    },
  });

  // Jeśli kategoria się zmieniła, doszły potencjalnie nowe reguły kategorii —
  // dopnij brakujące komponenty i pudełka. Stare powiązania zostawiamy
  // (deletion = manual).
  if (data.categoryId && data.categoryId !== existing.categoryId) {
    await ensureComponentLinksForProduct(id);
    await applyBoxRulesToNewProduct(id);
  }

  revalidatePath("/produkty");
  revalidateTag("products");
  revalidatePath(`/produkty/${id}`);
  return { ok: true as const };
}

/**
 * Patch tylko pól z kroku 1 wizarda (Podstawowe).
 * Używane przez modal edycji "Podstawowe" na karcie produktu — bez wymagania
 * pełnej walidacji całego produktu (która wymagałaby też pól kartonu itd.).
 */
const basicInfoSchema = z.object({
  name: z.string().min(1, "Podaj nazwę"),
  productCode: z.string().min(1, "Podaj kod produktu"),
  code128: optionalString,
  eanCode: optionalString,
  categoryId: optionalString,
  /** Tryb składania: CALOSCIOWY / KOMPONENTOWY. */
  compositionMode: z.enum(["CALOSCIOWY", "KOMPONENTOWY"]).optional(),
  /** Liczba komponentów do skompletowania — gdy KOMPONENTOWY. */
  requiredComponentsTotal: optionalInt,
  /** Waga produktu (kg/szt). */
  weightKg: optionalNumber,
  /** Stawka cła w % (0..100) — przy zapisie konwertujemy na 0..1. */
  customsDutyPct: optionalNumber,
});

export async function updateProductBasicAction(id: string, input: unknown) {
  await requireUser();
  const companyId = await getCurrentCompanyId();
  const data = basicInfoSchema.parse(input);

  const existing = await db.product.findFirst({ where: { id, companyId } });
  if (!existing) throw new Error("Produkt nie istnieje.");

  if (data.productCode !== existing.productCode) {
    const conflict = await db.product.findFirst({
      where: { companyId, productCode: data.productCode, id: { not: id } },
      select: { id: true },
    });
    if (conflict) {
      throw new Error(`Produkt o kodzie ${data.productCode} już istnieje.`);
    }
  }

  if (data.eanCode && data.eanCode !== existing.eanCode) {
    const conflict = await db.product.findFirst({
      where: { companyId, eanCode: data.eanCode, id: { not: id } },
      select: { id: true },
    });
    if (conflict) {
      throw new Error(`Produkt o kodzie EAN ${data.eanCode} już istnieje.`);
    }
  }

  await db.product.update({
    where: { id },
    data: {
      name: data.name.trim(),
      productCode: data.productCode.trim(),
      code128: data.code128,
      eanCode: data.eanCode,
      categoryId: data.categoryId,
      ...(data.compositionMode
        ? { compositionMode: data.compositionMode }
        : {}),
      requiredComponentsTotal: data.requiredComponentsTotal ?? null,
      weightKg: data.weightKg,
      customsDutyPct:
        data.customsDutyPct != null ? data.customsDutyPct / 100 : null,
    },
  });

  // Zmiana kategorii — dopnij brakujące komponenty i pudełka
  if (data.categoryId && data.categoryId !== existing.categoryId) {
    await ensureComponentLinksForProduct(id);
    await applyBoxRulesToNewProduct(id);
  }

  revalidatePath("/produkty");
  revalidateTag("products");
  revalidatePath(`/produkty/${id}`);
  return { ok: true as const };
}

/**
 * Inline-edit cen domyślnych na liście produktów — patch jednego z trzech
 * pól: defaultSalePriceAllegroPln, defaultSalePriceSklepPln,
 * defaultAllegroCommissionPct. Wartość jest zawsze w NETTO (komponent
 * UI konwertuje brutto→netto przed zawołaniem).
 */
const updateSaleDefaultsSchema = z.object({
  defaultSalePriceAllegroPln: optionalNumber,
  defaultSalePriceSklepPln: optionalNumber,
  /** % w UI (0..100) — konwertujemy do 0..1 przy zapisie. */
  defaultAllegroCommissionPct: optionalNumber,
  defaultSklepCommissionPct: optionalNumber,
  defaultAllegroOtherCostPln: optionalNumber,
  defaultSklepOtherCostPln: optionalNumber,
  defaultAllegroCustomerShippingPln: optionalNumber,
  defaultSklepCustomerShippingPln: optionalNumber,
  defaultSklepAdCostPln: optionalNumber,
});

const PERCENT_FIELDS = new Set([
  "defaultAllegroCommissionPct",
  "defaultSklepCommissionPct",
]);
const SALE_DEFAULT_FIELDS = [
  "defaultSalePriceAllegroPln",
  "defaultSalePriceSklepPln",
  "defaultAllegroCommissionPct",
  "defaultSklepCommissionPct",
  "defaultAllegroOtherCostPln",
  "defaultSklepOtherCostPln",
  "defaultAllegroCustomerShippingPln",
  "defaultSklepCustomerShippingPln",
  "defaultSklepAdCostPln",
] as const;

export async function updateProductSaleDefaultsAction(
  id: string,
  input: unknown,
) {
  await requireUser();
  const data = updateSaleDefaultsSchema.parse(input);

  const patch: Record<string, number | null> = {};
  for (const field of SALE_DEFAULT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      const v = data[field];
      patch[field] =
        v != null && PERCENT_FIELDS.has(field) ? v / 100 : (v ?? null);
    }
  }

  await db.product.update({ where: { id }, data: patch });
  revalidatePath("/produkty");
  revalidateTag("products");
  revalidatePath(`/produkty/${id}`);
  return { ok: true as const };
}

/**
 * Inline-edit pól tekstowych (wytyczne, opis, notatki). Whitelist pól żeby
 * nie dało się przez ten endpoint zmienić name/code/itp.
 */
const TEXT_FIELDS = [
  "productionGuidelines",
  "importGuidelines",
  "userManual",
  "shopDescription",
  "internalNotes",
  "factoryBoxNotes",
] as const;
type TextField = (typeof TEXT_FIELDS)[number];

export async function updateProductTextFieldAction(
  id: string,
  field: TextField,
  value: string | null,
) {
  await requireUser();
  if (!TEXT_FIELDS.includes(field)) {
    throw new Error(`Nieobsługiwane pole: ${field}`);
  }
  const cleaned = value == null ? null : value.trim() || null;
  await db.product.update({
    where: { id },
    data: { [field]: cleaned },
  });
  revalidatePath(`/produkty/${id}`);
  return { ok: true as const };
}

/**
 * Toggle preferowanej usługi kurierskiej dla produktu. Trzymamy listę
 * kodów usług (z silnika wyceny — `INPOST_*` / `DHL_*`). Brak walidacji
 * kodów po stronie serwera — silnik wyceny ignoruje nieznane.
 */
export async function setPreferredShippingServicesAction(
  productId: string,
  serviceCodes: string[],
) {
  await requireUser();
  // Dedup + tylko stringi
  const cleaned = Array.from(
    new Set(serviceCodes.filter((c) => typeof c === "string" && c.length > 0)),
  );
  await db.product.update({
    where: { id: productId },
    data: { preferredShippingServices: cleaned },
  });
  revalidatePath(`/produkty/${productId}`);
  return { ok: true as const };
}

/**
 * Lista wykluczonych usług kurierskich dla tego produktu. Pusta = wszystkie
 * aktywne. Filtruje w silniku przed wyborem najtańszej — usługa z tej listy
 * nie pojawi się w wycenach.
 */
export async function setExcludedShippingServicesAction(
  productId: string,
  serviceCodes: string[],
) {
  await requireUser();
  const cleaned = Array.from(
    new Set(serviceCodes.filter((c) => typeof c === "string" && c.length > 0)),
  );
  await db.product.update({
    where: { id: productId },
    data: { excludedShippingServices: cleaned },
  });
  revalidatePath(`/produkty/${productId}`);
  return { ok: true as const };
}

/**
 * Wyklucz całe marki kurierskie (np. „INPOST", „DHL") dla produktu.
 * Wszystkie usługi tej marki znikają z wyceny. Wygodniejsze niż markowanie
 * każdej usługi osobno.
 */
export async function setExcludedShippingBrandsAction(
  productId: string,
  brands: string[],
) {
  await requireUser();
  const allowed = new Set(["INPOST", "DHL"]);
  const cleaned = Array.from(
    new Set(brands.filter((b) => typeof b === "string" && allowed.has(b))),
  );
  await db.product.update({
    where: { id: productId },
    data: { excludedShippingBrands: cleaned },
  });
  revalidatePath(`/produkty/${productId}`);
  return { ok: true as const };
}

export async function archiveProductAction(id: string, archived: boolean) {
  await requireUser();
  await db.product.update({ where: { id }, data: { archived } });
  revalidatePath("/produkty");
  revalidateTag("products");
  revalidatePath(`/produkty/${id}`);
  return { ok: true as const };
}

/**
 * Usuwa produkt. Jeśli produkt jest komponentem innych produktów albo ma reguły
 * komponentów, automatycznie odpina go w pojedynczej transakcji — user nie musi
 * najpierw klikać przez wszystkie zestawy. Twardo blokuje TYLKO gdy produkt
 * jest w zamówieniu (historia zakupów = audit), żeby nie zniszczyć integralności
 * danych historycznych.
 */
export async function deleteProductAction(id: string) {
  await requireUser();

  const usedInOrder = await db.importOrderItem.count({
    where: { productId: id },
  });

  if (usedInOrder > 0) {
    throw new Error(
      `Produkt jest użyty w ${usedInOrder} zamówieniach — zarchiwizuj go zamiast usuwać.`,
    );
  }

  await db.$transaction([
    // Odepnij ze wszystkich slotów w produktach-zestawach
    db.productComponent.deleteMany({ where: { componentId: id } }),
    // Usuń reguły kategoryjne dla tego komponentu
    db.componentCategoryRule.deleteMany({ where: { componentId: id } }),
    // Sam produkt — cascade Prisma posprząta jego shippingBoxes, images, files itd.
    db.product.delete({ where: { id } }),
  ]);
  revalidatePath("/produkty");
  revalidateTag("products");
  return { ok: true as const };
}

/**
 * Generuje propozycję kodu CODE 128 dla kategorii.
 * Format: `XXX-NNNN` gdzie:
 *  - XXX = 3 pierwsze litery nazwy kategorii (uppercase, ASCII fold)
 *  - NNNN = 4-cyfrowy sekwencyjny numer (0001, 0002 …) bazując na max kodzie
 *    z prefiksem `XXX-` w obrębie firmy
 *
 * Jeśli kategoria nie jest podana lub ma <3 znaków, używamy "PRD" jako prefiks.
 */
export async function generateCode128ForCategoryAction(input: {
  categoryId: string | null;
}): Promise<{ code: string; prefix: string; nextNumber: number }> {
  const user = await requireUser();
  const userWithCompany = await db.user.findUnique({
    where: { id: user.id },
    select: { companyId: true },
  });
  if (!userWithCompany?.companyId) {
    throw new Error("Brak przypisanej firmy.");
  }

  // Wyznacz prefiks 3-literowy
  function makePrefix(name: string | undefined | null): string {
    if (!name) return "PRD";
    // ASCII fold (ł→l, ą→a itd.), tylko litery, uppercase
    const folded = name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/ł/gi, "l")
      .replace(/[^A-Za-z]/g, "")
      .toUpperCase();
    if (folded.length >= 3) return folded.slice(0, 3);
    return (folded + "XXX").slice(0, 3);
  }

  let prefix = "PRD";
  if (input.categoryId) {
    const cat = await db.category.findUnique({
      where: { id: input.categoryId },
      select: { name: true },
    });
    if (cat) prefix = makePrefix(cat.name);
  }

  // Znajdź najwyższy istniejący numer dla tego prefixu w obrębie firmy
  const pattern = `${prefix}-`;
  const existing = await db.product.findMany({
    where: {
      companyId: userWithCompany.companyId,
      code128: { startsWith: pattern },
    },
    select: { code128: true },
  });
  let maxNum = 0;
  for (const e of existing) {
    if (!e.code128) continue;
    const match = e.code128.match(/-(\d{1,6})$/);
    if (match) {
      const n = Number(match[1]);
      if (Number.isFinite(n) && n > maxNum) maxNum = n;
    }
  }
  const nextNumber = maxNum + 1;
  const code = `${prefix}-${String(nextNumber).padStart(4, "0")}`;
  return { code, prefix, nextNumber };
}
