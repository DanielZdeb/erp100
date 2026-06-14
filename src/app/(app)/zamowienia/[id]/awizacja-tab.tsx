"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import JsBarcode from "jsbarcode";
import {
  Barcode,
  Building2,
  Calendar,
  CheckCircle2,
  CreditCard,
  FileArchive,
  FileSpreadsheet,
  FileText,
  Files,
  Phone,
  Printer,
  Truck,
  User,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import {
  markAwizacjaPrintedAction,
  updateAwizacjaAction,
} from "@/server/orders";

type AwizacjaData = {
  orderId: string;
  orderNumber: string;
  orderName: string | null;
  driverName: string | null;
  driverPhone: string | null;
  vehiclePlate: string | null;
  vehicleType: string | null;
  deliveryDate: Date | null;
  awizacjaNotes: string | null;
  awizacjaPrintedAt: Date | null;
};

type GoodsItem = {
  productCode: string;
  productName: string;
  color: string | null;
  eanCode: string | null;
  code128: string | null;
  quantity: number;
  cbmPerUnit: number | null;
  totalCbm: number;
  weightKg: number | null;
  category: string | null;
  /** Cena netto/szt = landed cost per unit (zakup + logistyka). Używana w PZ. */
  landedCostPerUnitPln: number;
  /** Tryb importu — "KARTON" liczy kartony, "LUZEM" pokazuje info "luzem". */
  importMode: "KARTON" | "LUZEM";
  /** Sztuk w kartonie (tylko KARTON). Null = nieuzupełnione. */
  unitsPerBox: number | null;
  /** Wymiary kartonu w cm (szer × wys × głęb). Null jeśli brak danych. */
  boxWidthCm: number | null;
  boxHeightCm: number | null;
  boxDepthCm: number | null;
};

export function AwizacjaTab({
  data,
  items,
  companyName,
  warehouseAddress,
  containerType,
  containerCount,
}: {
  data: AwizacjaData;
  items: GoodsItem[];
  companyName: string;
  warehouseAddress: string;
  containerType: "TWENTY_FT" | "FORTY_FT" | "CUSTOM";
  /** Liczba kontenerów (z calc.containerCount) — może być >1 gdy ładunek nie mieści się w jednym. */
  containerCount: number;
}) {
  const [pending, startTransition] = useTransition();
  const [driverName, setDriverName] = useState(data.driverName ?? "");
  const [driverPhone, setDriverPhone] = useState(data.driverPhone ?? "");
  // driverIdNumber — usunięte (nr dowodu/paszportu zbędny w awizacji)
  const [vehiclePlate, setVehiclePlate] = useState(data.vehiclePlate ?? "");
  const [vehicleType, setVehicleType] = useState(data.vehicleType ?? "");
  const [deliveryDate, setDeliveryDate] = useState(
    data.deliveryDate
      ? new Date(data.deliveryDate).toISOString().slice(0, 16)
      : "",
  );
  const [awizacjaNotes, setAwizacjaNotes] = useState(data.awizacjaNotes ?? "");

  function saveField(
    field: keyof Parameters<typeof updateAwizacjaAction>[1],
    value: string,
  ) {
    startTransition(async () => {
      try {
        await updateAwizacjaAction(data.orderId, { [field]: value });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się zapisać");
      }
    });
  }

  const totalQty = items.reduce((s, it) => s + it.quantity, 0);
  const totalCbm = items.reduce((s, it) => s + it.totalCbm, 0);
  const totalWeight = items.reduce(
    (s, it) => s + (it.weightKg ?? 0) * it.quantity,
    0,
  );
  const totalCartons = items.reduce((s, it) => {
    const info = describeCarton(it);
    return s + (info.cartonCount ?? 0);
  }, 0);
  const palletInfo = computePallets(
    containerType,
    items.length,
    totalCbm,
    containerCount,
  );

  const allDriverFilled =
    driverName.trim() && driverPhone.trim() && vehiclePlate.trim();

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_1fr] gap-4">
      {/* Lewa kolumna — formularz danych kierowcy + dostawa */}
      <div className="space-y-4">
        <Card className="p-0 overflow-hidden">
          <div className="px-4 py-3 border-b bg-gradient-to-r from-amber-50 to-orange-100/50 flex items-center gap-2">
            <Truck className="size-5 text-amber-700" />
            <h3 className="text-base font-heading font-semibold text-amber-900">
              Dane kierowcy i pojazdu
            </h3>
            <span className="ml-auto text-[10px] text-amber-700 uppercase tracking-wide">
              wymagane do awizacji
            </span>
          </div>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <FieldWithIcon icon={User} label="Imię i nazwisko kierowcy *">
                <Input
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  onBlur={(e) => saveField("driverName", e.target.value)}
                  placeholder="Jan Kowalski"
                  disabled={pending}
                />
              </FieldWithIcon>
              <FieldWithIcon icon={Phone} label="Telefon kierowcy *">
                <Input
                  value={driverPhone}
                  onChange={(e) => setDriverPhone(e.target.value)}
                  onBlur={(e) => saveField("driverPhone", e.target.value)}
                  placeholder="+48 600 000 000"
                  disabled={pending}
                />
              </FieldWithIcon>
              <FieldWithIcon
                icon={Calendar}
                label="Planowana data i godzina dostawy"
              >
                <Input
                  type="datetime-local"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  onBlur={(e) => saveField("deliveryDate", e.target.value)}
                  disabled={pending}
                />
              </FieldWithIcon>
              <FieldWithIcon icon={CreditCard} label="Numer rejestracyjny *">
                <Input
                  value={vehiclePlate}
                  onChange={(e) =>
                    setVehiclePlate(e.target.value.toUpperCase())
                  }
                  onBlur={(e) => saveField("vehiclePlate", e.target.value)}
                  placeholder="KR 12345"
                  className="font-mono uppercase"
                  disabled={pending}
                />
              </FieldWithIcon>
              <FieldWithIcon icon={Truck} label="Typ pojazdu">
                <Input
                  value={vehicleType}
                  onChange={(e) => setVehicleType(e.target.value)}
                  onBlur={(e) => saveField("vehicleType", e.target.value)}
                  placeholder="np. TIR, Bus 3.5t, Solo"
                  disabled={pending}
                />
              </FieldWithIcon>
            </div>
            <FieldWithIcon icon={Building2} label="Notatki / instrukcje">
              <Textarea
                value={awizacjaNotes}
                onChange={(e) => setAwizacjaNotes(e.target.value)}
                onBlur={(e) => saveField("awizacjaNotes", e.target.value)}
                rows={2}
                placeholder="np. dzwoń na bramie, czas rozładunku 1h"
                disabled={pending}
              />
            </FieldWithIcon>
          </div>
        </Card>

        {/* Akcje */}
        <Card className="p-4 space-y-2">
          <div className="text-[11px] uppercase tracking-wide font-bold text-slate-600 mb-1">
            Generowanie dokumentów
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <InteractivePdfButton
              ready={!!allDriverFilled}
              orderId={data.orderId}
              orderNumber={data.orderNumber}
              orderName={data.orderName}
              items={items}
              driverName={driverName}
              driverPhone={driverPhone}
              vehiclePlate={vehiclePlate}
              vehicleType={vehicleType}
              deliveryDate={deliveryDate}
              awizacjaNotes={awizacjaNotes}
              companyName={companyName}
              warehouseAddress={warehouseAddress}
              palletInfo={palletInfo}
            />
            <DownloadAwizacjaXlsxButton
              ready={!!allDriverFilled}
              orderNumber={data.orderNumber}
              orderName={data.orderName}
              items={items}
              driverName={driverName}
              driverPhone={driverPhone}
              vehiclePlate={vehiclePlate}
              vehicleType={vehicleType}
              deliveryDate={deliveryDate}
              awizacjaNotes={awizacjaNotes}
              companyName={companyName}
              warehouseAddress={warehouseAddress}
              containerType={containerType}
              containerCount={containerCount}
            />
            <DownloadPzCsvButton
              orderNumber={data.orderNumber}
              items={items}
            />
            <GenerateLabelsButton
              orderNumber={data.orderNumber}
              items={items}
            />
            <GenerateBarcodesZipButton
              orderNumber={data.orderNumber}
              items={items}
            />
            <GenerateBarcodesMultipagePdfButton
              orderNumber={data.orderNumber}
              items={items}
            />
          </div>
          {data.awizacjaPrintedAt && (
            <p className="text-[11px] text-emerald-700 inline-flex items-center gap-1 mt-2">
              <CheckCircle2 className="size-3" />
              Ostatnio wygenerowano:{" "}
              {new Date(data.awizacjaPrintedAt).toLocaleString("pl-PL")}
            </p>
          )}
        </Card>
      </div>

      {/* Prawa kolumna — podgląd awizacji */}
      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b bg-gradient-to-r from-slate-50 to-slate-100 flex items-center gap-2">
          <Printer className="size-4 text-slate-700" />
          <h3 className="text-sm font-heading font-semibold text-slate-800">
            Podgląd awizacji
          </h3>
        </div>
        <div className="p-4 space-y-3 text-xs" id="awizacja-print">
          <div className="text-center space-y-0.5">
            <div className="text-base font-bold uppercase tracking-wide">
              Awizacja dostawy
            </div>
            <div className="text-[10px] text-muted-foreground">
              Zamówienie #{data.orderNumber}
              {data.orderName ? ` · ${data.orderName}` : ""}
            </div>
          </div>

          <Section title="Odbiorca">
            <div className="font-medium">{companyName}</div>
            <div className="text-muted-foreground">{warehouseAddress}</div>
          </Section>

          <Section title="Kierowca">
            <KvRow
              label="Imię i nazwisko"
              value={driverName || "—"}
              empty={!driverName}
            />
            <KvRow
              label="Telefon"
              value={driverPhone || "—"}
              empty={!driverPhone}
            />
          </Section>

          <Section title="Pojazd">
            <KvRow
              label="Numer rejestracyjny"
              value={
                <span className="font-mono uppercase">
                  {vehiclePlate || "—"}
                </span>
              }
              empty={!vehiclePlate}
            />
            <KvRow
              label="Typ pojazdu"
              value={vehicleType || "—"}
              empty={!vehicleType}
            />
          </Section>

          <Section title="Termin dostawy">
            <div
              className={cn(
                "font-medium",
                !deliveryDate && "text-muted-foreground italic",
              )}
            >
              {deliveryDate
                ? new Date(deliveryDate).toLocaleString("pl-PL", {
                    dateStyle: "full",
                    timeStyle: "short",
                  })
                : "Termin nieuzupełniony"}
            </div>
          </Section>

          <Section title={`Towar do przyjęcia (${items.length} SKU)`}>
            <div className="rounded-md border border-slate-300 overflow-hidden">
              <table className="w-full text-[10px] awizacja-goods-table">
                {/* colgroup — explicit szerokości kolumn w druku (przez CSS w @media print).
                    Na ekranie ignorowane, bo nie ustawiamy width. */}
                <colgroup>
                  <col className="awizacja-col-lp" />
                  <col className="awizacja-col-sku" />
                  <col className="awizacja-col-name" />
                  <col className="awizacja-col-ean" />
                  <col className="awizacja-col-code128" />
                  <col className="awizacja-col-dekl" />
                  <col className="awizacja-col-przyjeta" />
                  <col className="awizacja-col-kart" />
                  <col className="awizacja-col-cbm" />
                </colgroup>
                <thead className="bg-slate-100 text-slate-700">
                  <tr>
                    <th className="text-center px-1.5 py-1 font-medium w-8">
                      Lp.
                    </th>
                    <th className="text-left px-1.5 py-1 font-medium w-24 whitespace-nowrap">
                      SKU
                    </th>
                    <th className="text-left px-1.5 py-1 font-medium">
                      Nazwa / Karton
                    </th>
                    <th className="text-center px-1.5 py-1 font-medium w-28">
                      EAN-13
                    </th>
                    <th className="text-center px-1.5 py-1 font-medium w-28">
                      CODE-128
                    </th>
                    <th className="text-center px-1.5 py-1 font-medium w-14">
                      Dekl.
                    </th>
                    <th className="text-center px-1.5 py-1 font-medium w-14 awizacja-accepted-col bg-amber-50">
                      Przyjęta
                    </th>
                    <th className="text-center px-1.5 py-1 font-medium w-12">
                      Kart.
                    </th>
                    <th className="text-center px-1.5 py-1 font-medium w-12">
                      CBM
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {items.map((it, i) => {
                    const cartonInfo = describeCarton(it);
                    return (
                      <tr key={it.productCode}>
                        <td className="px-1.5 py-1 text-center tabular-nums text-slate-500">
                          {i + 1}
                        </td>
                        <td className="px-1.5 py-1 font-mono text-[9px] whitespace-nowrap">
                          {it.productCode}
                        </td>
                        <td className="px-1.5 py-1">
                          <div className="font-medium text-[9px] leading-tight line-clamp-2">
                            {it.productName}
                          </div>
                          {it.color && (
                            <div className="text-[8px] text-muted-foreground">
                              {it.color}
                            </div>
                          )}
                          <div
                            className={cn(
                              "text-[8px] mt-0.5",
                              cartonInfo.isLuzem
                                ? "text-orange-700 font-semibold uppercase"
                                : "text-slate-600",
                            )}
                          >
                            {cartonInfo.label}
                          </div>
                        </td>
                        <td className="px-1.5 py-1 text-center">
                          <BarcodeInline
                            value={it.eanCode}
                            format="EAN13"
                          />
                        </td>
                        <td className="px-1.5 py-1 text-center">
                          <BarcodeInline
                            value={it.code128}
                            format="CODE128"
                          />
                        </td>
                        <td className="px-1.5 py-1 text-center tabular-nums font-semibold">
                          {it.quantity}
                        </td>
                        <td className="px-1.5 py-1 text-center tabular-nums awizacja-accepted-col bg-amber-50">
                          {/* puste — magazynier wpisuje ręcznie */}
                        </td>
                        <td className="px-1.5 py-1 text-center tabular-nums">
                          {cartonInfo.isLuzem ? (
                            <span className="text-orange-700 font-semibold text-[8px]">
                              luzem
                            </span>
                          ) : cartonInfo.cartonCount !== null ? (
                            cartonInfo.cartonCount
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-1.5 py-1 text-center tabular-nums">
                          {it.totalCbm.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-100 font-semibold">
                  <tr>
                    <td colSpan={5} className="px-1.5 py-1">
                      Σ Razem
                    </td>
                    <td className="px-1.5 py-1 text-center tabular-nums">
                      {totalQty.toLocaleString("pl-PL")} szt
                    </td>
                    <td className="px-1.5 py-1 text-center tabular-nums awizacja-accepted-col bg-amber-50">
                      {/* puste */}
                    </td>
                    <td className="px-1.5 py-1 text-center tabular-nums">
                      {totalCartons > 0 ? `${totalCartons} kart` : "—"}
                    </td>
                    <td className="px-1.5 py-1 text-center tabular-nums">
                      {totalCbm.toFixed(2)} m³
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="flex items-baseline justify-between mt-1 text-[10px]">
              <div
                className={cn(
                  palletInfo.isOverflowed
                    ? "text-orange-700 font-medium"
                    : "text-slate-600",
                )}
              >
                Przewidywana liczba palet:{" "}
                <span className="font-bold tabular-nums">
                  {palletInfo.count}
                </span>{" "}
                <span className="text-[9px] text-muted-foreground">
                  ({palletInfo.label.replace(`${palletInfo.count} palet `, "")})
                </span>
              </div>
              {totalWeight > 0 && (
                <div className="text-muted-foreground">
                  Szacowana waga:{" "}
                  <span className="font-semibold">
                    {totalWeight.toFixed(0)} kg
                  </span>
                </div>
              )}
            </div>
          </Section>

          {awizacjaNotes && (
            <div className="awizacja-notes-callout rounded-md border-l-4 border-amber-500 bg-amber-50 p-2.5 mt-2">
              <div className="flex items-baseline gap-1.5 mb-0.5">
                <span className="text-amber-700 font-bold text-[11px] tracking-wide uppercase">
                  ⚠ Notatki do dokumentu
                </span>
              </div>
              <p className="whitespace-pre-wrap text-[10px] text-amber-900 font-medium leading-snug">
                {awizacjaNotes}
              </p>
            </div>
          )}

          {/* Stopka do podpisów — tylko w druku */}
          <div className="awizacja-signatures grid grid-cols-2 gap-8 pt-8 mt-4">
            <div className="text-center">
              <div className="border-t border-slate-700 pt-1 text-[10px] text-slate-600">
                Podpis kierowcy
              </div>
            </div>
            <div className="text-center">
              <div className="border-t border-slate-700 pt-1 text-[10px] text-slate-600">
                Podpis przyjmującego (magazyn)
              </div>
            </div>
          </div>
          <div className="awizacja-footer text-center text-[9px] text-muted-foreground pt-4 italic">
            Awizacja wygenerowana z systemu ERP firmy „{companyName}" ·{" "}
            {new Date().toLocaleString("pl-PL")}
          </div>
        </div>
      </Card>
    </div>
  );
}

// ─── Helpery kartonowe ──────────────────────────────────────────────

/**
 * Opisuje karton produktu: wymiary, liczbę kartonów i flagę "luzem".
 * Liczba kartonów = ceil(quantity / unitsPerBox) — ostatni karton bywa niepełny.
 */
function describeCarton(it: GoodsItem): {
  isLuzem: boolean;
  dimensionsCm: string | null;
  cartonCount: number | null;
  label: string;
} {
  if (it.importMode === "LUZEM") {
    return {
      isLuzem: true,
      dimensionsCm: null,
      cartonCount: null,
      label: "luzem (bez kartonu)",
    };
  }
  const w = it.boxWidthCm;
  const h = it.boxHeightCm;
  const d = it.boxDepthCm;
  const dims =
    w && h && d
      ? `${formatDim(w)}×${formatDim(h)}×${formatDim(d)} cm`
      : null;
  const cartonCount =
    it.unitsPerBox && it.unitsPerBox > 0
      ? Math.ceil(it.quantity / it.unitsPerBox)
      : null;
  const parts: string[] = [];
  if (dims) parts.push(`Karton ${dims}`);
  if (it.unitsPerBox && it.unitsPerBox > 0)
    parts.push(`${it.unitsPerBox} szt/kart`);
  return {
    isLuzem: false,
    dimensionsCm: dims,
    cartonCount,
    label: parts.join(" · ") || "— brak danych kartonu —",
  };
}

function formatDim(v: number): string {
  return Number.isInteger(v) ? v.toString() : v.toFixed(1);
}

/**
 * Przewidywana liczba palet do rozładunku — proporcjonalnie do zajętego CBM.
 *
 * Referencja branżowa:
 *  - 40' kontener: 68 m³ / 33 palety = 2.06 m³/paleta
 *  - 20' kontener: 28 m³ / 11 palet = 2.55 m³/paleta
 *  - CUSTOM: używamy ratio 40' jako fallback
 *
 * Formuła:
 *  - proportionalPallets = ceil(usedCbm / m³PerPallet)
 *  - Jeśli SKU > proportionalPallets, używamy SKU (każde SKU na osobnej palecie)
 *  - Multi-kontener jest naturalnie obsłużony przez sumaryczne CBM
 */
function computePallets(
  containerType: "TWENTY_FT" | "FORTY_FT" | "CUSTOM",
  skuCount: number,
  usedCbm: number,
  containerCount: number = 1,
): {
  count: number;
  m3PerPallet: number;
  proportionalPallets: number;
  containerCount: number;
  isOverflowed: boolean;
  label: string;
} {
  const m3PerPallet = containerType === "TWENTY_FT" ? 28 / 11 : 68 / 33;
  const safeContainerCount = Math.max(1, containerCount);
  const proportionalPallets =
    m3PerPallet > 0 ? Math.ceil(usedCbm / m3PerPallet) : 0;
  const isOverflowed = skuCount > proportionalPallets;
  const count = Math.max(proportionalPallets, skuCount);
  const containerTypeLabel =
    containerType === "FORTY_FT"
      ? "40'"
      : containerType === "TWENTY_FT"
        ? "20'"
        : "własny";
  const cbmStr = `${usedCbm.toFixed(1)} m³`;
  const ratioStr = `~${m3PerPallet.toFixed(2)} m³/paleta`;
  const containerStr =
    safeContainerCount > 1
      ? `${safeContainerCount}× kontener ${containerTypeLabel}`
      : `kontener ${containerTypeLabel}`;
  return {
    count,
    m3PerPallet,
    proportionalPallets,
    containerCount: safeContainerCount,
    isOverflowed,
    label: isOverflowed
      ? `${count} palet (${skuCount} różnych SKU > ${proportionalPallets} z proporcji, ${cbmStr} w ${containerStr}, ${ratioStr} — każde SKU na osobnej palecie)`
      : `${count} palet (${cbmStr} w ${containerStr}, ${ratioStr})`,
  };
}

// ─── Inline kod kreskowy ─────────────────────────────────────────────

// ─── Generator PZ CSV ────────────────────────────────────────────────

/**
 * Pobiera dokument PZ jako plik CSV z formatem:
 *   KODTOWARU;ilość;cena netto
 *   ABC-1;5;85,50
 *
 * Cena netto = landed cost per szt (zakup + logistyka) z kalkulatora.
 * Separator `;`, separator dziesiętny `,`, kodowanie UTF-8 z BOM (Excel PL).
 * Line ending CRLF (\r\n) — standard CSV / Windows.
 */
function DownloadPzCsvButton({
  orderNumber,
  items,
}: {
  orderNumber: string;
  items: GoodsItem[];
}) {
  function handleDownload() {
    if (items.length === 0) {
      toast.error("Brak pozycji w zamówieniu");
      return;
    }
    const lines: string[] = ["KODTOWARU;ilość;cena netto"];
    for (const it of items) {
      // Cena netto: 2 miejsca po przecinku, separator `,`
      const priceFormatted = it.landedCostPerUnitPln
        .toFixed(2)
        .replace(".", ",");
      lines.push(`${it.productCode};${it.quantity};${priceFormatted}`);
    }
    // BOM dla Excela żeby poprawnie czytał polskie znaki
    const bom = "﻿";
    const csvContent = bom + lines.join("\r\n");
    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const datePart = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `PZ_${orderNumber}_${datePart}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Pobrano PZ (${items.length} pozycji)`);
  }
  return (
    <Button
      type="button"
      onClick={handleDownload}
      className="gap-2 justify-start bg-emerald-600 hover:bg-emerald-700 text-white"
    >
      <FileSpreadsheet className="size-4" />
      <span className="text-left">
        Dokument PZ (CSV){" "}
        <span className="text-[9px] uppercase tracking-wide opacity-80">
          · KOD;ILOŚĆ;CENA
        </span>
      </span>
    </Button>
  );
}

function GenerateLabelsButton({
  orderNumber,
  items,
}: {
  orderNumber: string;
  items: GoodsItem[];
}) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (items.length === 0) {
      toast.error("Brak pozycji w zamówieniu");
      return;
    }
    startTransition(async () => {
      try {
        toast.loading("Generuję etykiety...", { id: "labels" });
        const { generateLabelsPdf } = await import("./labels-pdf");
        const result = await generateLabelsPdf(
          items.map((it) => ({
            productCode: it.productCode,
            productName: it.productName,
            eanCode: it.eanCode,
            code128: it.code128,
          })),
        );
        const url = URL.createObjectURL(result.blob);
        const a = document.createElement("a");
        const datePart = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = `Etykiety_${orderNumber}_${datePart}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success(
          `Pobrano etykiety: ${result.labelCount} szt na ${result.pageCount} stronie A4 (Avery 3475)`,
          { id: "labels" },
        );
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Błąd generowania etykiet",
          { id: "labels" },
        );
      }
    });
  }

  return (
    <Button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="gap-2 justify-start bg-slate-700 hover:bg-slate-800 text-white"
    >
      <Barcode className="size-4" />
      <span className="text-left">
        Generuj etykiety{" "}
        <span className="text-[9px] uppercase tracking-wide opacity-80">
          · Avery 3475 · 21/A4
        </span>
      </span>
    </Button>
  );
}

// ─── Kody kreskowe — osobne PDFy spakowane w ZIP (jeden plik per SKU) ─
/** Minimalny payload do wygenerowania kodów (per-product PDF/ZIP). */
export type BarcodeItemRow = {
  productCode: string;
  productName: string;
  color: string | null;
  eanCode: string | null;
  code128: string | null;
};

export function GenerateBarcodesZipButton({
  orderNumber,
  items,
}: {
  orderNumber: string;
  items: BarcodeItemRow[];
}) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (items.length === 0) {
      toast.error("Brak pozycji w zamówieniu");
      return;
    }
    startTransition(async () => {
      try {
        toast.loading("Generuję kody kreskowe (ZIP)…", { id: "barcodes-zip" });
        const { generateBarcodesZip } = await import("./barcodes-per-product");
        const result = await generateBarcodesZip(
          items.map((it) => ({
            productCode: it.productCode,
            productName: it.productName,
            color: it.color,
            eanCode: it.eanCode,
            code128: it.code128,
          })),
        );
        const url = URL.createObjectURL(result.blob);
        const a = document.createElement("a");
        const datePart = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = `Kody_${orderNumber}_${datePart}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success(`Pobrano ZIP: ${result.fileCount} osobnych PDFów`, {
          id: "barcodes-zip",
        });
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Błąd generowania ZIP",
          { id: "barcodes-zip" },
        );
      }
    });
  }

  return (
    <Button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="gap-2 justify-start bg-violet-600 hover:bg-violet-700 text-white"
    >
      <FileArchive className="size-4" />
      <span className="text-left">
        Kody kreskowe (ZIP){" "}
        <span className="text-[9px] uppercase tracking-wide opacity-80">
          · 1 PDF / SKU · A6
        </span>
      </span>
    </Button>
  );
}

// ─── Kody kreskowe — jeden wielostronicowy PDF (strona per SKU) ─
export function GenerateBarcodesMultipagePdfButton({
  orderNumber,
  items,
}: {
  orderNumber: string;
  items: BarcodeItemRow[];
}) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (items.length === 0) {
      toast.error("Brak pozycji w zamówieniu");
      return;
    }
    startTransition(async () => {
      try {
        toast.loading("Generuję kody kreskowe (PDF)…", { id: "barcodes-pdf" });
        const { generateBarcodesMultipagePdf } = await import(
          "./barcodes-per-product"
        );
        const result = await generateBarcodesMultipagePdf(
          items.map((it) => ({
            productCode: it.productCode,
            productName: it.productName,
            color: it.color,
            eanCode: it.eanCode,
            code128: it.code128,
          })),
        );
        const url = URL.createObjectURL(result.blob);
        const a = document.createElement("a");
        const datePart = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = `Kody_${orderNumber}_${datePart}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success(
          `Pobrano PDF: ${result.pageCount} stron (1 SKU / strona, A6)`,
          { id: "barcodes-pdf" },
        );
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Błąd generowania PDF",
          { id: "barcodes-pdf" },
        );
      }
    });
  }

  return (
    <Button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="gap-2 justify-start bg-indigo-600 hover:bg-indigo-700 text-white"
    >
      <Files className="size-4" />
      <span className="text-left">
        Kody kreskowe (PDF){" "}
        <span className="text-[9px] uppercase tracking-wide opacity-80">
          · 1 strona / SKU · A6
        </span>
      </span>
    </Button>
  );
}

function BarcodeInline({
  value,
  format,
}: {
  value: string | null;
  format: "EAN13" | "CODE128";
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const sanitized = value?.trim() ?? "";
  const valid =
    sanitized.length > 0 &&
    (format === "EAN13" ? /^\d{13}$/.test(sanitized) : /^[\x20-\x7E]+$/.test(sanitized));

  useEffect(() => {
    const el = svgRef.current;
    if (!el || !valid) return;
    try {
      // Render barcode natywnie w viewBox większym niż display (60pt + width:3).
      JsBarcode(el, sanitized, {
        format,
        width: 3,
        height: 60,
        displayValue: true,
        fontSize: 16,
        margin: 0,
        textMargin: 2,
        background: "transparent",
      });
      // JsBarcode wymusza explicit `width`/`height` w PX. Gdy CSS narzuca
      // mniejszą wysokość (h-10 = 40px), paski o szer. 3 jednostki w viewBox
      // wychodzą ~2px na ekranie → browser je anty-aliasuje na rozmycie.
      // Czyścimy explicit dimensions i zostawiamy viewBox + preserveAspectRatio,
      // żeby SVG skalował się czysto pod kontrolę CSS (height: auto + h-10).
      el.removeAttribute("width");
      el.removeAttribute("height");
      el.setAttribute("preserveAspectRatio", "xMidYMid meet");
    } catch {
      /* invalid value — pomiń */
    }
  }, [sanitized, valid, format]);

  if (!valid) {
    return <span className="text-[9px] text-muted-foreground italic">—</span>;
  }
  return (
    <svg
      ref={svgRef}
      className="inline-block h-10 w-auto"
      style={{
        shapeRendering: "crispEdges",
        // Wyłącz wszelkie filtry/smoothing przez stack rendering — w niektórych
        // przeglądarkach SVG z explicit dimensions trafia w raster cache.
        imageRendering: "pixelated",
      }}
      aria-hidden
    />
  );
}

function FieldWithIcon({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof User;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] inline-flex items-center gap-1.5 text-slate-700">
        <Icon className="size-3.5 text-amber-600" />
        {label}
      </Label>
      {children}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wide font-bold text-slate-500 mb-1 border-b border-slate-100 pb-0.5">
        {title}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function KvRow({
  label,
  value,
  empty,
}: {
  label: string;
  value: React.ReactNode;
  empty?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-muted-foreground min-w-[120px]">{label}:</span>
      <span
        className={cn(
          "flex-1 font-medium",
          empty && "text-muted-foreground italic",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function PrintAwizacjaButton({
  orderId,
  ready,
}: {
  orderId: string;
  ready: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const printedRef = useRef(false);

  function handlePrint() {
    if (!ready) {
      toast.error(
        "Uzupełnij dane kierowcy (imię, telefon, numer rejestracyjny) przed drukowaniem.",
      );
      return;
    }
    // Dodaj klasę do body — CSS @media print z globals.css pokazuje wtedy
    // tylko #awizacja-print, reszta strony znika.
    document.body.classList.add("printing-awizacja");
    setTimeout(() => {
      window.print();
      document.body.classList.remove("printing-awizacja");
    }, 50);
    if (!printedRef.current) {
      printedRef.current = true;
      startTransition(async () => {
        try {
          await markAwizacjaPrintedAction(orderId);
          toast.success("Awizacja oznaczona jako wygenerowana");
        } catch {
          /* nie krytyczne — print już się wykonał */
        }
      });
    }
  }

  return (
    <Button
      type="button"
      onClick={handlePrint}
      disabled={!ready || pending}
      className="gap-2 justify-start bg-amber-600 hover:bg-amber-700 text-white"
    >
      <Printer className="size-4" />
      <span className="text-left">
        Awizacja PDF{" "}
        <span className="text-[9px] uppercase tracking-wide opacity-80">
          · druk A4 pionowo
        </span>
      </span>
    </Button>
  );
}

function DownloadAwizacjaXlsxButton(params: {
  ready: boolean;
  orderNumber: string;
  orderName: string | null;
  items: GoodsItem[];
  driverName: string;
  driverPhone: string;
  vehiclePlate: string;
  vehicleType: string;
  deliveryDate: string;
  awizacjaNotes: string;
  companyName: string;
  warehouseAddress: string;
  containerType: "TWENTY_FT" | "FORTY_FT" | "CUSTOM";
  containerCount: number;
}) {
  function handleDownload() {
    if (!params.ready) {
      toast.error(
        "Uzupełnij dane kierowcy (imię, telefon, numer rejestracyjny) przed pobraniem.",
      );
      return;
    }
    (async () => {
      try {
        toast.loading("Generuję plik XLSX...", { id: "xlsx-gen" });
        const totalCbm = params.items.reduce((s, it) => s + it.totalCbm, 0);
        const palletInfo = computePallets(
          params.containerType,
          params.items.length,
          totalCbm,
          params.containerCount,
        );
        const { generateAwizacjaXlsx } = await import("./awizacja-xlsx");
        const blob = await generateAwizacjaXlsx({
          orderNumber: params.orderNumber,
          orderName: params.orderName,
          items: params.items.map((it) => ({
            productCode: it.productCode,
            productName: it.productName,
            eanCode: it.eanCode,
            code128: it.code128,
            quantity: it.quantity,
            totalCbm: it.totalCbm,
            weightKg: it.weightKg,
            importMode: it.importMode,
            unitsPerBox: it.unitsPerBox,
            boxWidthCm: it.boxWidthCm,
            boxHeightCm: it.boxHeightCm,
            boxDepthCm: it.boxDepthCm,
          })),
          driverName: params.driverName,
          driverPhone: params.driverPhone,
          vehiclePlate: params.vehiclePlate,
          vehicleType: params.vehicleType,
          deliveryDate: params.deliveryDate,
          awizacjaNotes: params.awizacjaNotes,
          companyName: params.companyName,
          warehouseAddress: params.warehouseAddress,
          palletCount: palletInfo.count,
          palletLabel: palletInfo.label,
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const datePart = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = `Awizacja_${params.orderNumber}_${datePart}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success("Pobrano awizację Excel (XLSX)", { id: "xlsx-gen" });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Błąd generowania XLSX", {
          id: "xlsx-gen",
        });
      }
    })();
  }
  return (
    <Button
      type="button"
      onClick={handleDownload}
      disabled={!params.ready}
      className="gap-2 justify-start bg-blue-600 hover:bg-blue-700 text-white"
    >
      <FileSpreadsheet className="size-4" />
      <span className="text-left">
        Awizacja Excel{" "}
        <span className="text-[9px] uppercase tracking-wide opacity-80">
          · CSV pełna lista
        </span>
      </span>
    </Button>
  );
}

function InteractivePdfButton(params: {
  ready: boolean;
  orderId: string;
  orderNumber: string;
  orderName: string | null;
  items: GoodsItem[];
  driverName: string;
  driverPhone: string;
  vehiclePlate: string;
  vehicleType: string;
  deliveryDate: string;
  awizacjaNotes: string;
  companyName: string;
  warehouseAddress: string;
  palletInfo: ReturnType<typeof computePallets>;
}) {
  const [pending, startTransition] = useTransition();

  async function handleClick() {
    if (!params.ready) {
      toast.error(
        "Uzupełnij dane kierowcy (imię, telefon, numer rejestracyjny).",
      );
      return;
    }
    try {
      // Dynamiczny import — pdf-lib ~150kB, ładujemy tylko gdy potrzebne
      const { generateInteractiveAwizacjaPdf } = await import(
        "./interactive-pdf"
      );
      toast.loading("Generuję interaktywny PDF...", { id: "pdf-gen" });
      const blob = await generateInteractiveAwizacjaPdf({
        orderNumber: params.orderNumber,
        orderName: params.orderName,
        items: params.items.map((it) => ({
          productCode: it.productCode,
          productName: it.productName,
          color: it.color,
          eanCode: it.eanCode,
          code128: it.code128,
          quantity: it.quantity,
          cbmPerUnit: it.cbmPerUnit,
          totalCbm: it.totalCbm,
          weightKg: it.weightKg,
          importMode: it.importMode,
          unitsPerBox: it.unitsPerBox,
          boxWidthCm: it.boxWidthCm,
          boxHeightCm: it.boxHeightCm,
          boxDepthCm: it.boxDepthCm,
        })),
        driverName: params.driverName,
        driverPhone: params.driverPhone,
        vehiclePlate: params.vehiclePlate,
        vehicleType: params.vehicleType,
        deliveryDate: params.deliveryDate,
        awizacjaNotes: params.awizacjaNotes,
        companyName: params.companyName,
        warehouseAddress: params.warehouseAddress,
        palletCount: params.palletInfo.count,
        palletLabel: params.palletInfo.label,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const datePart = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `Awizacja_interaktywna_${params.orderNumber}_${datePart}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Pobrano interaktywny PDF — magazyn może wpisać przyjęte ilości", {
        id: "pdf-gen",
      });
      // Oznacz w bazie że awizacja wygenerowana
      startTransition(async () => {
        try {
          await markAwizacjaPrintedAction(params.orderId);
        } catch {
          /* nie krytyczne */
        }
      });
    } catch (e) {
      toast.error(
        e instanceof Error
          ? `Błąd generowania PDF: ${e.message}`
          : "Błąd generowania PDF",
        { id: "pdf-gen" },
      );
    }
  }

  return (
    <Button
      type="button"
      onClick={handleClick}
      disabled={!params.ready || pending}
      className="gap-2 justify-start bg-violet-600 hover:bg-violet-700 text-white"
    >
      <FileText className="size-4" />
      <span className="text-left">
        Awizacja PDF interaktywny{" "}
        <span className="text-[9px] uppercase tracking-wide opacity-80">
          · pola do wypełnienia
        </span>
      </span>
    </Button>
  );
}

/**
 * Generuje CSV awizacji z pełnymi danymi: nagłówek, kierowca, pojazd,
 * termin, tabela towaru (z kartonami + wymiarami + "luzem"), notatki.
 * Format: UTF-8 BOM + CRLF + separator `;` — kompatybilny z Excel PL.
 */
function downloadAwizacjaCsv(params: {
  orderNumber: string;
  orderName: string | null;
  items: GoodsItem[];
  driverName: string;
  driverPhone: string;
  vehiclePlate: string;
  vehicleType: string;
  deliveryDate: string;
  awizacjaNotes: string;
  companyName: string;
  warehouseAddress: string;
  containerType: "TWENTY_FT" | "FORTY_FT" | "CUSTOM";
  containerCount: number;
}) {
  const totalCbmFn = params.items.reduce((s, it) => s + it.totalCbm, 0);
  const palletInfo = computePallets(
    params.containerType,
    params.items.length,
    totalCbmFn,
    params.containerCount,
  );
  const rows: string[][] = [];
  const esc = (v: string | number | null | undefined): string => {
    const s = String(v ?? "");
    if (s.includes(";") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const fmt = (v: number, decimals = 2) =>
    v.toFixed(decimals).replace(".", ",");

  rows.push([`AWIZACJA DOSTAWY - Zamówienie #${params.orderNumber}`]);
  if (params.orderName) rows.push([`Nazwa zamówienia: ${params.orderName}`]);
  rows.push([
    `Wygenerowano: ${new Date().toLocaleString("pl-PL")}`,
  ]);
  rows.push([]);

  rows.push(["ODBIORCA"]);
  rows.push(["Firma", params.companyName]);
  rows.push(["Adres magazynu", params.warehouseAddress]);
  rows.push([]);

  rows.push(["KIEROWCA"]);
  rows.push(["Imię i nazwisko", params.driverName || "—"]);
  rows.push(["Telefon", params.driverPhone || "—"]);
  rows.push([]);

  rows.push(["POJAZD"]);
  rows.push(["Numer rejestracyjny", params.vehiclePlate || "—"]);
  rows.push(["Typ pojazdu", params.vehicleType || "—"]);
  rows.push([]);

  rows.push([
    "TERMIN DOSTAWY",
    params.deliveryDate
      ? new Date(params.deliveryDate).toLocaleString("pl-PL", {
          dateStyle: "full",
          timeStyle: "short",
        })
      : "—",
  ]);
  rows.push([]);

  rows.push(["PRZEWIDYWANA LICZBA PALET", String(palletInfo.count)]);
  rows.push(["", palletInfo.label]);
  rows.push([]);

  rows.push(["TOWAR DO PRZYJĘCIA"]);
  rows.push([
    "Lp.",
    "SKU",
    "Nazwa",
    "EAN-13",
    "CODE-128",
    "Deklarowana ilość",
    "Przyjęta ilość", // puste — magazynier wpisuje ręcznie
    "Tryb",
    "Sztuk / karton",
    "Kartony",
    "Wymiary kartonu (cm)",
    "Waga kg/szt",
    "CBM total",
  ]);
  let totalQ = 0;
  let totalC = 0;
  let totalCbm = 0;
  let totalKg = 0;
  params.items.forEach((it, i) => {
    const info = describeCarton(it);
    totalQ += it.quantity;
    totalCbm += it.totalCbm;
    if (it.weightKg) totalKg += it.weightKg * it.quantity;
    if (info.cartonCount) totalC += info.cartonCount;
    rows.push([
      String(i + 1),
      it.productCode,
      it.productName,
      it.eanCode ?? "",
      it.code128 ?? "",
      String(it.quantity),
      "", // Przyjęta — puste, do wpisania w magazynie
      it.importMode === "LUZEM" ? "LUZEM" : "KARTON",
      info.isLuzem
        ? "luzem"
        : it.unitsPerBox
          ? String(it.unitsPerBox)
          : "—",
      info.isLuzem
        ? "luzem"
        : info.cartonCount !== null
          ? String(info.cartonCount)
          : "—",
      info.dimensionsCm ?? (info.isLuzem ? "luzem" : "—"),
      it.weightKg ? fmt(it.weightKg, 2) : "—",
      fmt(it.totalCbm, 3),
    ]);
  });
  rows.push([
    "RAZEM",
    "",
    "",
    "",
    "",
    String(totalQ),
    "", // Przyjęta razem — puste
    "",
    "",
    totalC > 0 ? String(totalC) : "—",
    "",
    totalKg > 0 ? fmt(totalKg, 1) : "—",
    fmt(totalCbm, 3),
  ]);

  if (params.awizacjaNotes) {
    rows.push([]);
    rows.push(["NOTATKI"]);
    rows.push([params.awizacjaNotes]);
  }

  const bom = "﻿";
  const csv = bom + rows.map((r) => r.map(esc).join(";")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const datePart = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `Awizacja_${params.orderNumber}_${datePart}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
