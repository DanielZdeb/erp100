"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { uploadProductImagesFromDiskAction } from "@/server/product-photos";

export function UploadFromDiskButton({ productId }: { productId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  function pick() {
    inputRef.current?.click();
  }

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    if (arr.length > 20) {
      toast.error("Maksymalnie 20 zdjec naraz.");
      return;
    }
    startTransition(async () => {
      const toastId = toast.loading(`Wgrywam 0/${arr.length} zdjec...`);
      let done = 0;
      let okCount = 0;
      let errCount = 0;
      const firstError: { msg: string } = { msg: "" };

      // Uploaduj per-plik z concurrency=3. Kazdy plik -> osobny request +
      // osobny INSERT do DB. Progress widoczny w toascie po kazdym uploadzie;
      // sharp tlumaczy 3 pliki rownolegle a nie wszystkie naraz, ale user
      // szybciej widzi pierwsze zdjecia w galerii (po router.refresh na koncu).
      const CONCURRENCY = 3;
      const queue = [...arr];

      async function worker() {
        while (queue.length > 0) {
          const f = queue.shift();
          if (!f) return;
          try {
            const fd = new FormData();
            fd.set("productId", productId);
            fd.append("files", f);
            const r = await uploadProductImagesFromDiskAction(fd);
            if (r.ok) {
              okCount++;
            } else {
              errCount++;
              if (!firstError.msg) firstError.msg = r.error;
            }
          } catch (e) {
            errCount++;
            if (!firstError.msg) {
              firstError.msg = e instanceof Error ? e.message : "Blad uploadu";
            }
          }
          done++;
          toast.loading(`Wgrywam ${done}/${arr.length} zdjec...`, {
            id: toastId,
          });
        }
      }

      try {
        await Promise.all(
          Array.from({ length: Math.min(CONCURRENCY, arr.length) }, () =>
            worker(),
          ),
        );
        if (errCount === 0) {
          toast.success(`Dodano ${okCount} zdjec do galerii.`, { id: toastId });
        } else if (okCount === 0) {
          toast.error(`Blad: ${firstError.msg}`, { id: toastId });
        } else {
          toast.warning(
            `Dodano ${okCount}/${arr.length}. ${errCount} z bledem: ${firstError.msg}`,
            { id: toastId },
          );
        }
        router.refresh();
      } finally {
        if (inputRef.current) inputRef.current.value = "";
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={pick}
        disabled={pending}
        className="gap-1.5 ring-1 ring-sky-200 text-sky-700 hover:bg-sky-50"
      >
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Upload className="size-3.5" />
        )}
        Z komputera
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </>
  );
}
