import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";
import { buttonVariants } from "@/components/ui/button";
import { CategoriesManager } from "./categories-manager";

export const dynamic = "force-dynamic";

export default async function KategoriePage() {
  const companyId = await getCurrentCompanyId();
  const categories = await db.category.findMany({
    where: { companyId },
    orderBy: [{ level: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    include: {
      _count: {
        select: {
          products: { where: { companyId } },
          children: true,
        },
      },
      parent: { select: { id: true, name: true } },
    },
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/produkty"
            className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1"
          >
            <ArrowLeft className="size-3" />
            Produkty
          </Link>
          <h1 className="text-3xl font-heading font-bold tracking-tight mt-1">
            Kategorie
          </h1>
          <p className="text-sm text-muted-foreground">
            Organizuj produkty w drzewie kategorii.
          </p>
        </div>
        <Link href="/produkty" className={buttonVariants({ variant: "outline" })}>
          Wróć do produktów
        </Link>
      </div>

      <CategoriesManager categories={categories} />
    </div>
  );
}
