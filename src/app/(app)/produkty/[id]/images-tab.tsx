"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { Star, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  uploadProductImageAction,
  setPrimaryImageAction,
  deleteProductImageAction,
} from "@/server/product-media";

type ProductImage = {
  id: string;
  url: string;
  alt: string | null;
  isPrimary: boolean;
  sortOrder: number;
};

export function ImagesTab({
  productId,
  images,
}: {
  productId: string;
  images: ProductImage[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [uploadingNames, setUploadingNames] = useState<string[]>([]);

  function onPickFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    setUploadingNames(fileArray.map((f) => f.name));

    startTransition(async () => {
      for (const file of fileArray) {
        const fd = new FormData();
        fd.append("file", file);
        try {
          await uploadProductImageAction(productId, fd);
        } catch (e) {
          toast.error(
            `${file.name}: ${e instanceof Error ? e.message : "błąd"}`,
          );
        }
      }
      setUploadingNames([]);
      toast.success(
        fileArray.length === 1 ? "Wgrano grafikę" : `Wgrano ${fileArray.length} grafik`,
      );
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          JPG, PNG, WEBP. Pierwsza grafika jest oznaczona jako główna.
        </p>
        <Button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={pending}
          className="gap-2"
        >
          <Upload className="size-4" />
          {pending ? "Wgrywam…" : "Wgraj grafiki"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            onPickFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {images.length === 0 && uploadingNames.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          Brak grafik. Wgraj pierwszą.
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {images.map((img) => (
            <ImageCard key={img.id} image={img} />
          ))}
          {uploadingNames.map((name) => (
            <Card
              key={name}
              className="aspect-square flex items-center justify-center text-xs text-muted-foreground p-2 text-center"
            >
              Wgrywam {name}…
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ImageCard({ image }: { image: ProductImage }) {
  const [pending, startTransition] = useTransition();

  function setPrimary() {
    startTransition(async () => {
      try {
        await setPrimaryImageAction(image.id);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  function onDelete() {
    if (!confirm("Usunąć tę grafikę?")) return;
    startTransition(async () => {
      try {
        await deleteProductImageAction(image.id);
        toast.success("Usunięto");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się usunąć");
      }
    });
  }

  return (
    <Card className="group relative aspect-square overflow-hidden p-0">
      <Image
        src={image.url}
        alt={image.alt ?? ""}
        fill
        sizes="(max-width:768px) 50vw, 25vw"
        className="object-cover"
        unoptimized
      />
      {image.isPrimary && (
        <div className="absolute top-2 left-2 bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded flex items-center gap-1">
          <Star className="size-3 fill-current" />
          główna
        </div>
      )}
      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
        {!image.isPrimary && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={setPrimary}
            className="gap-1"
          >
            <Star className="size-3" />
            Ustaw główną
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={pending}
          onClick={onDelete}
        >
          <Trash2 className="size-3" />
        </Button>
      </div>
    </Card>
  );
}
