"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";
import { quoteShippingForProduct } from "@/lib/courier-pricing/product-quote";
import { getFulfillmentSettings } from "./system-settings";

async function requireUser() {
  const session = await auth();
  if (!session?.user) throw new Error("Brak autoryzacji.");
  return session.user;
}

/**
 * Ustawia defaultSalePriceSklepPln dla wszystkich blatow (Product.name LIKE 'Blat%')
 * tak, zeby marza sklep wyniosla ~targetMarginPct (default 30%).
 *
 * Kalkulacja per blat:
 *  - zakup_brutto    = defaultUnitPricePln × 1.23
 *  - kurier_brutto   = quoteShippingForProduct(...).primary.totalNetPln × 1.23
 *  - magazyn_brutto  = fulfillment.warehousePerUnitPln × 1.23
 *  - paczka_brutto   = primaryShippingBox.purchasePricePln × 1.23
 *  - costs_brutto    = suma powyzszych
 *  - commission_pct  = defaultSklepCommissionPct (lub 0.01 fallback)
 *  - sale_brutto     = costs / (1 - targetMarginPct - commission_pct)
 *  - round up do X9: ceil((sale+1)/10)*10 - 1
 *  - zapisuje sale_netto = sale_brutto / 1.23
 *
 * Pomija blaty bez ceny zakupu (defaultUnitPricePln IS NULL).
 */
export async function recomputeBlatPricesAction(
  targetMarginPct: number = 0.30,
) {
  await requireUser();
  const companyId = await getCurrentCompanyId();
  const fulfillment = await getFulfillmentSettings();
  // Per-sztuka fulfillment = otwarcie + per SKU + per szt (zaokraglenie 1 SKU/1 szt).
  const warehousePerUnitNetto =
    fulfillment.orderOpeningCost +
    fulfillment.shippingCostPerSku +
    fulfillment.perPiecePln;

  const blats = await db.product.findMany({
    where: {
      companyId,
      name: { startsWith: "Blat" },
      defaultUnitPricePln: { not: null },
    },
    select: {
      id: true,
      productCode: true,
      name: true,
      weightKg: true,
      defaultUnitPricePln: true,
      defaultSklepCommissionPct: true,
      preferredShippingServices: true,
      excludedShippingServices: true,
      excludedShippingBrands: true,
      shippingBoxes: {
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        select: {
          isPrimary: true,
          purpose: true,
          box: {
            select: {
              widthCm: true,
              heightCm: true,
              depthCm: true,
              weightKg: true,
              purchasePricePln: true,
            },
          },
        },
      },
    },
  });

  const results: Array<{
    code: string;
    name: string;
    purchase: number;
    shipping: number;
    box: number;
    warehouse: number;
    saleNetto: number;
    saleBrutto: number;
    margin: number;
  }> = [];
  let updated = 0;
  let skipped = 0;

  for (const blat of blats) {
    // Primary box (preferowanie SHIPPING > FACTORY).
    const pin =
      blat.shippingBoxes.find((b) => b.purpose === "SHIPPING" && b.isPrimary) ??
      blat.shippingBoxes.find((b) => b.purpose === "SHIPPING") ??
      blat.shippingBoxes.find((b) => b.purpose === "FACTORY" && b.isPrimary) ??
      blat.shippingBoxes.find((b) => b.purpose === "FACTORY") ??
      null;

    if (!pin) {
      skipped++;
      continue;
    }

    const quote = quoteShippingForProduct({
      productWeightKg: blat.weightKg,
      primaryBox: {
        widthCm: pin.box.widthCm,
        heightCm: pin.box.heightCm,
        depthCm: pin.box.depthCm,
        weightKg: pin.box.weightKg,
      },
      preferredServiceCodes: blat.preferredShippingServices,
      excludedServiceCodes: blat.excludedShippingServices,
      excludedBrands: blat.excludedShippingBrands,
    });
    const shippingNetto = quote?.primary?.totalNetPln ?? 0;

    const purchaseNetto = blat.defaultUnitPricePln ?? 0;
    const boxNetto = pin.box.purchasePricePln ?? 0;
    const commissionPct = blat.defaultSklepCommissionPct ?? 0.01;

    // Wszystko w brutto (jak UI pokazuje):
    const costsBrutto =
      (purchaseNetto + shippingNetto + boxNetto + warehousePerUnitNetto) * 1.23;
    const denom = 1 - targetMarginPct - commissionPct;
    if (denom <= 0) {
      skipped++;
      continue;
    }
    const saleBruttoTarget = costsBrutto / denom;

    // Zaokraglenie w gore do X9 (np. 491.92 -> 499)
    const saleBruttoRounded =
      Math.ceil((saleBruttoTarget + 1) / 10) * 10 - 1;
    const saleNetto =
      Math.round((saleBruttoRounded / 1.23) * 100) / 100;

    await db.product.update({
      where: { id: blat.id },
      data: { defaultSalePriceSklepPln: saleNetto },
    });

    // Sprawdzenie marzy faktycznej po zaokragleniu
    const actualMargin =
      (saleBruttoRounded -
        costsBrutto -
        saleBruttoRounded * commissionPct) /
      saleBruttoRounded;

    updated++;
    results.push({
      code: blat.productCode,
      name: blat.name,
      purchase: purchaseNetto * 1.23,
      shipping: shippingNetto * 1.23,
      box: boxNetto * 1.23,
      warehouse: warehousePerUnitNetto * 1.23,
      saleNetto,
      saleBrutto: saleBruttoRounded,
      margin: actualMargin,
    });
  }

  try {
    revalidatePath("/produkty");
    revalidatePath("/sprzedaz/produkty");
  } catch {
    // Next 16 nie pozwala revalidate w renderze — ignore.
  }

  return {
    ok: true as const,
    updated,
    skipped,
    results: results.sort((a, b) => b.saleBrutto - a.saleBrutto),
  };
}
