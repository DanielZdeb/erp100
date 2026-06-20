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
      const toastId = toast.loading(`Wgrywam ${arr.length} zdjec...`);
      try {
        const fd = new FormData();
        fd.set("productId", productId);
        for (const f of arr) fd.append("files", f);
        const r = await uploadProductImagesFromDiskAction(fd);
        if (r.ok) {
          toast.success(`Dodano ${r.createdCount} zdjec do galerii.`, {
            id: toastId,
          });
          router.refresh();
        } else {
          toast.error(r.error, { id: toastId });
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Blad uploadu.", {
          id: toastId,
        });
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
