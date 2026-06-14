import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, ExternalLink, FileText, Layers, Package } from "lucide-react";

import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function InstrukcjaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const companyId = await getCurrentCompanyId();

  const product = await db.product.findFirst({
    where: { id, companyId },
    select: { id: true, name: true, categoryId: true },
  });
  if (!product) notFound();

  // Lookup instrukcji: bezpośrednio przypisanych + odziedziczonych z kategorii
  // (i kategorii nadrzędnych, gdy includeDescendants=true). Zbieramy ścieżkę
  // kategorii (kategoria + przodkowie).
  const categoryPath: string[] = [];
  if (product.categoryId) {
    let cur: string | null = product.categoryId;
    for (let i = 0; i < 20 && cur; i++) {
      categoryPath.push(cur);
      const node: { parentId: string | null } | null =
        await db.category.findUnique({
          where: { id: cur },
          select: { parentId: true },
        });
      cur = node?.parentId ?? null;
    }
  }

  // Bezpośrednie przypisania (manualProductAssignments)
  const direct = await db.productManualProduct.findMany({
    where: { productId: product.id, manual: { archived: false } },
    select: {
      manual: {
        select: {
          id: true,
          name: true,
          template: true,
          pageSize: true,
          updatedAt: true,
        },
      },
    },
  });

  // Przypisania kategoryjne — dla aktualnej kategorii + każdej nadrzędnej.
  // Dla aktualnej kategorii bierzemy wszystkie przypisania. Dla nadrzędnych
  // tylko te z includeDescendants=true (bo inaczej nie sięgają potomków).
  const categoryAssigns =
    categoryPath.length > 0
      ? await db.productManualCategory.findMany({
          where: {
            manual: { archived: false },
            OR: [
              // Aktualna kategoria — wszystkie przypisania
              ...(product.categoryId
                ? [{ categoryId: product.categoryId }]
                : []),
              // Nadrzędne — tylko z includeDescendants
              ...categoryPath
                .slice(1)
                .map((cid) => ({ categoryId: cid, includeDescendants: true })),
            ],
          },
          select: {
            manual: {
              select: {
                id: true,
                name: true,
                template: true,
                pageSize: true,
                updatedAt: true,
              },
            },
            category: { select: { id: true, name: true } },
            includeDescendants: true,
          },
        })
      : [];

  // Dedup po manual.id (jeśli ta sama instrukcja przypisana 2x różnymi ścieżkami)
  const byId = new Map<
    string,
    {
      manual: (typeof direct)[number]["manual"];
      source: "direct" | "category";
      sourceLabel?: string;
    }
  >();
  for (const d of direct) {
    byId.set(d.manual.id, { manual: d.manual, source: "direct" });
  }
  for (const c of categoryAssigns) {
    if (byId.has(c.manual.id)) continue;
    byId.set(c.manual.id, {
      manual: c.manual,
      source: "category",
      sourceLabel: c.category.name,
    });
  }
  const manuals = Array.from(byId.values());

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-heading font-semibold flex items-center gap-2">
            <BookOpen className="size-4 text-indigo-600" />
            Przypisane instrukcje obsługi
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Instrukcje są dokumentami niezależnymi od produktów. Możesz je
            tworzyć i przypisywać w zakładce „Instrukcje".
          </p>
        </div>
        <Link
          href="/produkty/instrukcje"
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "gap-1.5",
          )}
        >
          <ExternalLink className="size-3.5" />
          Zarządzaj instrukcjami
        </Link>
      </div>

      {manuals.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground space-y-3">
          <BookOpen className="size-8 mx-auto opacity-30" />
          <div>
            <p>Do tego produktu nie jest przypisana żadna instrukcja.</p>
            <p className="text-[11px] mt-1">
              Przejdź do{" "}
              <Link
                href="/produkty/instrukcje"
                className="text-indigo-700 hover:underline font-medium"
              >
                Instrukcje
              </Link>{" "}
              żeby utworzyć nową i przypisać do tego produktu (bezpośrednio
              albo przez kategorię).
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {manuals.map(({ manual: m, source, sourceLabel }) => (
            <Card
              key={m.id}
              className="overflow-hidden border-l-4 border-l-indigo-400"
            >
              <CardHeader className="py-3 border-b">
                <CardTitle className="text-sm flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="size-7 rounded-md bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                      <FileText className="size-3.5" />
                    </div>
                    <span className="truncate">{m.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {source === "direct" ? (
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-amber-800 bg-amber-100 ring-1 ring-amber-200 px-1.5 py-0.5 rounded">
                        <Package className="size-3" />
                        Bezpośrednio
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-violet-800 bg-violet-100 ring-1 ring-violet-200 px-1.5 py-0.5 rounded"
                        title={`Dziedziczone z kategorii „${sourceLabel}"`}
                      >
                        <Layers className="size-3" />
                        Z kategorii
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {m.pageSize} · {m.template}
                    </span>
                    <Link
                      href={`/produkty/instrukcje/${m.id}`}
                      className={cn(
                        buttonVariants({ variant: "outline", size: "sm" }),
                        "h-7 text-xs gap-1",
                      )}
                    >
                      <ExternalLink className="size-3" />
                      Edytuj
                    </Link>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <iframe
                  src={`/api/instrukcje/${m.id}/pdf#toolbar=1&navpanes=0&view=FitH`}
                  className="w-full bg-slate-100 border-0"
                  style={{ height: "70vh" }}
                  title={`Podgląd instrukcji ${m.name}`}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
