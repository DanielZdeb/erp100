"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { Barcode, Pencil, QrCode } from "lucide-react";
import JsBarcode from "jsbarcode";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * Pliki / Akcje — 3 ikonki w wierszu tabeli produktów.
 * 1. EAN (popover z kodem kreskowym) · 2. Code 128 (popover) · 3. Edytuj (link).
 *
 * „Otwórz produkt" zdjęte (już jest klikalna nazwa + link „Otwórz" jako
 * przycisk). Usuwanie tylko z detalu produktu, „Dodaj podobny" jako osobny
 * komponent (DuplicateProductButton z iconOnly).
 */
export function ProductRowActions({
  productId,
  productName,
  productCode,
  eanCode,
  code128,
}: {
  productId: string;
  productName: string;
  productCode: string;
  eanCode: string | null;
  code128: string | null;
}) {
  return (
    <div className="flex items-center justify-end gap-0.5">
      <BarcodeIconButton
        label="EAN"
        format="EAN13"
        value={eanCode}
        productName={productName}
        productCode={productCode}
      />
      <BarcodeIconButton
        label="Code 128"
        format="CODE128"
        value={code128}
        productName={productName}
        productCode={productCode}
      />
      <Link
        href={`/produkty/${productId}`}
        className="size-7 rounded grid place-items-center hover:bg-primary/10 text-primary transition-colors"
        title="Otwórz kartę produktu"
        aria-label="Otwórz kartę produktu"
      >
        <Pencil className="size-3.5" />
      </Link>
    </div>
  );
}

// ─── Barcode popover ────────────────────────────────────────────────

function BarcodeIconButton({
  label,
  format,
  value,
  productName,
  productCode,
}: {
  label: string;
  format: "EAN13" | "CODE128";
  value: string | null;
  productName: string;
  productCode: string;
}) {
  const hasValue = !!value;
  const Icon = format === "EAN13" ? Barcode : QrCode;

  if (!hasValue) {
    return (
      <button
        type="button"
        disabled
        className="size-7 rounded grid place-items-center text-muted-foreground/40 cursor-not-allowed"
        title={`${label}: brak`}
        aria-label={`${label} — brak`}
      >
        <Icon className="size-3.5" />
      </button>
    );
  }

  return (
    <Popover>
      <PopoverTrigger
        className="size-7 rounded grid place-items-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        title={`${label}: ${value}`}
        aria-label={`Pokaż ${label}`}
      >
        <Icon className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent className="w-auto max-w-[360px] p-3" align="end">
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-xs font-medium">{label}</div>
            <code className="text-[10px] text-muted-foreground tabular-nums">
              {value}
            </code>
          </div>
          <BarcodeSvg value={value!} format={format} />
          <div className="text-[10px] text-muted-foreground truncate">
            {productName}{" "}
            <span className="text-muted-foreground/60">· {productCode}</span>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function BarcodeSvg({
  value,
  format,
}: {
  value: string;
  format: "EAN13" | "CODE128";
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    try {
      JsBarcode(svgRef.current, value, {
        format,
        width: 1.6,
        height: 50,
        displayValue: false,
        margin: 4,
        background: "transparent",
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Błąd generowania kodu");
    }
  }, [value, format]);

  if (error) {
    return (
      <div className="text-[10px] text-rose-700 italic">
        Błąd: {error}
      </div>
    );
  }
  return <svg ref={svgRef} className="block max-w-full" />;
}

