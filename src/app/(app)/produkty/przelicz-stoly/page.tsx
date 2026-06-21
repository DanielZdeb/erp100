import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";
import { recomputeTableBundlePricesAction } from "@/server/table-bundle-prices";
import { PrzeliczStolyForm } from "./form";

export const dynamic = "force-dynamic";

export default async function PrzeliczStolyPage({
  searchParams,
}: {
  searchParams: Promise<{ go?: string; margin?: string; ids?: string }>;
}) {
  const sp = await searchParams;
  const target = sp.margin ? parseFloat(sp.margin) : 0.5;

  // GET form view — lista zestawow z checkboxami
  if (sp.go !== "1") {
    const companyId = await getCurrentCompanyId();
    const bundles = await db.product.findMany({
      where: {
        companyId,
        compositionMode: "ZESTAW",
        OR: [
          { name: { startsWith: "Zestaw stół" } },
          { name: { startsWith: "Zestaw stol" } },
        ],
      },
      select: {
        id: true,
        productCode: true,
        name: true,
        defaultSalePriceSklepPln: true,
        defaultUnitPricePln: true,
        category: { select: { id: true, name: true } },
      },
      orderBy: [{ category: { name: "asc" } }, { productCode: "asc" }],
    });

    // Pogrupuj per kategoria
    const byCategory = new Map<
      string,
      Array<(typeof bundles)[number]>
    >();
    for (const b of bundles) {
      const key = b.category?.name ?? "(brak kategorii)";
      const arr = byCategory.get(key) ?? [];
      arr.push(b);
      byCategory.set(key, arr);
    }
    const grouped = Array.from(byCategory.entries()).sort(([a], [b]) =>
      a.localeCompare(b, "pl"),
    );

    return <PrzeliczStolyForm grouped={grouped} initialMargin={target} />;
  }

  // POST result view — wykonaj action
  const ids = sp.ids ? sp.ids.split(",").filter(Boolean) : null;
  const result = await recomputeTableBundlePricesAction(target, ids);

  return (
    <div className="p-8 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold">Wynik przeliczania zestawów</h1>
        <a
          href="/produkty/przelicz-stoly"
          className="text-sm text-emerald-700 hover:underline"
        >
          ← Przelicz inne zestawy
        </a>
      </div>
      <div className="flex gap-6 text-sm">
        <div>
          Zaktualizowano: <strong>{result.updated}</strong>
        </div>
        <div>
          Pominięto (brak kosztu): <strong>{result.skipped}</strong>
        </div>
        <div>
          Target marża:{" "}
          <strong className="text-emerald-700">
            {(target * 100).toFixed(1)}%
          </strong>
        </div>
      </div>
      <table className="w-full text-xs border-collapse">
        <thead className="bg-slate-100">
          <tr>
            <th className="text-left p-2">Zestaw</th>
            <th className="text-right p-2">Koszt komp.</th>
            <th className="text-right p-2">Kurier</th>
            <th className="text-right p-2">Magazyn</th>
            <th className="text-right p-2">SKLEP brutto</th>
            <th className="text-right p-2">Marża fakt.</th>
          </tr>
        </thead>
        <tbody>
          {result.results.map((r) => (
            <tr key={r.code} className="border-t hover:bg-slate-50">
              <td className="p-2">
                <div className="font-medium">{r.name}</div>
                <div className="text-[10px] text-slate-500">{r.code}</div>
              </td>
              <td className="text-right tabular-nums p-2">
                {r.cost.toFixed(2)}
              </td>
              <td className="text-right tabular-nums p-2 text-blue-700">
                {r.shipping.toFixed(2)}
              </td>
              <td className="text-right tabular-nums p-2">
                {r.warehouse.toFixed(2)}
              </td>
              <td className="text-right tabular-nums p-2 font-bold text-emerald-700">
                {r.saleBrutto} zł
              </td>
              <td className="text-right tabular-nums p-2 font-semibold">
                {(r.margin * 100).toFixed(1)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
