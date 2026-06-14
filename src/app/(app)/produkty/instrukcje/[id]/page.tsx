import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen } from "lucide-react";

import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { parseHeaderRanges } from "@/lib/manual-document";

import { ManualEditorPanel } from "./_components/manual-editor-panel";
import { AssignmentsPanel } from "./_components/assignments-panel";
import { RenameInput } from "./_components/rename-input";

export const dynamic = "force-dynamic";

export default async function InstrukcjaEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const companyId = await getCurrentCompanyId();

  const manual = await db.productManual.findFirst({
    where: { id, companyId },
    select: {
      id: true,
      name: true,
      manualJson: true,
      template: true,
      pageSize: true,
      kind: true,
      headerLang: true,
      headerTitle: true,
      headerRanges: true,
      footerCustom: true,
      fontFamily: true,
      bodyFontSize: true,
      h1FontSize: true,
      h2FontSize: true,
      h3FontSize: true,
      logoImageUrl: true,
      logoHeightPt: true,
      coverSubtitle: true,
      company: { select: { websiteUrl: true } },
      productAssignments: {
        select: {
          productId: true,
          product: {
            select: {
              id: true,
              name: true,
              productCode: true,
              images: {
                where: { isPrimary: true },
                take: 1,
                select: { id: true, url: true, alt: true },
              },
            },
          },
        },
      },
      categoryAssignments: {
        select: {
          categoryId: true,
          includeDescendants: true,
          category: {
            select: { id: true, name: true, parentId: true, level: true },
          },
        },
      },
    },
  });
  if (!manual) notFound();

  // Lista produktów i kategorii dla pickerów assignments
  const [allProducts, allCategories] = await Promise.all([
    db.product.findMany({
      where: { companyId, archived: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true, productCode: true },
    }),
    db.category.findMany({
      where: { companyId },
      orderBy: [{ level: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, parentId: true, level: true },
    }),
  ]);

  // Library obrazków — wszystkie z produktów przypisanych do tej instrukcji
  const productImages: { id: string; url: string; alt: string | null }[] =
    manual.productAssignments.flatMap((pa) =>
      pa.product.images.map((i) => ({ id: i.id, url: i.url, alt: i.alt })),
    );

  // Prisma 7.x zwraca Json fields jako Proxy z internal Symbols, które Next.js
  // RSC nie umie serializować przy przekazaniu do client component. Sklonuj
  // do plain object przez JSON round-trip.
  const cleanManualJson =
    manual.manualJson != null
      ? (JSON.parse(JSON.stringify(manual.manualJson)) as object)
      : null;

  return (
    <div className="p-6 space-y-4">
      <div>
        <Link
          href="/produkty/instrukcje"
          className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1"
        >
          <ArrowLeft className="size-3" />
          Wstecz do listy instrukcji
        </Link>
        <h1 className="text-2xl font-heading font-bold tracking-tight mt-1 inline-flex items-center gap-2">
          <BookOpen className="size-6 text-indigo-600" />
          <RenameInput
            initialName={manual.name}
            manualId={manual.id}
          />
        </h1>
      </div>

      {/* Assignments — kogo dotyczy ta instrukcja */}
      <AssignmentsPanel
        manualId={manual.id}
        initialProductIds={manual.productAssignments.map((p) => p.productId)}
        initialCategoryAssigns={manual.categoryAssignments.map((c) => ({
          categoryId: c.categoryId,
          includeDescendants: c.includeDescendants,
        }))}
        allProducts={allProducts}
        allCategories={allCategories}
      />

      {/* Editor */}
      <Card className="overflow-hidden border-l-4 border-l-indigo-400">
        <CardHeader className="py-3 border-b">
          <CardTitle className="text-sm flex items-center gap-2">
            <div className="size-7 rounded-md bg-indigo-100 text-indigo-700 flex items-center justify-center">
              <BookOpen className="size-3.5" />
            </div>
            Treść instrukcji
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <ManualEditorPanel
            manualId={manual.id}
            initialDoc={cleanManualJson}
            initialTemplate={manual.template}
            initialPageSize={manual.pageSize}
            initialKind={manual.kind}
            initialHeaderLang={manual.headerLang}
            initialHeaderTitle={manual.headerTitle}
            initialHeaderRanges={parseHeaderRanges(manual.headerRanges)}
            initialFooterCustom={manual.footerCustom}
            initialStyle={{
              fontFamily: manual.fontFamily,
              bodyFontSize: manual.bodyFontSize,
              h1FontSize: manual.h1FontSize,
              h2FontSize: manual.h2FontSize,
              h3FontSize: manual.h3FontSize,
              logoImageUrl: manual.logoImageUrl,
              logoHeightPt: manual.logoHeightPt,
              coverSubtitle: manual.coverSubtitle,
            }}
            companyWebsiteUrl={manual.company?.websiteUrl ?? null}
            productImages={productImages}
          />
        </CardContent>
      </Card>
    </div>
  );
}
