import { ClipboardCheck } from "lucide-react";

import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";
import { KontrolaPanel } from "./_components/kontrola-panel";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  category?: string;
  type?: string;
}>;

export default async function KontrolaProduktowaPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const companyId = await getCurrentCompanyId();
  const activeCategoryId = params.category ?? null;
  const activeType = (params.type as "product" | "component" | "all") ?? "product";

  const [products, categories, shippingBoxes] = await Promise.all([
    db.product.findMany({
      // Zestawy są wirtualnymi produktami — nie podlegają kontroli pól
      // importowych/pakowania. Pomijamy w widoku kontroli.
      where: { companyId, archived: false, compositionMode: { not: "ZESTAW" } },
      orderBy: [{ isComponent: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        productCode: true,
        isComponent: true,
        categoryId: true,
        eanCode: true,
        code128: true,
        color: true,
        widthCm: true,
        heightCm: true,
        depthCm: true,
        weightKg: true,
        importMode: true,
        boxWidthCm: true,
        boxHeightCm: true,
        boxDepthCm: true,
        boxWeightKg: true,
        unitsPerBox: true,
        masterBoxWidthCm: true,
        masterBoxHeightCm: true,
        masterBoxDepthCm: true,
        masterBoxWeightKg: true,
        innerBoxesPerMaster: true,
        customsDutyPct: true,
        shortDescription: true,
        shopDescription: true,
        vatRatePct: true,
        warrantyMonths: true,
        warrantyType: true,
        producer: true,
        loadCapacityKg: true,
        // Primary karton wysyłkowy (pakowanie) — wybór z biblioteki ShippingBox
        shippingBoxes: {
          where: { purpose: "SHIPPING", isPrimary: true },
          take: 1,
          select: {
            id: true,
            unitsPerBox: true,
            box: {
              select: {
                id: true,
                name: true,
                internalCode: true,
                widthCm: true,
                heightCm: true,
                depthCm: true,
              },
            },
          },
        },
        images: {
          where: { isPrimary: true },
          take: 1,
          select: { url: true, alt: true },
        },
      },
    }),
    db.category.findMany({
      where: { companyId },
      orderBy: [{ level: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        parentId: true,
        level: true,
      },
    }),
    // Biblioteka kartonów wysyłkowych dla pickera w kolumnie Pakowanie.
    // Tylko BOX (nie POLY_BAG), POLAND, pojedyncze (nie zbiorcze).
    db.shippingBox.findMany({
      where: {
        companyId,
        archived: false,
        packagingType: "BOX",
        origin: "POLAND",
        isCollective: false,
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        internalCode: true,
        widthCm: true,
        heightCm: true,
        depthCm: true,
      },
    }),
  ]);

  const productsFlat = products.map((p) => {
    const primaryBox = p.shippingBoxes[0] ?? null;
    return {
      id: p.id,
      name: p.name,
      productCode: p.productCode,
      isComponent: p.isComponent,
      categoryId: p.categoryId,
      eanCode: p.eanCode,
      code128: p.code128,
      color: p.color,
      widthCm: p.widthCm,
      heightCm: p.heightCm,
      depthCm: p.depthCm,
      weightKg: p.weightKg,
      importMode: p.importMode,
      boxWidthCm: p.boxWidthCm,
      boxHeightCm: p.boxHeightCm,
      boxDepthCm: p.boxDepthCm,
      boxWeightKg: p.boxWeightKg,
      unitsPerBox: p.unitsPerBox,
      masterBoxWidthCm: p.masterBoxWidthCm,
      masterBoxHeightCm: p.masterBoxHeightCm,
      masterBoxDepthCm: p.masterBoxDepthCm,
      masterBoxWeightKg: p.masterBoxWeightKg,
      innerBoxesPerMaster: p.innerBoxesPerMaster,
      customsDutyPct: p.customsDutyPct,
      shortDescription: p.shortDescription,
      shopDescription: p.shopDescription,
      vatRatePct: p.vatRatePct,
      warrantyMonths: p.warrantyMonths,
      warrantyType: p.warrantyType,
      producer: p.producer,
      loadCapacityKg: p.loadCapacityKg,
      primaryImageUrl: p.images[0]?.url ?? null,
      primaryImageAlt: p.images[0]?.alt ?? null,
      assignedShippingBoxId: primaryBox?.box.id ?? null,
      assignedShippingBoxName: primaryBox?.box.name ?? null,
      assignedShippingBoxCode: primaryBox?.box.internalCode ?? null,
      assignedShippingBoxDims: primaryBox
        ? `${primaryBox.box.widthCm}×${primaryBox.box.heightCm}×${primaryBox.box.depthCm} cm`
        : null,
      assignedShippingUnits: primaryBox?.unitsPerBox ?? null,
    };
  });

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="border-b px-6 py-4 bg-gradient-to-br from-slate-50 to-white shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="size-9 rounded-lg grid place-items-center bg-emerald-100 text-emerald-700">
            <ClipboardCheck className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-heading font-semibold tracking-tight">
              Kontrola produktowa
            </h1>
            <p className="text-xs text-muted-foreground">
              Przegląd uzupełnienia danych produktowych z edycją inline. Komórki
              bez wartości oznaczono jako „nie uzupełniono".
            </p>
          </div>
        </div>
      </div>

      <KontrolaPanel
        products={productsFlat}
        categories={categories}
        shippingBoxes={shippingBoxes}
        initialCategoryId={activeCategoryId}
        initialType={activeType}
      />
    </div>
  );
}
