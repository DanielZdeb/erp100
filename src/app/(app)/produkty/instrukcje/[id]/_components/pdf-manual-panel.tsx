"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, FileUp, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { replaceManualPdfAction } from "@/server/product-manuals";

export function PdfManualPanel({
  manualId,
  pdfFileUrl,
  pdfFileName,
}: {
  manualId: string;
  pdfFileUrl: string | null;
  pdfFileName: string | null;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [currentUrl, setCurrentUrl] = useState(pdfFileUrl);
  const [currentName, setCurrentName] = useState(pdfFileName);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Dozwolone tylko pliki PDF");
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    startTransition(async () => {
      try {
        const res = await replaceManualPdfAction(manualId, fd);
        setCurrentUrl(res.pdfFileUrl);
        setCurrentName(res.pdfFileName);
        toast.success("Wgrano nowy plik PDF");
        router.refresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Nie udało się wgrać",
        );
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    });
  }

  return (
    <Card className="overflow-hidden border-l-4 border-l-rose-400">
      <CardHeader className="py-3 border-b flex-row items-center justify-between gap-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <div className="size-7 rounded-md bg-rose-100 text-rose-700 flex items-center justify-center">
            <FileUp className="size-3.5" />
          </div>
          Plik PDF
          {currentName && (
            <span className="text-xs font-normal text-slate-500">
              — {currentName}
            </span>
          )}
        </CardTitle>
        <div className="flex items-center gap-2">
          {currentUrl && (
            <a
              href={currentUrl}
              target="_blank"
              rel="noopener noreferrer"
              download={currentName ?? undefined}
              className="inline-flex items-center gap-1.5 h-8 px-3 text-xs rounded-md ring-1 ring-slate-200 hover:bg-slate-50"
            >
              <Download className="size-3.5" />
              Pobierz
            </a>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => fileInputRef.current?.click()}
            disabled={pending}
          >
            <Upload className="size-3.5" />
            {pending ? "Wgrywam…" : "Wymień plik"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {currentUrl ? (
          <iframe
            src={currentUrl}
            title={currentName ?? "Instrukcja PDF"}
            className="w-full h-[800px] border-0 bg-slate-50"
          />
        ) : (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Brak pliku PDF — kliknij „Wymień plik”.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
