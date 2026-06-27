"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/**
 * Pobiera wszystkie zdjęcia produktu jako ZIP. Uderza w /api/products/[id]/images-zip
 * — server-side fetch omija CORS dla obrazów na innych domenach (np. zdebu.pl).
 */
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

  async function handleClick() {
    if (imagesCount === 0) {
      toast.error("Brak grafik do pobrania");
      return;
    }
    setPending(true);
    const toastId = toast.loading(
      `Pobieranie ${imagesCount} grafik z serwera...`,
    );
    try {
      const res = await fetch(`/api/products/${productId}/images-zip`, {
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
      a.download = `${productCode}-grafiki.zip`;
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
          `Pobrano ${stats?.ok ?? imagesCount} grafik`,
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

  return (
    <Button
      type="button"
      variant="outline"
      onClick={handleClick}
      disabled={pending || imagesCount === 0}
      className="gap-1.5"
      title={`Pobierz wszystkie ${imagesCount} grafik jako ZIP (server-side, omija CORS)`}
    >
      <Download className="size-4" />
      {pending ? "Pobieranie..." : `Pobierz ZIP (${imagesCount})`}
    </Button>
  );
}
