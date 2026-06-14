"use client";

/**
 * Panel załączników (PDF / dokumenty / inne) dla wytycznych produkcyjnych.
 *
 * Wgrywa pliki z `kind=GUIDELINES` do tabeli ProductFile poprzez istniejącą
 * akcję `uploadProductFileAction` — używaną też w zakładce „Dokumentacja",
 * ale tutaj filtr `kind=GUIDELINES` jest sztywny i niewidoczny dla użytkownika.
 */

import { useRef, useState, useTransition } from "react";
import {
  Download,
  FileText,
  Paperclip,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import {
  uploadProductFileAction,
  deleteProductFileAction,
} from "@/server/product-media";

type Item = {
  id: string;
  url: string;
  filename: string;
  contentType: string | null;
  sizeBytes: number | null;
  createdAt: Date;
};

function formatBytes(n: number | null): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function isPdf(ct: string | null, filename: string): boolean {
  if (ct?.toLowerCase().includes("pdf")) return true;
  return filename.toLowerCase().endsWith(".pdf");
}

export function GuidelineFilesPanel({
  productId,
  files,
}: {
  productId: string;
  files: Item[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [dragOver, setDragOver] = useState(false);

  function uploadOne(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", "GUIDELINES");
    startTransition(async () => {
      try {
        await uploadProductFileAction(productId, fd);
        toast.success(`Wgrano ${file.name}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Błąd uploadu");
      }
    });
  }

  function onPick(fileList: FileList | null) {
    if (!fileList) return;
    for (const f of Array.from(fileList)) uploadOne(f);
  }

  function onDelete(fileId: string, filename: string) {
    if (!confirm(`Usunąć ${filename}?`)) return;
    startTransition(async () => {
      try {
        await deleteProductFileAction(fileId);
        toast.success("Usunięto");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Błąd usuwania");
      }
    });
  }

  return (
    <Card className="overflow-hidden border-l-4 border-l-amber-400">
      <CardHeader className="py-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <div className="size-7 rounded-md bg-amber-100 text-amber-700 flex items-center justify-center">
            <Paperclip className="size-3.5" />
          </div>
          Załączniki (PDF / dokumenty)
          {files.length > 0 && (
            <span className="text-[10px] tabular-nums text-muted-foreground font-normal">
              ({files.length})
            </span>
          )}
        </CardTitle>
        <p className="text-[11px] text-muted-foreground mt-1">
          Wgraj rysunki techniczne, instrukcje fabryczne, certyfikaty,
          dodatkowe dokumenty PDF/TXT/DOC.
        </p>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {/* Drop-zone + button */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            onPick(e.dataTransfer.files);
          }}
          className={
            "rounded-md border-2 border-dashed p-4 flex items-center justify-between gap-3 transition-colors " +
            (dragOver
              ? "border-amber-400 bg-amber-50"
              : "border-slate-200 bg-slate-50/40 hover:bg-slate-50")
          }
        >
          <div className="text-xs text-slate-600">
            Przeciągnij pliki tutaj lub kliknij „Wgraj plik". Można wybrać
            wiele plików.
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              onPick(e.target.files);
              if (inputRef.current) inputRef.current.value = "";
            }}
          />
          <Button
            type="button"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={pending}
            className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white shrink-0"
          >
            <Upload className="size-3.5" />
            {pending ? "Wgrywam…" : "Wgraj plik"}
          </Button>
        </div>

        {/* Lista plików */}
        {files.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            Brak załączników. Wgraj pierwszy plik powyżej.
          </p>
        ) : (
          <ul className="divide-y rounded-md ring-1 ring-slate-200 bg-white">
            {files.map((f) => {
              const pdf = isPdf(f.contentType, f.filename);
              return (
                <li
                  key={f.id}
                  className="flex items-center gap-3 px-3 py-2"
                >
                  <div
                    className={
                      "size-9 rounded grid place-items-center shrink-0 " +
                      (pdf
                        ? "bg-rose-100 text-rose-700"
                        : "bg-slate-100 text-slate-600")
                    }
                  >
                    <FileText className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">
                      {f.filename}
                    </div>
                    <div className="text-[10px] text-muted-foreground tabular-nums">
                      {formatBytes(f.sizeBytes)} ·{" "}
                      {new Date(f.createdAt).toLocaleDateString("pl-PL")}
                      {pdf && (
                        <span className="ml-1.5 px-1 py-px rounded bg-rose-100 text-rose-700 ring-1 ring-rose-200 text-[9px] font-semibold uppercase">
                          PDF
                        </span>
                      )}
                    </div>
                  </div>
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={f.filename}
                    className="inline-flex items-center justify-center size-8 rounded text-slate-600 hover:bg-slate-100"
                    title="Pobierz / otwórz"
                  >
                    <Download className="size-4" />
                  </a>
                  <button
                    type="button"
                    onClick={() => onDelete(f.id, f.filename)}
                    disabled={pending}
                    className="inline-flex items-center justify-center size-8 rounded text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                    title="Usuń"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
