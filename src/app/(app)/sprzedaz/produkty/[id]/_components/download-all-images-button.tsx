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
    const toastId = toast.loading(`Pobieranie 0/${images.length} grafik...`);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();

      // Helper: zabezpiecz URL przed spacjami / polskimi znakami w pathname.
      const safeUrl = (u: string): string => {
        try {
          return new URL(u, window.location.origin).toString();
        } catch {
          return encodeURI(u);
        }
      };

      // Helper: fetch z retry (2 próby), zwraca blob albo throw.
      const fetchBlob = async (
        url: string,
        retries = 2,
      ): Promise<{ blob: Blob; contentType: string }> => {
        let lastErr: unknown;
        for (let attempt = 0; attempt <= retries; attempt++) {
          try {
            const res = await fetch(url, { cache: "no-cache" });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const blob = await res.blob();
            return {
              blob,
              contentType: res.headers.get("content-type") ?? "",
            };
          } catch (e) {
            lastErr = e;
            if (attempt < retries) {
              await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
            }
          }
        }
        throw lastErr instanceof Error ? lastErr : new Error("Fetch failed");
      };

      // SEKWENCYJNIE — zeby nie zatkac serwera 12 paralelnymi requestami
      // (po tym wczesniej 9/12 falowalo). Wolniej ale niezawodne.
      let ok = 0;
      const failures: { idx: number; url: string; reason: string }[] = [];
      for (let idx = 0; idx < images.length; idx++) {
        const img = images[idx];
        const url = safeUrl(img.url);
        try {
          const { blob, contentType } = await fetchBlob(url);
          let ext = "jpg";
          if (contentType.includes("png")) ext = "png";
          else if (contentType.includes("webp")) ext = "webp";
          else if (contentType.includes("jpeg")) ext = "jpg";
          else {
            const m = img.url.match(/\.([a-z0-9]{3,4})(?:\?|$)/i);
            if (m) ext = m[1].toLowerCase();
          }
          const num = String(idx + 1).padStart(3, "0");
          zip.file(`${productCode}-${num}.${ext}`, blob);
          ok++;
          toast.loading(`Pobieranie ${ok}/${images.length} grafik...`, {
            id: toastId,
          });
        } catch (e) {
          const reason = e instanceof Error ? e.message : "unknown";
          failures.push({ idx: idx + 1, url: img.url, reason });
          // eslint-disable-next-line no-console
          console.error(
            `[downloadAllImages] FAIL #${idx + 1}: ${img.url} — ${reason}`,
          );
        }
      }

      if (ok === 0) throw new Error("Wszystkie pobrania nie powiodły się");

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const zurl = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = zurl;
      a.download = `${productCode}-grafiki.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(zurl);

      if (failures.length > 0) {
        toast.warning(
          `Pobrano ${ok}/${images.length} (${failures.length} błędów — szczegóły w konsoli)`,
          { id: toastId, duration: 8000 },
        );
      } else {
        toast.success(`Pobrano ${ok} grafik`, { id: toastId });
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
      disabled={pending || images.length === 0}
      className="gap-1.5"
      title={`Pobierz wszystkie ${images.length} grafik jako ZIP`}
    >
      <Download className="size-4" />
      {pending ? "Pobieranie..." : `Pobierz ZIP (${images.length})`}
    </Button>
  );
}
