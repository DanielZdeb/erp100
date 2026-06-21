import { recomputeBlatPricesAction } from "@/server/blat-prices";

export const dynamic = "force-dynamic";

export default async function PrzeliczBlatyPage({
  searchParams,
}: {
  searchParams: Promise<{ go?: string; margin?: string }>;
}) {
  const sp = await searchParams;
  const target = sp.margin ? parseFloat(sp.margin) : 0.3;

  if (sp.go !== "1") {
    return (
      <div className="p-8 space-y-4">
        <h1 className="text-2xl font-bold">Przelicz ceny blatów</h1>
        <p>
          Klik linka żeby przeliczyć ceny sprzedaży sklep dla wszystkich blatów
          tak, żeby marża wynosiła <strong>{(target * 100).toFixed(0)}%</strong>{" "}
          po uwzględnieniu: zakupu, kuriera, magazynu, paczki i prowizji.
        </p>
        <a
          href={`/produkty/przelicz-blaty?go=1&margin=${target}`}
          className="inline-flex items-center rounded-md bg-emerald-600 text-white px-4 py-2 hover:bg-emerald-700"
        >
          Przelicz teraz (marża {(target * 100).toFixed(0)}%)
        </a>
      </div>
    );
  }

  const result = await recomputeBlatPricesAction(target);

  return (
    <div className="p-8 space-y-4">
      <h1 className="text-2xl font-bold">Wynik przeliczania blatów</h1>
      <div className="flex gap-6 text-sm">
        <div>
          Zaktualizowano: <strong>{result.updated}</strong>
        </div>
        <div>
          Pominięto (brak pudła): <strong>{result.skipped}</strong>
        </div>
        <div>
          Target marża: <strong>{(target * 100).toFixed(1)}%</strong>
        </div>
      </div>
      <table className="w-full text-xs border-collapse">
        <thead className="bg-slate-100">
          <tr>
            <th className="text-left p-2">Produkt</th>
            <th className="text-right p-2">Zakup brutto</th>
            <th className="text-right p-2">Kurier</th>
            <th className="text-right p-2">Paczka</th>
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
                {r.purchase.toFixed(2)}
              </td>
              <td className="text-right tabular-nums p-2 text-blue-700">
                {r.shipping.toFixed(2)}
              </td>
              <td className="text-right tabular-nums p-2">{r.box.toFixed(2)}</td>
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
