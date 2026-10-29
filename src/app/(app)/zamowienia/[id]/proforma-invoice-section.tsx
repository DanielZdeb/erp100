"use client";

/**
 * Sekcja "Proforma Invoice" na items-tab — 2 przyciski:
 *   ● Pobierz XLSX (z checkboxem "Dołącz fotki produktów", domyślnie ON)
 *   ● Wgraj XLSX z poprawkami od dostawcy — sync do ERP
 *
 * Format XLSX = `proforma-invoice-xlsx.ts` / `src/server/order-proforma-sync.ts`.
 */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, Image as ImageIcon, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  parseProformaInvoiceXlsxAction,
  type ProformaSyncReport,
} from "@/server/order-proforma-sync";

export type ProformaInvoiceItem = {
  productCode: string;
  productName: string;
  eanCode: string | null;
  specification: string | null;
  quantity: number;
  unitPriceUsd: number | null;
  primaryImageUrl: string | null;
  boxWidthCm: number | null;
  boxHeightCm: number | null;
  boxDepthCm: number | null;
  unitsPerBox: number | null;
  weightKg: number | null;
  boxWeightKg: number | null;
};

export function ProformaInvoiceSection({
  orderId,
  orderNumber,
  orderName,
  items,
  companyName,
  companyAddressLines,
  supplierName,
  supplierAddressLines,
}: {
  orderId: string;
  orderNumber: string;
  orderName: string | null;
  items: ProformaInvoiceItem[];
  /** Nasza firma (odbiorca towaru). */
  companyName: string;
  companyAddressLines: string[];
  /** Dostawca / broker (nagłówek "From"). Fallback = companyName. */
  supplierName: string;
  supplierAddressLines: string[];
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [includeImages, setIncludeImages] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [uploading, startUpload] = useTransition();
  const [lastReport, setLastReport] = useState<ProformaSyncReport | null>(null);

  async function handleDownload() {
    if (items.length === 0) {
      toast.error("Brak pozycji w zamówieniu");
      return;
    }
    setDownloading(true);
    try {
      toast.loading(
        includeImages
          ? "Generuję Proforma XLSX (z fotkami)…"
          : "Generuję Proforma XLSX…",
        { id: "pi-gen" },
      );
      const { generateProformaInvoiceXlsx } = await import(
        "./proforma-invoice-xlsx"
      );
      const blob = await generateProformaInvoiceXlsx(
        {
          header: {
            fromName: supplierName,
            fromAddressLines: supplierAddressLines,
            toName: companyName,
            toAddressLines: companyAddressLines,
            invoiceNumber: orderNumber,
            searchingNumber: orderName,
            invoiceDate: new Date(),
            madeBy: null,
            incoterms: "EXW",
          },
          items,
        },
        { includeImages },
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const datePart = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `ProformaInvoice_${orderNumber}_${datePart}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(
        `Pobrano Proforma Invoice (${items.length} SKU${includeImages ? " + fotki" : ""})`,
        { id: "pi-gen" },
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Błąd generowania XLSX", {
        id: "pi-gen",
      });
    } finally {
      setDownloading(false);
    }
  }

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      toast.error("Dozwolone tylko pliki .xlsx");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    startUpload(async () => {
      try {
        toast.loading("Synchronizuję Proforma Invoice z ERP…", {
          id: "pi-sync",
        });
        const report = await parseProformaInvoiceXlsxAction(orderId, fd);
        setLastReport(report);
        const parts: string[] = [];
        parts.push(`${report.updatedItems} pozycji zaktualizowanych`);
        if (report.updatedProducts > 0) {
          parts.push(`${report.updatedProducts} produktów zaktualizowanych`);
        }
        if (report.unknownCodes.length > 0) {
          parts.push(`${report.unknownCodes.length} nieznanych SKU`);
        }
        toast.success(`Zsynchronizowano: ${parts.join(", ")}`, {
          id: "pi-sync",
        });
        router.refresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Błąd synchronizacji",
          { id: "pi-sync" },
        );
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    });
  }

  return (
    <Card className="p-3 ring-1 ring-amber-200 bg-amber-50/40">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-amber-900 inline-flex items-center gap-1.5">
            <FileSpreadsheet className="size-4" />
            Proforma Invoice (dla dostawcy)
          </div>
          <p className="text-[11px] text-amber-700 mt-0.5">
            Wygeneruj XLSX dla dostawcy. Dostawca może odesłać plik z poprawkami
            (ceny, wymiary, waga) — wgraj z powrotem żeby zsynchronizować ERP.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center gap-1.5 bg-white rounded-md ring-1 ring-amber-200 px-2.5 py-1.5">
            <Checkbox
              id="pi-with-images"
              checked={includeImages}
              onCheckedChange={(v) => setIncludeImages(v === true)}
            />
            <Label
              htmlFor="pi-with-images"
              className="text-xs font-medium cursor-pointer inline-flex items-center gap-1"
            >
              <ImageIcon className="size-3.5" />
              Dołącz fotki
            </Label>
          </div>
          <Button
            type="button"
            onClick={handleDownload}
            disabled={downloading || items.length === 0}
            className="gap-2 bg-amber-600 hover:bg-amber-700 text-white"
          >
            <FileSpreadsheet className="size-4" />
            {downloading ? "Generuję…" : "Pobierz XLSX"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={handleFilePick}
          />
          <Button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            variant="outline"
            className="gap-2 border-amber-300 text-amber-900 hover:bg-amber-100"
          >
            <Upload className="size-4" />
            {uploading ? "Wczytuję…" : "Wgraj z poprawkami"}
          </Button>
        </div>
      </div>

      {lastReport && lastReport.changes.length > 0 && (
        <div className="mt-3 text-[11px] rounded-md ring-1 ring-amber-200 bg-white p-2 max-h-40 overflow-auto">
          <div className="font-semibold text-amber-900 mb-1">
            Zmiany ({lastReport.changes.length} pozycji):
          </div>
          <ul className="space-y-1">
            {lastReport.changes.map((c) => (
              <li key={c.productCode} className="text-slate-700">
                <span className="font-mono text-slate-900">
                  {c.productCode}
                </span>{" "}
                — {c.diffs.join(", ")}
              </li>
            ))}
          </ul>
          {lastReport.unknownCodes.length > 0 && (
            <div className="mt-2 pt-2 border-t border-amber-100 text-rose-700">
              <div className="font-semibold">Nieznane SKU (pominięte):</div>
              <div className="font-mono">
                {lastReport.unknownCodes.join(", ")}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
