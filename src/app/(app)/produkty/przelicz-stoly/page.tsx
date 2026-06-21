import { recomputeTableBundlePricesAction } from "@/server/table-bundle-prices";

export const dynamic = "force-dynamic";

export default async function PrzeliczStolyPage({
  searchParams,
}: {
  searchParams: Promise<{ go?: string; margin?: string }>;
}) {
  const sp = await searchParams;
  const target = sp.margin ? parseFloat(sp.margin) : 0.5;

  if (sp.go !== "1") {
    return (
      <div className="p-8 space-y-4">
        <h1 className="text-2xl font-bold">Przelicz ceny zestawów stołowych</h1>
        <p className="text-sm text-slate-600 max-w-2xl">
          Klik linka żeby przeliczyć ceny sprzedaży sklep dla wszystkich
          zestawów stołowych (compositionMode=ZESTAW, nazwa „Zestaw stół…") tak,
          żeby marża wynosiła <strong>{(target * 100).toFixed(0)}%</strong>.
          <br />
          <br />
          Koszt zestawu = suma kosztów komponentów (rekursywnie) + magazyn.
          Wysyłka kuriera pomijana (zestawy idą paletą, klient płaci wysyłkę
          osobno).
        </p>
        <a
          href={`/produkty/przelicz-stoly?go=1&margin=${target}`}
          className="inline-flex items-center rounded-md bg-emerald-600 text-white px-4 py-2 hover:bg-emerald-700"
        >
          Przelicz teraz (marża {(target * 100).toFixed(0)}%)
        </a>
      </div>
    );
  }

  const result = await recomputeTableBundlePricesAction(target);

  return (
    <div className="p-8 space-y-4">
      <h1 className="text-2xl font-bold">Wynik przeliczania zestawów</h1>
      <div className="flex gap-6 text-sm">
        <div>
          Zaktualizowano: <strong>{result.updated}</strong>
        </div>
        <div>
          Pominięto (brak kosztu): <strong>{result.skipped}</strong>
        </div>
        <div>
          Target marża: <strong>{(target * 100).toFixed(1)}%</strong>
        </div>
      </div>
      <table className="w-full text-xs border-collapse">
        <thead className="bg-slate-100">
          <tr>
            <th className="text-left p-2">Zestaw</th>
            <th className="text-right p-2">Koszt brutto</th>
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
