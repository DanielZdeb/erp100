"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

type GalleryImg = { url: string; alt?: string | null };

/**
 * Pobiera wszystkie zdjęcia produktu jako ZIP. Plik per obrazek:
 * `{productCode}-NNN.{ext}` (NNN = padded index sortOrder).
 * Klient-side: fetch każdego URL → blob → JSZip → download.
 */
export function DownloadAllImagesButton({
  productCode,
  images,
}: {
  productCode: string;
  images: GalleryImg[];
}) {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    if (images.length === 0) {
      toast.error("Brak grafik do pobrania");
      return;
    }
    setPending(true);
    const toastId = toast.loading(`Pobieranie ${images.length} grafik...`);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();

      const results = await Promise.allSettled(
        images.map(async (img, idx) => {
          const res = await fetch(img.url);
          if (!res.ok) throw new Error(`HTTP ${res.status} dla ${img.url}`);
          const blob = await res.blob();
          // Ext z Content-Type albo z URL (fallback jpg)
          const ct = res.headers.get("content-type") ?? "";
          let ext = "jpg";
          if (ct.includes("png")) ext = "png";
          else if (ct.includes("webp")) ext = "webp";
          else if (ct.includes("jpeg")) ext = "jpg";
          else {
            const m = img.url.match(/\.([a-z0-9]{3,4})(?:\?|$)/i);
            if (m) ext = m[1].toLowerCase();
          }
          const num = String(idx + 1).padStart(3, "0");
          zip.file(`${productCode}-${num}.${ext}`, blob);
        }),
      );

      const failures = results.filter((r) => r.status === "rejected").length;
      const ok = results.length - failures;
      if (ok === 0) throw new Error("Wszystkie pobrania nie powiodły się");

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${productCode}-grafiki.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(
        failures > 0
          ? `Pobrano ${ok}/${results.length} (${failures} błędów)`
          : `Pobrano ${ok} grafik`,
        { id: toastId },
      );
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
      disabled={pending || images.length === 0}
      className="gap-1.5"
      title={`Pobierz wszystkie ${images.length} grafik jako ZIP`}
    >
      <Download className="size-4" />
      {pending ? "Pobieranie..." : `Pobierz ZIP (${images.length})`}
    </Button>
  );
}
