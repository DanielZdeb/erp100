"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, FileText, FileUp, Plus, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import {
  createProductManualAction,
  createProductManualPdfAction,
} from "@/server/product-manuals";

type ManualKind = "STANDARD" | "LEAFLET" | "PDF_ATTACHMENT";

export function NewManualButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ManualKind>("STANDARD");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setName("");
    setKind("STANDARD");
    setPdfFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function submit() {
    if (!name.trim()) {
      toast.error("Podaj nazwę instrukcji");
      return;
    }
    if (kind === "PDF_ATTACHMENT" && !pdfFile) {
      toast.error("Wybierz plik PDF");
      return;
    }

    startTransition(async () => {
      try {
        if (kind === "PDF_ATTACHMENT" && pdfFile) {
          const fd = new FormData();
          fd.append("name", name);
          fd.append("file", pdfFile);
          const res = await createProductManualPdfAction(fd);
          toast.success("Wgrano PDF — przechodzę do szczegółów");
          setOpen(false);
          reset();
          router.push(`/produkty/instrukcje/${res.id}`);
          return;
        }
        const res = await createProductManualAction({ name, kind });
        toast.success("Utworzono — przechodzę do edycji");
        setOpen(false);
        reset();
        router.push(`/produkty/instrukcje/${res.id}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się utworzyć");
      }
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2">
        <Plus className="size-4" />
        Nowa instrukcja
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Nowa instrukcja</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="manual-name">Nazwa</Label>
              <Input
                id="manual-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="np. Instrukcja mocowania szarf"
                autoFocus
                onKeyDown={(ev) => ev.key === "Enter" && submit()}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-slate-600">
                Typ instrukcji
              </Label>
              <div className="grid grid-cols-3 gap-2">
                <KindCard
                  active={kind === "STANDARD"}
                  onClick={() => setKind("STANDARD")}
                  icon={BookOpen}
                  title="Standardowa"
                  description="Wielostronicowa: okładka + spis treści + treść + Ostatnia. Multi-język w sekcjach."
                />
                <KindCard
                  active={kind === "LEAFLET"}
                  onClick={() => setKind("LEAFLET")}
                  icon={FileText}
                  title="1-stronna (ulotka)"
                  description="Okładka + 1 strona treści per język. Bez spisu treści, wyrównania i Ostatniej."
                />
                <KindCard
                  active={kind === "PDF_ATTACHMENT"}
                  onClick={() => setKind("PDF_ATTACHMENT")}
                  icon={FileUp}
                  title="PDF (załącznik)"
                  description="Wgraj gotowy plik PDF. Lista + strona publiczna pokazują go bezpośrednio."
                />
              </div>
            </div>

            {kind === "PDF_ATTACHMENT" && (
              <div className="space-y-1.5">
                <Label htmlFor="manual-pdf-file">Plik PDF</Label>
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    id="manual-pdf-file"
                    type="file"
                    accept="application/pdf,.pdf"
                    className="hidden"
                    onChange={(e) =>
                      setPdfFile(e.target.files?.[0] ?? null)
                    }
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="gap-2"
                  >
                    <Upload className="size-3.5" />
                    {pdfFile ? "Zmień plik" : "Wybierz PDF…"}
                  </Button>
                  {pdfFile && (
                    <span className="text-xs text-slate-600 truncate">
                      {pdfFile.name}{" "}
                      <span className="text-slate-400">
                        ({(pdfFile.size / (1024 * 1024)).toFixed(2)} MB)
                      </span>
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Maks. 50 MB. Plik serwowany 1:1 — bez edycji w ERP.
                </p>
              </div>
            )}

            {kind !== "PDF_ATTACHMENT" && (
              <p className="text-[11px] text-muted-foreground">
                Po utworzeniu otworzymy edytor — możesz tam dodać treść,
                przypisać do produktów lub kategorii.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Anuluj
            </Button>
            <Button type="button" onClick={submit} disabled={pending}>
              {pending
                ? kind === "PDF_ATTACHMENT"
                  ? "Wgrywam…"
                  : "Tworzę…"
                : kind === "PDF_ATTACHMENT"
                  ? "Wgraj i utwórz"
                  : "Utwórz i otwórz"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function KindCard({
  active,
  onClick,
  icon: Icon,
  title,
  description,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof BookOpen;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-left rounded-md ring-1 px-3 py-2.5 space-y-1 transition-all",
        active
          ? "ring-indigo-400 bg-indigo-50/50 shadow-sm"
          : "ring-slate-200 hover:bg-slate-50",
      )}
    >
      <div
        className={cn(
          "inline-flex items-center gap-1.5 text-sm font-semibold",
          active ? "text-indigo-700" : "text-slate-700",
        )}
      >
        <Icon className="size-3.5" />
        {title}
      </div>
      <div className="text-[10px] text-muted-foreground leading-tight">
        {description}
      </div>
    </button>
  );
}
