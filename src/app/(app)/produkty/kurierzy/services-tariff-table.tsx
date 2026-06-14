import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { CourierLogo } from "../[id]/_components/courier-logos";

/** Statyczna referencyjna tabela cennika z umów. Wartości zsynchronizowane
    ręcznie z `src/lib/courier-pricing/inpost.ts` i `dhl.ts`. */
export function ServicesTariffTable() {
  return (
    <div className="space-y-6">
      {/* InPost */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 py-3 border-b">
          <CardTitle className="text-base flex items-center gap-2">
            <div className="size-9 rounded ring-1 ring-border bg-white overflow-hidden flex items-center justify-center">
              <CourierLogo brand="INPOST" className="w-full h-auto" />
            </div>
            InPost — umowa #55161178
          </CardTitle>
          <span className="text-[10px] text-muted-foreground">
            Opłata paliwowa: Paczkomat 13%, Kurier 8%
          </span>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          {/* Paczkomat */}
          <div>
            <h3 className="text-sm font-medium mb-2">Paczkomat 24/7</h3>
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="text-left px-2 py-1.5">Gabaryt</th>
                  <th className="text-left px-2 py-1.5">Wymiary max (cm)</th>
                  <th className="text-right px-2 py-1.5">Waga max (kg)</th>
                  <th className="text-right px-2 py-1.5">Cena netto</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <Row label="A" dims="8 × 38 × 64" wMax="25" pln="8.43" />
                <Row label="B" dims="19 × 38 × 64" wMax="25" pln="8.53" />
                <Row label="C" dims="41 × 38 × 64" wMax="25" pln="8.84" />
              </tbody>
            </table>
          </div>

          {/* Kurier */}
          <div>
            <h3 className="text-sm font-medium mb-2">Kurier Standard</h3>
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="text-left px-2 py-1.5">Waga rzecz./gabarytowa</th>
                  <th className="text-right px-2 py-1.5">Cena netto</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <Row label="do 10 kg" pln="8.73" />
                <Row label="10–20 kg" pln="10.39" />
                <Row label="20–30 kg" pln="11.26" />
                <Row label="30–40 kg" pln="86.81" />
                <Row label="40–50 kg" pln="104.84" />
              </tbody>
            </table>
            <p className="text-[10px] text-muted-foreground mt-1.5">
              Dłużycowy (jeden wymiar &gt; 120 cm): +100 zł netto/paczkę.
              Niestandardowa: +22 zł netto/paczkę. Ponadgabarytowa (&gt; 500×500×800 mm
              lub &gt; 30 kg): +253.74 zł.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* DHL */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 py-3 border-b">
          <CardTitle className="text-base flex items-center gap-2">
            <div className="size-9 rounded ring-1 ring-border bg-white overflow-hidden flex items-center justify-center">
              <CourierLogo brand="DHL" className="w-full h-auto" />
            </div>
            DHL eCommerce — oferta #909575
          </CardTitle>
          <span className="text-[10px] text-muted-foreground">
            Opłata paliwowa: 24.5% · Waga przestrzenna: LWH/4000
          </span>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          <div>
            <h3 className="text-sm font-medium mb-2">Standard (do 31.5 kg)</h3>
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="text-left px-2 py-1.5">Waga (kg)</th>
                  <th className="text-right px-2 py-1.5">Polska</th>
                  <th className="text-right px-2 py-1.5">Premium</th>
                  <th className="text-right px-2 py-1.5">Parcel 9</th>
                  <th className="text-right px-2 py-1.5">Parcel 12</th>
                  <th className="text-right px-2 py-1.5">Economy (POP)</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <DhlRow w="do 1 kg" polska="9.75" premium="12.10" p9="27.50" p12="18.00" econ="7.15" />
                <DhlRow w="do 3 kg" polska="9.95" premium="12.30" p9="28.00" p12="18.50" econ="7.35" />
                <DhlRow w="do 5 kg" polska="10.35" premium="12.70" p9="29.00" p12="19.00" econ="7.75" />
                <DhlRow w="do 10 kg" polska="11.75" premium="14.10" p9="33.00" p12="21.50" econ="8.85" />
                <DhlRow w="do 20 kg" polska="13.75" premium="16.10" p9="38.50" p12="25.00" econ="10.55" />
                <DhlRow w="do 31.5 kg" polska="14.95" premium="17.30" p9="42.00" p12="27.25" econ="11.55*" />
              </tbody>
            </table>
            <p className="text-[10px] text-muted-foreground mt-1.5">
              <strong>Rabat wieloelementowy</strong> (Polska/Premium): 2–5 elementów
              −15%, 6–10 elementów −25%, 11–15 elementów −35%. Max 15 elementów,
              max długość 2 m.
              <br />*Economy max 25 kg, wymiary 64×38×41 cm — POP / Locker.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-medium mb-2">MAX (powyżej 31.5 kg)</h3>
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="text-left px-2 py-1.5">Waga (kg)</th>
                  <th className="text-right px-2 py-1.5">Paczka</th>
                  <th className="text-right px-2 py-1.5">Półpaleta</th>
                  <th className="text-right px-2 py-1.5">Paleta</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <MaxRow w="do 40 kg" paczka="50.00" polpaleta="73.99" paleta="94.90" />
                <MaxRow w="do 50 kg" paczka="55.00" polpaleta="75.00" paleta="95.89" />
                <MaxRow w="do 100 kg" paczka="—" polpaleta="84.00" paleta="109.89" />
                <MaxRow w="do 200 kg" paczka="—" polpaleta="99.00" paleta="129.90" />
                <MaxRow w="do 400 kg" paczka="—" polpaleta="—" paleta="139.90" />
                <MaxRow w="do 600 kg" paczka="—" polpaleta="—" paleta="159.91" />
                <MaxRow w="do 800 kg" paczka="—" polpaleta="—" paleta="169.90" />
                <MaxRow w="do 1000 kg" paczka="—" polpaleta="—" paleta="179.91" />
              </tbody>
            </table>
          </div>

          <div>
            <h3 className="text-sm font-medium mb-2">Opłaty dodatkowe</h3>
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="text-left px-2 py-1.5">Usługa</th>
                  <th className="text-right px-2 py-1.5">Stawka</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <FeeRow label="Pobranie (COD), % wartości, min. 1.50 zł" v="1.50 %" />
                <FeeRow label="Ubezpieczenie do 50000 PLN" v="0.04 %" />
                <FeeRow label="Ubezpieczenie do 100000 PLN (Max)" v="0.12 %" />
                <FeeRow label="Dopłata wolumetryk (gdy w. przestrzenna > rzecz.)" v="2.00 zł/szt" />
                <FeeRow label="Dłużycowy (jeden wymiar > 120 cm)" v="85.00 zł/szt" />
                <FeeRow label="NST (niestandardowa) do 31.5 kg" v="2.00 zł/szt" />
                <FeeRow label="NST powyżej 31.5 kg (Max)" v="5.50 zł/szt" />
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({
  label,
  dims,
  wMax,
  pln,
}: {
  label: string;
  dims?: string;
  wMax?: string;
  pln: string;
}) {
  return (
    <tr className="hover:bg-muted/30">
      <td className="px-2 py-1.5 font-medium">{label}</td>
      {dims && <td className="px-2 py-1.5 tabular-nums">{dims}</td>}
      {wMax && <td className="px-2 py-1.5 text-right tabular-nums">{wMax}</td>}
      <td className="px-2 py-1.5 text-right tabular-nums font-semibold">
        {pln} zł
      </td>
    </tr>
  );
}

function DhlRow({
  w,
  polska,
  premium,
  p9,
  p12,
  econ,
}: {
  w: string;
  polska: string;
  premium: string;
  p9: string;
  p12: string;
  econ: string;
}) {
  return (
    <tr className="hover:bg-muted/30">
      <td className="px-2 py-1.5 font-medium tabular-nums">{w}</td>
      <td className="px-2 py-1.5 text-right tabular-nums">{polska} zł</td>
      <td className="px-2 py-1.5 text-right tabular-nums">{premium} zł</td>
      <td className="px-2 py-1.5 text-right tabular-nums">{p9} zł</td>
      <td className="px-2 py-1.5 text-right tabular-nums">{p12} zł</td>
      <td className="px-2 py-1.5 text-right tabular-nums">{econ} zł</td>
    </tr>
  );
}

function MaxRow({
  w,
  paczka,
  polpaleta,
  paleta,
}: {
  w: string;
  paczka: string;
  polpaleta: string;
  paleta: string;
}) {
  return (
    <tr className="hover:bg-muted/30">
      <td className="px-2 py-1.5 font-medium tabular-nums">{w}</td>
      <td className="px-2 py-1.5 text-right tabular-nums">
        {paczka === "—" ? <span className="text-muted-foreground">—</span> : `${paczka} zł`}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums">
        {polpaleta === "—" ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          `${polpaleta} zł`
        )}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums">
        {paleta === "—" ? <span className="text-muted-foreground">—</span> : `${paleta} zł`}
      </td>
    </tr>
  );
}

function FeeRow({ label, v }: { label: string; v: string }) {
  return (
    <tr className="hover:bg-muted/30">
      <td className="px-2 py-1.5">{label}</td>
      <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{v}</td>
    </tr>
  );
}
