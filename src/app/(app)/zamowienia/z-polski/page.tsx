import Link from "next/link";
import { ArrowLeft, Plus, Scissors } from "lucide-react";

import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";
import { getDefaultContainerType } from "@/server/system-settings";
import { FlagPL } from "@/components/icons/country-flags";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { NewOrderDialog } from "../new-order-dialog";
import { EditOrderRowButton } from "../edit-order-dialog";
import { TemplateSectionsEditor } from "../../ustawienia/szablony-zamowien/template-sections-editor";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  PLANOWANE: "Planowane",
  DOGADYWANE: "Dogadywane",
  PRODUKOWANE: "Produkowane",
  WYPRODUKOWANE: "Wyprodukowane",
  WYSLANE: "Wysłane",
  ODEBRANE: "Odebrane",
  W_MAGAZYNIE: "W magazynie",
};

const STATUS_COLOR: Record<string, string> = {
  PLANOWANE: "bg-slate-100 text-slate-700",
  DOGADYWANE: "bg-amber-100 text-amber-800",
  PRODUKOWANE: "bg-blue-100 text-blue-800",
  WYPRODUKOWANE: "bg-cyan-100 text-cyan-800",
  WYSLANE: "bg-violet-100 text-violet-800",
  ODEBRANE: "bg-indigo-100 text-indigo-800",
  W_MAGAZYNIE: "bg-emerald-100 text-emerald-800",
};

export default async function ZamowieniaPolskaPage() {
  const companyId = await getCurrentCompanyId();
  const [orders, defaultContainerType, templateSections] = await Promise.all([
    db.importOrder.findMany({
      where: { companyId, country: "POLAND" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        orderNumber: true,
        name: true,
        notes: true,
        status: true,
        createdAt: true,
        items: {
          select: {
            quantity: true,
            unitPriceUsd: true,
            unitPriceCny: true,
            cnyToPlnRate: true,
            usdToPlnRate: true,
          },
        },
        costs: { select: { type: true, amountPln: true } },
      },
    }),
    getDefaultContainerType(),
    db.orderTemplateSection.findMany({
      where: { companyId, kind: "MATERIAL_SZARFY" },
      orderBy: { sortOrder: "asc" },
      include: { images: { orderBy: { sortOrder: "asc" } } },
    }),
  ]);

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link
            href="/zamowienia"
            className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1"
          >
            <ArrowLeft className="size-3" />
            Zamówienia z Chin
          </Link>
          <h1 className="text-3xl font-heading font-bold tracking-tight mt-1 inline-flex items-center gap-2">
            <FlagPL className="size-7" />
            Zamówienia z Polski
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Produkcja w Polsce — bez cła i prowizji. Koszty cięcia i krojenia
            dzielone proporcjonalnie po liczbie sztuk pozycji.
          </p>
        </div>
        <NewOrderDialog
          defaultContainerType={defaultContainerType}
          defaultCountry="POLAND"
        >
          <Plus className="size-4" />
          Nowe zamówienie z Polski
        </NewOrderDialog>
      </div>

      {/* Szablon wytycznych — auto-kopiowany do każdego nowego zamówienia PL.
          Collapsible <details> żeby nie zaśmiecać listy zamówień. */}
      <details className="group rounded-xl ring-1 ring-cyan-200 bg-gradient-to-br from-cyan-50/70 to-white shadow-sm overflow-hidden">
        <summary className="cursor-pointer list-none px-5 py-3 flex items-center gap-3 hover:bg-cyan-50/50 transition-colors">
          <div className="size-9 rounded-lg bg-cyan-500 text-white grid place-items-center shadow-sm">
            <Scissors className="size-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-cyan-900 inline-flex items-center gap-2">
              Szablon wytycznych — Materiał na szarfy
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-700">
                {templateSections.length}{" "}
                {templateSections.length === 1 ? "sekcja" : "sekcji"}
              </span>
            </div>
            <p className="text-xs text-cyan-700/80 mt-0.5">
              Domyślne sekcje PDF kopiowane do każdego nowego zamówienia tego
              rodzaju. Kliknij, by edytować.
            </p>
          </div>
          <span className="text-xs text-cyan-700 group-open:hidden">
            Rozwiń ▾
          </span>
          <span className="text-xs text-cyan-700 hidden group-open:inline">
            Zwiń ▴
          </span>
        </summary>
        <div className="border-t border-cyan-200 p-4 bg-white space-y-4">
          <section>
            <h3 className="text-sm font-semibold mb-2 inline-flex items-center gap-2 px-2 py-1 rounded bg-amber-100 text-amber-900">
              Zamówienie Fabryka
            </h3>
            <TemplateSectionsEditor
              kind="MATERIAL_SZARFY"
              target="FABRYKA"
              initialSections={templateSections
                .filter((s) => s.target === "FABRYKA")
                .map((s) => ({
                  id: s.id,
                  title: s.title,
                  content: s.content ?? null,
                  sortOrder: s.sortOrder,
                  images: s.images.map((i) => ({
                    id: i.id,
                    url: i.url,
                    alt: i.alt ?? null,
                    sortOrder: i.sortOrder,
                  })),
                }))}
            />
          </section>
          <section>
            <h3 className="text-sm font-semibold mb-2 inline-flex items-center gap-2 px-2 py-1 rounded bg-indigo-100 text-indigo-900">
              Zamówienie Szwalnia
            </h3>
            <TemplateSectionsEditor
              kind="MATERIAL_SZARFY"
              target="KRAJALNIA"
              initialSections={templateSections
                .filter((s) => s.target === "KRAJALNIA")
                .map((s) => ({
                  id: s.id,
                  title: s.title,
                  content: s.content ?? null,
                  sortOrder: s.sortOrder,
                  images: s.images.map((i) => ({
                    id: i.id,
                    url: i.url,
                    alt: i.alt ?? null,
                    sortOrder: i.sortOrder,
                  })),
                }))}
            />
          </section>
        </div>
      </details>

      <Card>
        {orders.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Brak zamówień z Polski. Kliknij „Nowe zamówienie z Polski" żeby
            utworzyć pierwsze.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Numer</TableHead>
                <TableHead>Nazwa</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right tabular-nums">
                  Pozycji
                </TableHead>
                <TableHead className="text-right tabular-nums">
                  Łącznie szt.
                </TableHead>
                <TableHead className="text-right tabular-nums">
                  Cięcie + Krojenie
                </TableHead>
                <TableHead>Utworzono</TableHead>
                <TableHead className="w-8"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o) => {
                const totalQty = o.items.reduce(
                  (s, i) => s + i.quantity,
                  0,
                );
                const cutCosts = o.costs
                  .filter(
                    (c) => c.type === "CIECIE" || c.type === "KROJENIE",
                  )
                  .reduce((s, c) => s + c.amountPln, 0);
                return (
                  <TableRow key={o.id} className="hover:bg-muted/30">
                    <TableCell className="font-mono text-xs">
                      <Link
                        href={`/zamowienia/z-polski/${o.id}`}
                        className="text-indigo-700 hover:underline"
                      >
                        {o.orderNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">
                      {o.name ? (
                        <Link
                          href={`/zamowienia/z-polski/${o.id}`}
                          className="hover:underline"
                        >
                          {o.name}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground italic">
                          —
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={`text-[10px] ${STATUS_COLOR[o.status] ?? ""}`}
                      >
                        {STATUS_LABEL[o.status] ?? o.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-xs">
                      {o.items.length}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-xs">
                      {totalQty.toLocaleString("pl-PL")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-xs">
                      {cutCosts > 0
                        ? `${cutCosts.toLocaleString("pl-PL", {
                            maximumFractionDigits: 0,
                          })} zł`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground tabular-nums">
                      {new Date(o.createdAt).toLocaleDateString("pl-PL")}
                    </TableCell>
                    <TableCell className="px-1 text-right">
                      <EditOrderRowButton
                        order={{
                          id: o.id,
                          orderNumber: o.orderNumber,
                          name: o.name,
                          notes: o.notes,
                        }}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
