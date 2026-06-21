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
    const presets = [0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6];
    return (
      <div className="p-8 space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold">
            Przelicz ceny zestawów stołowych
          </h1>
          <p className="text-sm text-slate-600 mt-2">
            Ustaw target marży, system przeliczy ceny sprzedaży sklep dla
            wszystkich zestawów stołowych (compositionMode=ZESTAW, nazwa „Zestaw
            stół…").
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Koszt zestawu = suma kosztów komponentów (rekursywnie) + magazyn.
            Wysyłka kuriera pomijana (zestawy idą paletą — klient płaci wysyłkę
            osobno).
          </p>
        </div>

        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            Wybierz target marży:
          </div>
          <div className="grid grid-cols-3 gap-2">
            {presets.map((p) => (
              <a
                key={p}
                href={`/produkty/przelicz-stoly?go=1&margin=${p}`}
                className={`text-center rounded-md px-4 py-3 font-semibold transition-colors ring-1 ${
                  p === 0.5
                    ? "bg-emerald-600 text-white ring-emerald-600 hover:bg-emerald-700"
                    : p >= 0.4
                      ? "bg-emerald-50 text-emerald-800 ring-emerald-200 hover:bg-emerald-100"
                      : p >= 0.3
                        ? "bg-amber-50 text-amber-800 ring-amber-200 hover:bg-amber-100"
                        : "bg-rose-50 text-rose-800 ring-rose-200 hover:bg-rose-100"
                }`}
              >
                {(p * 100).toFixed(0)}%
              </a>
            ))}
          </div>
        </div>

        <form
          method="GET"
          className="space-y-2 pt-4 border-t"
        >
          <input type="hidden" name="go" value="1" />
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            Lub wpisz własną marżę:
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              name="margin"
              step="0.01"
              min="0.01"
              max="0.99"
              defaultValue="0.4"
              placeholder="0.40"
              className="w-32 px-3 py-2 rounded-md ring-1 ring-slate-300 focus:ring-2 focus:ring-emerald-400 outline-none text-sm tabular-nums"
            />
            <span className="text-xs text-slate-500">
              (np. 0.40 dla 40%, 0.42 dla 42%)
            </span>
            <button
              type="submit"
              className="ml-auto bg-slate-900 text-white rounded-md px-4 py-2 text-sm font-semibold hover:bg-slate-700"
            >
              Przelicz
            </button>
          </div>
        </form>
      </div>
    );
  }

  const result = await recomputeTableBundlePricesAction(target);

  return (
    <div className="p-8 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold">Wynik przeliczania zestawów</h1>
        <a
          href="/produkty/przelicz-stoly"
          className="text-sm text-emerald-700 hover:underline"
        >
          ← Przelicz z inną marżą
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
