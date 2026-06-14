import Link from "next/link";
import { ArrowLeft, BookOpen, FileText, Layers, Package } from "lucide-react";

import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { NewManualButton } from "./_components/new-manual-button";
import { ManualRowActions } from "./_components/manual-row-actions";

export const dynamic = "force-dynamic";

export default async function InstrukcjePage() {
  const companyId = await getCurrentCompanyId();

  const [manuals, allProducts, allCategories] = await Promise.all([
    db.productManual.findMany({
      where: { companyId, archived: false },
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        template: true,
        pageSize: true,
        updatedAt: true,
        manualJson: true,
        fontFamily: true,
        bodyFontSize: true,
        h1FontSize: true,
        h2FontSize: true,
        h3FontSize: true,
        productAssignments: {
          select: {
            product: { select: { id: true, name: true, productCode: true } },
          },
        },
        categoryAssignments: {
          select: {
            includeDescendants: true,
            category: { select: { id: true, name: true } },
          },
        },
      },
    }),
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

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/produkty"
            className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1"
          >
            <ArrowLeft className="size-3" />
            Produkty i komponenty
          </Link>
          <h1 className="text-3xl font-heading font-bold tracking-tight mt-1 inline-flex items-center gap-2">
            <BookOpen className="size-7 text-indigo-600" />
            Instrukcje
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Katalog instrukcji obsługi. Przypisuj do produktów lub kategorii —
            instrukcja automatycznie pojawi się w karcie każdego pasującego
            produktu (z dziedziczeniem przez podkategorie).
          </p>
        </div>
        <NewManualButton />
      </div>

      <Card>
        {manuals.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Brak instrukcji. Kliknij „Nowa instrukcja" żeby utworzyć pierwszą.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nazwa</TableHead>
                <TableHead className="tabular-nums">Format</TableHead>
                <TableHead>Krój</TableHead>
                <TableHead className="tabular-nums text-center" title="Body text">
                  Text
                </TableHead>
                <TableHead className="tabular-nums text-center" title="Heading 1">
                  H1
                </TableHead>
                <TableHead className="tabular-nums text-center" title="Heading 2">
                  H2
                </TableHead>
                <TableHead className="tabular-nums text-center" title="Heading 3">
                  H3
                </TableHead>
                <TableHead className="tabular-nums">Stron</TableHead>
                <TableHead>Przypisania</TableHead>
                <TableHead>Zmieniono</TableHead>
                <TableHead className="w-[1%]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {manuals.map((m) => {
                const pagesCount =
                  m.manualJson &&
                  typeof m.manualJson === "object" &&
                  Array.isArray(
                    (m.manualJson as { pages?: unknown[] }).pages,
                  )
                    ? ((m.manualJson as { pages: unknown[] })
                        .pages as unknown[]).length
                    : 0;

                // Hover tooltip: lista nazw produktów + kategorii
                const productNames = m.productAssignments
                  .map((p) => `· ${p.product.name} (${p.product.productCode})`)
                  .join("\n");
                const categoryNames = m.categoryAssignments
                  .map(
                    (c) =>
                      `· ${c.category.name}${c.includeDescendants ? " + podkategorie" : ""}`,
                  )
                  .join("\n");
                const assignTooltip =
                  [
                    productNames && `PRODUKTY:\n${productNames}`,
                    categoryNames && `KATEGORIE:\n${categoryNames}`,
                  ]
                    .filter(Boolean)
                    .join("\n\n") || "Brak przypisań";

                // Defaultowe rozmiary fontów per format (matching PAGE_PROFILES
                // w manual-pdf.tsx) — pokazujemy je gdy user nie ustawił własnego
                // override'a. „auto" pokazuje ile actually będzie użyte w PDF.
                const defaultsByFormat: Record<
                  string,
                  { body: number; h1: number; h2: number; h3: number }
                > = {
                  A4: { body: 11, h1: 22, h2: 16, h3: 13 },
                  A5: { body: 10, h1: 17, h2: 13, h3: 11 },
                  A6: { body: 9, h1: 14, h2: 11, h3: 10 },
                };
                const def =
                  defaultsByFormat[m.pageSize] ?? defaultsByFormat.A5;
                const showPt = (val: number | null, fallback: number) =>
                  val != null ? `${val}` : `${fallback}`;
                const isOverridden = (val: number | null) => val != null;

                return (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/produkty/instrukcje/${m.id}`}
                        className="text-indigo-700 hover:underline inline-flex items-center gap-1.5"
                      >
                        <FileText className="size-3.5" />
                        {m.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-[11px] tabular-nums">
                      <span className="font-bold uppercase tracking-wide text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
                        {m.pageSize}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span
                        className="text-[11px] font-medium text-slate-700 truncate max-w-[110px] inline-block"
                        style={{ fontFamily: m.fontFamily ?? undefined }}
                        title={m.fontFamily ?? "Roboto (default)"}
                      >
                        {m.fontFamily ?? "Roboto"}
                      </span>
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-[11px] tabular-nums text-center",
                        isOverridden(m.bodyFontSize)
                          ? "text-slate-900 font-semibold"
                          : "text-slate-400",
                      )}
                      title={
                        isOverridden(m.bodyFontSize)
                          ? "Custom override"
                          : `Default dla ${m.pageSize}`
                      }
                    >
                      {showPt(m.bodyFontSize, def.body)}pt
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-[11px] tabular-nums text-center",
                        isOverridden(m.h1FontSize)
                          ? "text-slate-900 font-semibold"
                          : "text-slate-400",
                      )}
                      title={
                        isOverridden(m.h1FontSize)
                          ? "Custom override"
                          : `Default dla ${m.pageSize}`
                      }
                    >
                      {showPt(m.h1FontSize, def.h1)}pt
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-[11px] tabular-nums text-center",
                        isOverridden(m.h2FontSize)
                          ? "text-slate-900 font-semibold"
                          : "text-slate-400",
                      )}
                      title={
                        isOverridden(m.h2FontSize)
                          ? "Custom override"
                          : `Default dla ${m.pageSize}`
                      }
                    >
                      {showPt(m.h2FontSize, def.h2)}pt
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-[11px] tabular-nums text-center",
                        isOverridden(m.h3FontSize)
                          ? "text-slate-900 font-semibold"
                          : "text-slate-400",
                      )}
                      title={
                        isOverridden(m.h3FontSize)
                          ? "Custom override"
                          : `Default dla ${m.pageSize}`
                      }
                    >
                      {showPt(m.h3FontSize, def.h3)}pt
                    </TableCell>
                    <TableCell className="tabular-nums text-slate-600">
                      {pagesCount || "—"}
                    </TableCell>
                    <TableCell>
                      <div
                        className="flex items-center gap-2 text-[11px] cursor-help"
                        title={assignTooltip}
                      >
                        {m.productAssignments.length > 0 && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 ring-1 ring-amber-200">
                            <Package className="size-3" />
                            {m.productAssignments.length}
                          </span>
                        )}
                        {m.categoryAssignments.length > 0 && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-violet-50 text-violet-800 ring-1 ring-violet-200">
                            <Layers className="size-3" />
                            {m.categoryAssignments.length}
                          </span>
                        )}
                        {m.productAssignments.length === 0 &&
                          m.categoryAssignments.length === 0 && (
                            <span className="text-muted-foreground italic">
                              — brak
                            </span>
                          )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground tabular-nums">
                      {new Date(m.updatedAt).toLocaleDateString("pl-PL")}
                    </TableCell>
                    <TableCell>
                      <ManualRowActions
                        id={m.id}
                        name={m.name}
                        currentProductIds={m.productAssignments.map(
                          (p) => p.product.id,
                        )}
                        currentCategoryAssigns={m.categoryAssignments.map(
                          (c) => ({
                            categoryId: c.category.id,
                            includeDescendants: c.includeDescendants,
                          }),
                        )}
                        allProducts={allProducts}
                        allCategories={allCategories}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <Link
        href="/produkty"
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        Wróć do produktów
      </Link>
    </div>
  );
}
