"use client";

import { useState } from "react";
import { Download, ChevronDown } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

/**
 * Pobiera wszystkie zdjęcia produktu jako ZIP. Uderza w /api/products/[id]/images-zip
 * — server-side fetch omija CORS dla obrazów na innych domenach (np. zdebu.pl).
 *
 * Kliknięcie samego przycisku = oryginalny format (zachowana szybkość).
 * Rozwijane menu daje dodatkowe opcje: JPG, WebP, oba formaty na raz.
 */
type Format = "original" | "jpg" | "webp" | "both";

const FORMAT_LABELS: Record<Format, string> = {
  original: "Oryginalny format",
  jpg: "JPG (quality 90)",
  webp: "WebP (quality 90)",
  both: "JPG + WebP (oba naraz)",
};

export function DownloadAllImagesButton({
  productId,
  productCode,
  imagesCount,
}: {
  productId: string;
  productCode: string;
  imagesCount: number;
}) {
  const [pending, setPending] = useState(false);

  async function handleDownload(format: Format) {
    if (imagesCount === 0) {
      toast.error("Brak grafik do pobrania");
      return;
    }
    setPending(true);
    const label = format === "original" ? "" : ` (${FORMAT_LABELS[format]})`;
    const toastId = toast.loading(
      `Pobieranie ${imagesCount} grafik z serwera${label}...`,
    );
    try {
      const qs = format === "original" ? "" : `?format=${format}`;
      const res = await fetch(`/api/products/${productId}/images-zip${qs}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const data = await res.json();
          if (data?.error) msg = data.error;
        } catch {
          /* noop */
        }
        throw new Error(msg);
      }
      const statsHeader = res.headers.get("X-Download-Stats");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const suffix = format === "original" ? "" : `-${format}`;
      a.download = `${productCode}-grafiki${suffix}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      let stats: { ok: number; total: number; failures: number } | null = null;
      if (statsHeader) {
        try {
          stats = JSON.parse(statsHeader);
        } catch {
          /* noop */
        }
      }
      if (stats && stats.failures > 0) {
        toast.warning(
          `Pobrano ${stats.ok}/${stats.total} (${stats.failures} grafik nie udało się pobrać)`,
          { id: toastId, duration: 8000 },
        );
      } else {
        toast.success(
          `Pobrano ${stats?.ok ?? imagesCount} grafik${label}`,
          { id: toastId },
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się", {
        id: toastId,
      });
    } finally {
      setPending(false);
    }
  }

  const disabled = pending || imagesCount === 0;

  return (
    <div className="inline-flex">
      <Button
        type="button"
        variant="outline"
        onClick={() => handleDownload("original")}
        disabled={disabled}
        className="gap-1.5 rounded-r-none border-r-0"
        title={`Pobierz wszystkie ${imagesCount} grafik jako ZIP (oryginalny format)`}
      >
        <Download className="size-4" />
        {pending ? "Pobieranie..." : `Pobierz ZIP (${imagesCount})`}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={disabled}
          className="inline-flex items-center justify-center rounded-md rounded-l-none border border-input bg-background px-2 h-9 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
          title="Wybierz format pobierania"
          aria-label="Wybierz format pobierania"
        >
          <ChevronDown className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Format pobierania</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => handleDownload("original")}>
            {FORMAT_LABELS.original}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleDownload("jpg")}>
            {FORMAT_LABELS.jpg}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleDownload("webp")}>
            {FORMAT_LABELS.webp}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleDownload("both")}>
            {FORMAT_LABELS.both}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
