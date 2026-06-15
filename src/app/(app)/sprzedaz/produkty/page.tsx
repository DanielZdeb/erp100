/**
 * Lista produktów w widoku Sprzedażowym.
 *
 * BEZ CEN — tylko dane prezentacyjne (Grafika, Nazwa, Kategoria, SKU, EAN,
 * Kolor + Kod, Waga, Szablon opisu).
 *
 * Klik na wiersz → `/sprzedaz/produkty/[id]` (karta sprzedażowa).
 */
import Link from "next/link";
import { Package, Layers } from "lucide-react";

import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function SprzedazProduktyPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const companyId = await getCurrentCompanyId();

  const products = await db.product.findMany({
    where: {
      companyId,
      archived: false,
      isComponent: false,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { productCode: { contains: q, mode: "insensitive" as const } },
              { eanCode: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: [{ compositionMode: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      productCode: true,
      eanCode: true,
      color: true,
      colorCode: true,
      weightKg: true,
      compositionMode: true,
      category: { select: { name: true } },
      images: {
        where: { archived: false, status: "READY" },
        orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
        take: 1,
        select: { url: true, thumbnailWebpUrl: true, alt: true },
      },
      descriptionTemplate: { select: { id: true, name: true } },
    },
  });

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-4">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="text-[11px] uppercase tracking-wide font-bold text-emerald-700">
            Sprzedaż
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Produkty</h1>
          <p className="text-sm text-slate-600 max-w-2xl">
            Lista produktów i zestawów (bez cen). Klik wiersza → karta
            sprzedażowa z grafikami i opisem.
          </p>
        </div>
        <form className="flex gap-2 max-w-md w-full">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Szukaj po nazwie / SKU / EAN..."
            className="flex-1 px-3 py-1.5 text-sm rounded-md ring-1 ring-slate-200 focus:ring-2 focus:ring-emerald-400 outline-none"
          />
          <button
            type="submit"
            className="px-3 py-1.5 text-sm rounded-md bg-slate-900 text-white hover:bg-slate-700"
          >
            Szukaj
          </button>
        </form>
      </header>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-600 uppercase tracking-wide text-[10px]">
              <tr>
                <th className="text-left px-3 py-2 w-12">Grafika</th>
                <th className="text-left px-2 py-2">Nazwa</th>
                <th className="text-left px-2 py-2">Kategoria</th>
                <th className="text-left px-2 py-2 font-mono">SKU</th>
                <th className="text-left px-2 py-2 font-mono">EAN</th>
                <th className="text-left px-2 py-2">Kolor + Kod</th>
                <th className="text-right px-2 py-2">Waga</th>
                <th className="text-left px-2 py-2">Szablon opisu</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-10 text-center text-slate-500"
                  >
                    Brak produktów {q ? "pasujących do wyszukiwania" : ""}.
                  </td>
                </tr>
              ) : (
                products.map((p) => (
                  <tr
                    key={p.id}
                    className="border-t border-slate-100 hover:bg-emerald-50/30 transition-colors"
                  >
                    <td className="px-3 py-2 align-middle">
                      <Link
                        href={`/sprzedaz/produkty/${p.id}`}
                        className="block"
                      >
                        {p.images[0] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.images[0].thumbnailWebpUrl ?? p.images[0].url}
                            alt={p.images[0].alt ?? p.name}
                            width={36}
                            height={36}
                            loading="lazy"
                            className="size-9 rounded object-cover ring-1 ring-slate-200"
                          />
                        ) : (
                          <div className="size-9 rounded bg-muted ring-1 ring-slate-200 grid place-items-center">
                            <Package className="size-4 text-slate-300" />
                          </div>
                        )}
                      </Link>
                    </td>
                    <td className="px-2 py-2 align-middle">
                      <Link
                        href={`/sprzedaz/produkty/${p.id}`}
                        className="font-medium hover:underline"
                      >
                        {p.name}
                      </Link>
                      {p.compositionMode === "ZESTAW" && (
                        <span className="ml-1.5 inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded bg-violet-100 text-violet-700 font-semibold">
                          <Layers className="size-2.5" /> ZESTAW
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 align-middle text-slate-600">
                      {p.category?.name ?? "—"}
                    </td>
                    <td className="px-2 py-2 align-middle font-mono text-slate-700">
                      {p.productCode}
                    </td>
                    <td className="px-2 py-2 align-middle font-mono text-slate-700">
                      {p.eanCode ?? "—"}
                    </td>
                    <td className="px-2 py-2 align-middle">
                      <div className="flex flex-col leading-tight">
                        <span className="text-slate-700">{p.color ?? "—"}</span>
                        {p.colorCode ? (
                          <span className="text-[9px] font-mono text-slate-500">
                            {p.colorCode}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-2 py-2 align-middle text-right tabular-nums">
                      {p.weightKg != null ? `${p.weightKg.toFixed(2)} kg` : "—"}
                    </td>
                    <td className="px-2 py-2 align-middle">
                      {p.descriptionTemplate ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-semibold">
                          {p.descriptionTemplate.name}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[10px]">brak</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="text-[11px] text-slate-500">
        Razem: <strong>{products.length}</strong> produktów
        {q ? ` pasujących do „${q}"` : ""}
      </div>
    </div>
  );
}
