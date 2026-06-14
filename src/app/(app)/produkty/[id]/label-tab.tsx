"use client";

import { useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import { Download, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";

type Format = "CODE128" | "EAN13";

export function LabelTab({
  name,
  productCode,
  eanCode,
  code128,
}: {
  name: string;
  productCode: string;
  eanCode: string | null;
  /** Dedykowany kod CODE-128 (np. dla skanera magazynowego). Inny niż productCode. */
  code128: string | null;
}) {
  const hasValidEan = !!eanCode && /^\d{13}$/.test(eanCode);
  const hasCode128 = !!code128 && code128.trim() !== "";

  const [format, setFormat] = useState<Format>(
    hasValidEan ? "EAN13" : "CODE128",
  );
  const [labelWidth, setLabelWidth] = useState("100");
  const [labelHeight, setLabelHeight] = useState("60");

  const svgRef = useRef<SVGSVGElement>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  // Dla CODE128 sanityzujemy polskie znaki — symbolika nie wspiera spoza ASCII.
  const rawData = format === "EAN13" ? eanCode ?? "" : code128 ?? "";
  const data = format === "CODE128" ? sanitizeAscii(rawData) : rawData;
  const wasSanitized = format === "CODE128" && data !== rawData;

  const validationError = !data
    ? format === "CODE128"
      ? 'Brak kodu CODE-128 — uzupełnij pole „CODE128" w danych produktu.'
      : "Brak danych do wygenerowania kodu."
    : format === "EAN13" && !/^\d{13}$/.test(data)
      ? "EAN-13 wymaga dokładnie 13 cyfr."
      : null;

  const error = validationError ?? runtimeError;

  useEffect(() => {
    if (!svgRef.current || !data || validationError) {
      setRuntimeError(null);
      return;
    }
    try {
      JsBarcode(svgRef.current, data, {
        format,
        displayValue: true,
        fontSize: 16,
        margin: 8,
        height: 60,
        width: 2,
      });
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRuntimeError(null);
    } catch (e) {
      // JsBarcode rzuca string przy invalid input, nie Error
      const msg =
        e instanceof Error
          ? e.message
          : typeof e === "string"
            ? e
            : "Nieznany błąd generowania kodu";
      setRuntimeError(`JsBarcode: ${msg}`);
    }
  }, [data, format, validationError]);

  function printLabel() {
    window.print();
  }

  // Zamiana polskich znaków na ASCII + usunięcie pozostałych znaków spoza ASCII
  function sanitizeAscii(input: string): string {
    if (!input) return "";
    const map: Record<string, string> = {
      ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z",
      Ą: "A", Ć: "C", Ę: "E", Ł: "L", Ń: "N", Ó: "O", Ś: "S", Ź: "Z", Ż: "Z",
    };
    return input
      .split("")
      .map((c) => map[c] ?? c)
      .join("")
      // usuń znaki spoza ASCII printable (32-126)
      .replace(/[^\x20-\x7E]/g, "");
  }

  function downloadSvg() {
    if (!svgRef.current) return;
    const labelEl = document.getElementById("printable-label");
    if (!labelEl) return;
    const svgString = new XMLSerializer().serializeToString(labelEl);
    const content = [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<svg xmlns="http://www.w3.org/2000/svg" width="${labelWidth}mm" height="${labelHeight}mm" viewBox="0 0 ${labelWidth} ${labelHeight}">`,
      svgString,
      "</svg>",
    ].join("\n");
    const blob = new Blob([content], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `etykieta-${productCode}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Etykieta produktu</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Format kodu</Label>
              <Select
                value={format}
                onValueChange={(v) => setFormat((v as Format) ?? "CODE128")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CODE128" disabled={!hasCode128}>
                    Code 128 (z pola CODE128)
                  </SelectItem>
                  <SelectItem value="EAN13" disabled={!hasValidEan}>
                    EAN-13 (z kodu EAN)
                  </SelectItem>
                </SelectContent>
              </Select>
              {!hasCode128 && format === "CODE128" && (
                <p className="text-xs text-muted-foreground">
                  Uzupełnij pole &quot;CODE128&quot; w danych produktu.
                </p>
              )}
              {!hasValidEan && format === "EAN13" && (
                <p className="text-xs text-muted-foreground">
                  EAN-13 wymaga 13 cyfr w polu &quot;Kod EAN&quot;.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="labelWidth">Szerokość etykiety (mm)</Label>
              <Input
                id="labelWidth"
                type="number"
                value={labelWidth}
                onChange={(e) => setLabelWidth(e.target.value)}
                min="20"
                max="400"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="labelHeight">Wysokość etykiety (mm)</Label>
              <Input
                id="labelHeight"
                type="number"
                value={labelHeight}
                onChange={(e) => setLabelHeight(e.target.value)}
                min="20"
                max="400"
              />
            </div>

            <div className="space-y-2 flex flex-col justify-end">
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={printLabel}
                  className="gap-2 flex-1"
                >
                  <Printer className="size-4" />
                  Drukuj
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={downloadSvg}
                  aria-label="Pobierz SVG"
                >
                  <Download className="size-4" />
                </Button>
              </div>
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {wasSanitized && !error && (
            <Alert>
              <AlertDescription>
                Polskie znaki w kodzie CODE128 zostały zamienione na ASCII:{" "}
                <code>{rawData}</code> → <code>{data}</code>. CODE 128 nie
                wspiera znaków spoza ASCII.
              </AlertDescription>
            </Alert>
          )}

          <div className="bg-muted/40 p-6 flex items-center justify-center rounded-md">
            <div
              className="print-label-container bg-white shadow-md ring-1 ring-border"
              style={{
                width: `${labelWidth}mm`,
                height: `${labelHeight}mm`,
                padding: "3mm",
                display: "flex",
                flexDirection: "column",
                gap: "2mm",
              }}
            >
              <div
                style={{
                  fontWeight: 600,
                  fontSize: "3.5mm",
                  lineHeight: 1.1,
                  textAlign: "center",
                  overflow: "hidden",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                }}
              >
                {name}
              </div>
              <div
                style={{
                  fontFamily: "monospace",
                  fontSize: "2.5mm",
                  textAlign: "center",
                  color: "#666",
                }}
              >
                {productCode}
              </div>
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg
                  id="printable-label"
                  ref={svgRef}
                  style={{ maxWidth: "100%", maxHeight: "100%" }}
                />
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            &quot;Drukuj&quot; otwiera systemowy dialog druku — wybierz drukarkę etykiet
            (np. Brother QL, Zebra) i ustaw odpowiedni rozmiar. Możesz też
            pobrać SVG i wkleić w innym programie.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
