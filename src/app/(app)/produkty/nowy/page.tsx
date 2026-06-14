import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";
import { ProductForm } from "../product-form";
import { getDefaultContainerM3 } from "@/server/system-settings";

export const dynamic = "force-dynamic";

export default async function NowyProduktPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  const isComponent = type === "component";
  const companyId = await getCurrentCompanyId();

  const [categories, defaultContainerM3, componentCategoryOptions] =
    await Promise.all([
      db.category.findMany({
        where: { companyId },
        orderBy: [{ level: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true, parentId: true, level: true },
      }),
      getDefaultContainerM3(),
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
    ]);

  return (
    <div className="p-6">
      <div className="mb-6">
        <Link
          href="/produkty"
          className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1"
        >
          <ArrowLeft className="size-3" />
          Produkty i komponenty
        </Link>
        <h1 className="text-3xl font-heading font-bold tracking-tight mt-1">
          {isComponent ? "Nowy komponent" : "Nowy produkt"}
        </h1>
      </div>
      <ProductForm
        categories={categories}
        componentCategoryOptions={componentCategoryOptions.map((c) => ({
          id: c.id,
          name: c.name,
          parentId: c.parentId,
          level: c.level,
          productCount: c._count.products,
        }))}
        defaultContainerM3={defaultContainerM3}
        defaultIsComponent={isComponent}
      />
    </div>
  );
}
