import Link from "next/link";
import { ArrowLeft, Package as BoxIcon } from "lucide-react";

import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";
import { buttonVariants } from "@/components/ui/button";

import { ShippingBoxesManager } from "./shipping-boxes-manager";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ kind?: string }>;

export default async function PudelkaPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const companyId = await getCurrentCompanyId();
  // kind: "single" = wysyłkowe (PL + CN razem), "collective" = zbiorcze (master)
  const activeKind = params.kind === "collective" ? "collective" : "single";
  const activeIsCollective = activeKind === "collective";

  const [
    boxes,
    categories,
    products,
    categoryRules,
    productRules,
    allCounts,
  ] = await Promise.all([
      db.shippingBox.findMany({
        where: { companyId, archived: false },
        orderBy: [{ name: "asc" }],
        include: {
          _count: { select: { productBoxes: true } },
          productBoxes: {
            select: {
              id: true,
              productId: true,
              product: {
                select: { id: true, name: true, productCode: true },
              },
            },
          },
          innerBox: {
            select: {
              id: true,
              name: true,
              internalCode: true,
              packagingType: true,
              widthCm: true,
              heightCm: true,
              depthCm: true,
            },
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
          _count: { select: { products: { where: { companyId } } } },
        },
      }),
      db.product.findMany({
        where: { companyId, archived: false },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          productCode: true,
          categoryId: true,
          isComponent: true,
        },
      }),
      db.shippingBoxCategoryRule.findMany({
        where: { box: { companyId } },
        include: {
          category: { select: { id: true, name: true, level: true } },
        },
      }),
      db.shippingBoxProductRule.findMany({
        where: { box: { companyId } },
        include: {
          product: { select: { id: true, name: true, productCode: true } },
        },
      }),
      db.shippingBox.groupBy({
        by: ["isCollective"],
        where: { companyId, archived: false },
        _count: { _all: true },
      }),
    ]);

  // 2 buckety: pojedyncze (wysyłkowe — PL+CN) vs zbiorcze (master — PL+CN)
  const counts = {
    SINGLE: allCounts.find((c) => !c.isCollective)?._count._all ?? 0,
    COLLECTIVE: allCounts.find((c) => c.isCollective)?._count._all ?? 0,
  };

  const filteredBoxes = boxes.filter(
    (b) => !!b.isCollective === activeIsCollective,
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/produkty"
            className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1"
          >
            <ArrowLeft className="size-3" />
            Produkty i komponenty
          </Link>
          <h1 className="text-3xl font-heading font-bold tracking-tight mt-1 inline-flex items-center gap-2">
            <BoxIcon className="size-7 text-amber-600" />
            Pudełka wysyłkowe
          </h1>
          <p className="text-sm text-muted-foreground">
            Katalog pudełek. Przypisz pudełko bezpośrednio do produktu lub
            do całej kategorii — wtedy każdy nowy produkt w tej kategorii
            automatycznie dostaje to pudełko.
          </p>
        </div>
        <Link
          href="/produkty"
          className={buttonVariants({ variant: "outline" })}
        >
          Wróć do produktów
        </Link>
      </div>

      <ShippingBoxesManager
        activeKind={activeKind}
        counts={counts}
        boxes={filteredBoxes.map((b) => ({
          id: b.id,
          name: b.name,
          internalCode: b.internalCode,
          packagingType: b.packagingType,
          origin: b.origin,
          isCollective: b.isCollective,
          widthCm: b.widthCm,
          heightCm: b.heightCm,
          depthCm: b.depthCm,
          weightKg: b.weightKg,
          cardboardLayers: b.cardboardLayers,
          purchasePricePln: b.purchasePricePln,
          printFileUrl: b.printFileUrl,
          printFileName: b.printFileName,
          purposeText: b.purposeText,
          innerBoxId: b.innerBoxId,
          innerBoxesPerMaster: b.innerBoxesPerMaster,
          innerBox: b.innerBox
            ? {
                id: b.innerBox.id,
                name: b.innerBox.name,
                internalCode: b.innerBox.internalCode,
                packagingType: b.innerBox.packagingType,
                widthCm: b.innerBox.widthCm,
                heightCm: b.innerBox.heightCm,
                depthCm: b.innerBox.depthCm,
              }
            : null,
          notes: b.notes,
          _count: b._count,
          pinnedProducts: b.productBoxes.map((pb) => ({
            linkId: pb.id,
            id: pb.product.id,
            name: pb.product.name,
            productCode: pb.product.productCode,
          })),
        }))}
        innerBoxCandidates={boxes
          .filter(
            (b) => !b.isCollective && b.origin === "CHINA_STANDARD",
          )
          .map((b) => ({
            id: b.id,
            name: b.name,
            internalCode: b.internalCode,
            packagingType: b.packagingType,
            widthCm: b.widthCm,
            heightCm: b.heightCm,
            depthCm: b.depthCm,
          }))}
        categories={categories}
        products={products}
        categoryRules={categoryRules.map((r) => ({
          id: r.id,
          boxId: r.boxId,
          categoryId: r.categoryId,
          categoryName: r.category.name,
          categoryLevel: r.category.level,
          purpose: r.purpose,
          unitsPerBox: r.unitsPerBox,
          isPrimary: r.isPrimary,
        }))}
        productRules={productRules.map((r) => ({
          id: r.id,
          boxId: r.boxId,
          productId: r.productId,
          productName: r.product.name,
          productCode: r.product.productCode,
          purpose: r.purpose,
          unitsPerBox: r.unitsPerBox,
          isPrimary: r.isPrimary,
        }))}
      />
    </div>
  );
}
