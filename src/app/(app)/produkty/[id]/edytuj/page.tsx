import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";
import { ProductForm } from "../../product-form";
import { getDefaultContainerM3 } from "@/server/system-settings";

export const dynamic = "force-dynamic";

export default async function EdytujProduktPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const companyId = await getCurrentCompanyId();
  const [
    product,
    categories,
    defaultContainerM3,
    availableBoxes,
    componentCategoryOptionsRaw,
    componentRules,
  ] = await Promise.all([
    db.product.findFirst({
      where: { id, companyId },
      include: {
        shippingBoxes: {
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          include: {
            box: {
              select: {
                id: true,
                name: true,
                internalCode: true,
                packagingType: true,
                widthCm: true,
                heightCm: true,
                depthCm: true,
                weightKg: true,
                cardboardLayers: true,
              },
            },
          },
        },
      },
    }),
    db.category.findMany({
      where: { companyId },
      orderBy: [{ level: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, parentId: true, level: true },
    }),
    getDefaultContainerM3(),
    db.shippingBox.findMany({
      where: { companyId, archived: false },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        internalCode: true,
        packagingType: true,
        widthCm: true,
        heightCm: true,
        depthCm: true,
        cardboardLayers: true,
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
        _count: {
          select: {
            products: {
              where: { companyId, isComponent: false, archived: false },
            },
          },
        },
      },
    }),
    db.componentCategoryRule.findMany({
      where: { componentId: id },
      select: { categoryId: true },
    }),
  ]);

  if (!product) notFound();

  const componentCategoryOptions = componentCategoryOptionsRaw.map((c) => ({
    id: c.id,
    name: c.name,
    parentId: c.parentId,
    level: c.level,
    productCount: c._count.products,
  }));
  const initialAssignedCategoryIds = componentRules.map((r) => r.categoryId);

  return (
    <div className="p-6">
      <div className="mb-6">
        <Link
          href={`/produkty/${product.id}`}
          className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1"
        >
          <ArrowLeft className="size-3" />
          {product.name}
        </Link>
        <h1 className="text-3xl font-heading font-bold tracking-tight mt-1">
          Edytuj produkt
        </h1>
      </div>
      <ProductForm
        productId={product.id}
        categories={categories}
        componentCategoryOptions={componentCategoryOptions}
        initialAssignedCategoryIds={initialAssignedCategoryIds}
        defaultContainerM3={defaultContainerM3}
        productBoxes={product.shippingBoxes.map((pb) => ({
          id: pb.id,
          purpose: pb.purpose as "SHIPPING" | "FACTORY",
          unitsPerBox: pb.unitsPerBox,
          isPrimary: pb.isPrimary,
          notes: pb.notes,
          imageUrl: pb.imageUrl,
          imageAlt: pb.imageAlt,
          designUrl: pb.designUrl,
          designName: pb.designName,
          box: {
            id: pb.box.id,
            name: pb.box.name,
            internalCode: pb.box.internalCode,
            packagingType: pb.box.packagingType as "BOX" | "POLY_BAG",
            widthCm: pb.box.widthCm,
            heightCm: pb.box.heightCm,
            depthCm: pb.box.depthCm,
            weightKg: pb.box.weightKg,
            cardboardLayers: pb.box.cardboardLayers,
          },
        }))}
        availableBoxes={availableBoxes.map((b) => ({
          id: b.id,
          name: b.name,
          internalCode: b.internalCode,
          packagingType: b.packagingType as "BOX" | "POLY_BAG",
          widthCm: b.widthCm,
          heightCm: b.heightCm,
          depthCm: b.depthCm,
          cardboardLayers: b.cardboardLayers,
        }))}
        initial={{
          name: product.name,
          productCode: product.productCode,
          eanCode: product.eanCode,
          code128: product.code128,
          categoryId: product.categoryId,
          status: product.status,
          importMode: product.importMode,
          compositionMode: product.compositionMode,
          isComponent: product.isComponent,
          color: product.color,
          widthCm: product.widthCm,
          heightCm: product.heightCm,
          depthCm: product.depthCm,
          weightKg: product.weightKg,
          boxWidthCm: product.boxWidthCm,
          boxHeightCm: product.boxHeightCm,
          boxDepthCm: product.boxDepthCm,
          boxWeightKg: product.boxWeightKg,
          unitsPerBox: product.unitsPerBox,
          unitsPerContainer: product.unitsPerContainer,
          referenceContainerM3: product.referenceContainerM3,
          shippingBoxWidthCm: product.shippingBoxWidthCm,
          shippingBoxHeightCm: product.shippingBoxHeightCm,
          shippingBoxDepthCm: product.shippingBoxDepthCm,
          shippingBoxWeightKg: product.shippingBoxWeightKg,
          unitsPerShippingBox: product.unitsPerShippingBox,
          unitsPerPallet: product.unitsPerPallet,
          cbmPerUnit: product.cbmPerUnit,
          customsDutyPct: product.customsDutyPct,
          defaultUnitPriceUsd: product.defaultUnitPriceUsd,
          defaultUnitPriceCny: product.defaultUnitPriceCny,
          defaultSalePriceAllegroPln: product.defaultSalePriceAllegroPln,
          defaultSalePriceSklepPln: product.defaultSalePriceSklepPln,
          defaultAllegroCommissionPct: product.defaultAllegroCommissionPct,
          importGuidelines: product.importGuidelines,
          productionGuidelines: product.productionGuidelines,
          userManual: product.userManual,
          shopDescription: product.shopDescription,
          internalNotes: product.internalNotes,
        }}
      />
    </div>
  );
}
