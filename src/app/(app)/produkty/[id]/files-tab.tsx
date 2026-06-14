"use client";

import { useRef, useState, useTransition } from "react";
import { Download, FileText, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

import {
  uploadProductFileAction,
  deleteProductFileAction,
} from "@/server/product-media";

type FileKind = "GUIDELINES" | "SPEC" | "CERTIFICATE" | "OTHER";

const KIND_LABEL: Record<FileKind, string> = {
  GUIDELINES: "Wytyczne",
  SPEC: "Specyfikacja",
  CERTIFICATE: "Certyfikat",
  OTHER: "Inne",
};

type ProductFile = {
  id: string;
  url: string;
  filename: string;
  contentType: string | null;
  sizeBytes: number | null;
  kind: FileKind;
  createdAt: Date;
};

export function FilesTab({
  productId,
  files,
}: {
  productId: string;
  files: ProductFile[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<FileKind>("GUIDELINES");
  const [pending, startTransition] = useTransition();

  function onPick(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const file = fileList[0];

    startTransition(async () => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", kind);
      try {
        await uploadProductFileAction(productId, fd);
        toast.success(`Wgrano ${file.name}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Błąd uploadu");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3">
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Typ pliku</label>
          <Select value={kind} onValueChange={(v) => setKind(v as FileKind)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(KIND_LABEL) as FileKind[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {KIND_LABEL[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={pending}
          className="gap-2"
        >
          <Upload className="size-4" />
          {pending ? "Wgrywam…" : "Wgraj plik"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf,image/*,.doc,.docx,.xls,.xlsx"
          className="hidden"
          onChange={(e) => {
            onPick(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {files.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          Brak plików. Wgraj pierwszy — np. PDF z wytycznymi importowymi.
        </Card>
      ) : (
        <Card>
          <ul className="divide-y">
            {files.map((file) => (
              <FileRow key={file.id} file={file} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function FileRow({ file }: { file: ProductFile }) {
  const [pending, startTransition] = useTransition();

  function onDelete() {
    if (!confirm(`Usunąć ${file.filename}?`)) return;
    startTransition(async () => {
      try {
        await deleteProductFileAction(file.id);
        toast.success("Usunięto");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <li className="flex items-center gap-3 p-3">
      <FileText className="size-5 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <a
          href={file.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium hover:underline truncate block"
        >
          {file.filename}
        </a>
        <div className="text-xs text-muted-foreground flex gap-2">
          <Badge variant="secondary" className="text-[10px] py-0">
            {KIND_LABEL[file.kind]}
          </Badge>
          <span>{formatSize(file.sizeBytes)}</span>
          <span>{new Date(file.createdAt).toLocaleString("pl-PL")}</span>
        </div>
      </div>
      <a
        href={file.url}
        download={file.filename}
        aria-label="Pobierz"
        className={buttonVariants({ variant: "ghost", size: "sm" })}
      >
        <Download className="size-4" />
      </a>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onDelete}
        disabled={pending}
        aria-label="Usuń"
      >
        <Trash2 className="size-4 text-destructive" />
      </Button>
    </li>
  );
}

function formatSize(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
