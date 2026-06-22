"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  File as FileIcon,
  FileImage,
  FilePlus,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  DOC_CATEGORIES,
  getDocSlot,
  type DocSlot,
} from "@/lib/order-doc-slots";

import {
  deleteOrderFileAction,
  updateOrderFileNotesAction,
} from "@/server/order-costs";

type OrderFile = {
  id: string;
  url: string;
  filename: string;
  contentType: string | null;
  sizeBytes: number | null;
  slot: string | null;
  label: string | null;
  notes: string | null;
  createdAt: Date;
};

// Tabela renderuje (maxFiles + 1) kolumn na pliki — dzięki temu w każdym
// wierszu pojawia się od razu „+ Dodaj" w kolumnie tuż za ostatnim plikiem.
const MAX_FILE_COLUMNS = 8;

// XHR-based upload — server actions w Next.js nie wystawiaja eventow progress,
// wiec dla widocznego paska postepu uzywamy POST do /api/orders/[id]/files/upload.
function uploadFileWithProgress(
  orderId: string,
  formData: FormData,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(
      "POST",
      `/api/orders/${encodeURIComponent(orderId)}/files/upload`,
      true,
    );
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) {
        onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100)));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      let msg = `HTTP ${xhr.status}`;
      try {
        const j = JSON.parse(xhr.responseText) as { error?: string };
        if (j?.error) msg = j.error;
      } catch {}
      reject(new Error(msg));
    };
    xhr.onerror = () => reject(new Error("Bład sieci"));
    xhr.onabort = () => reject(new Error("Upload przerwany"));
    xhr.send(formData);
  });
}

type UploadItem = {
  name: string;
  pct: number;
  status: "uploading" | "done" | "error";
  error?: string;
};

export function DocsTable({
  orderId,
  files,
}: {
  orderId: string;
  files: OrderFile[];
}) {
  const bySlot = new Map<string, OrderFile[]>();
  const unassigned: OrderFile[] = [];
  for (const f of files) {
    if (f.slot && getDocSlot(f.slot)) {
      const arr = bySlot.get(f.slot) ?? [];
      arr.push(f);
      bySlot.set(f.slot, arr);
    } else {
      unassigned.push(f);
    }
  }

  // Dynamiczna liczba kolumn na pliki — max wśród wszystkich slotów + 1
  // (kolumna „+ Dodaj kolejny" pojawia się od razu po ostatnim pliku).
  let maxFilesPerSlot = 0;
  for (const arr of bySlot.values()) {
    if (arr.length > maxFilesPerSlot) maxFilesPerSlot = arr.length;
  }
  const fileColumns = Math.min(maxFilesPerSlot + 1, MAX_FILE_COLUMNS);

  // Sumy do nagłówka
  const namedSlots = DOC_CATEGORIES.flatMap((c) => c.slots).filter(
    (s) => !s.custom,
  );
  const filledNamed = namedSlots.filter(
    (s) => (bySlot.get(s.id) ?? []).length > 0,
  ).length;
  const totalNamed = namedSlots.length;
  const totalFiles = files.length;

  return (
    <Card className="p-0 overflow-hidden">
        <div className="px-3 py-2 border-b bg-gradient-to-r from-violet-50 to-fuchsia-50 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <FolderOpen className="size-4 text-violet-700" />
            <h3 className="text-sm font-semibold text-violet-900 uppercase tracking-wide">
              Dokumentacja
            </h3>
          </div>
          <div className="text-[11px] text-violet-800 tabular-nums">
            Uzupełnione:{" "}
            <span
              className={cn(filledNamed > 0 && "text-emerald-700 font-bold")}
            >
              {filledNamed}/{totalNamed}
            </span>
            {totalFiles > 0 && (
              <span className="ml-2 text-violet-600">
                · łącznie {totalFiles} plik(ów)
              </span>
            )}
            {totalNamed > 0 && (
              <span className="ml-2 inline-flex items-center rounded-full bg-white/80 ring-1 ring-violet-200 px-2 py-0.5 font-bold text-violet-900">
                {((filledNamed / totalNamed) * 100).toFixed(0)}%
              </span>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="bg-slate-50/80 border-b text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="border-r border-slate-200 px-2 py-1.5 font-medium w-9"></th>
                <th className="border-r border-slate-200 text-left px-2 py-1.5 font-medium min-w-[200px]">
                  Dokument
                </th>
                {Array.from({ length: fileColumns }).map((_, i) => (
                  <th
                    key={i}
                    className="border-r border-slate-200 text-center px-2 py-1.5 font-medium w-[110px]"
                  >
                    Plik {i + 1}
                  </th>
                ))}
                <th className="text-left px-2 py-1.5 font-medium min-w-[180px]">
                  Notatka
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {DOC_CATEGORIES.map((cat) => {
                const catFilled = cat.slots
                  .filter((s) => !s.custom)
                  .filter((s) => (bySlot.get(s.id) ?? []).length > 0).length;
                const catTotal = cat.slots.filter((s) => !s.custom).length;
                return (
                  <CategorySection
                    key={cat.id}
                    catId={cat.id}
                    catLabel={cat.label}
                    catFilled={catFilled}
                    catTotal={catTotal}
                    slots={cat.slots}
                    bySlot={bySlot}
                    orderId={orderId}
                    fileColumns={fileColumns}
                  />
                );
              })}

              {unassigned.length > 0 && (
                <>
                  <SectionHeaderRow
                    label="Bez kategorii (archiwum)"
                    summary={`${unassigned.length} plik(ów)`}
                    colSpan={3 + fileColumns}
                  />
                  {unassigned.map((f) => (
                    <UnassignedRow
                      key={f.id}
                      file={f}
                      fileColumns={fileColumns}
                    />
                  ))}
                </>
              )}
            </tbody>

            <tfoot className="bg-slate-50 border-t-2 border-slate-300 font-semibold">
              <tr>
                <td
                  colSpan={2}
                  className="border-r border-slate-200 px-2 py-2 text-slate-700 uppercase tracking-wide text-[11px]"
                >
                  Σ Razem
                </td>
                <td
                  colSpan={fileColumns}
                  className="border-r border-slate-200 px-2 py-2 text-right tabular-nums text-slate-900"
                >
                  {totalFiles} plik(ów) · {filledNamed}/{totalNamed} slotów
                </td>
                <td className="px-2 py-2"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
  );
}

// ─── Sekcja kategorii ──────────────────────────────────────────────

type DocCategoryStage = {
  label: string;
  stageColor: string;
  stripeColor: string;
};

// Mapowanie kategorii dokumentów → etap zamówienia, na którym zwykle są
// uzupełniane. Stripe po lewej stronie nagłówka sekcji oznacza ten etap.
const CATEGORY_STAGE: Record<string, DocCategoryStage> = {
  ORDER: {
    label: "Etap: Dogadywanie",
    stageColor: "text-blue-700 bg-blue-50 ring-blue-200",
    stripeColor: "bg-blue-500",
  },
  CUSTOMS: {
    label: "Etap: W porcie",
    stageColor: "text-cyan-700 bg-cyan-50 ring-cyan-200",
    stripeColor: "bg-cyan-500",
  },
  ACCOUNTING: {
    label: "Etap: W magazynie",
    stageColor: "text-emerald-700 bg-emerald-50 ring-emerald-200",
    stripeColor: "bg-emerald-500",
  },
};

function CategorySection({
  catId,
  catLabel,
  catFilled,
  catTotal,
  slots,
  bySlot,
  orderId,
  fileColumns,
}: {
  catId: string;
  catLabel: string;
  catFilled: number;
  catTotal: number;
  slots: DocSlot[];
  bySlot: Map<string, OrderFile[]>;
  orderId: string;
  fileColumns: number;
}) {
  const allDone = catFilled === catTotal && catTotal > 0;
  const namedSlots = slots.filter((s) => !s.custom);
  const customSlot = slots.find((s) => s.custom);
  // Pliki użytkownika dodane przez „dokument własny" — render jako osobne wiersze
  const customFiles = customSlot ? bySlot.get(customSlot.id) ?? [] : [];
  const stageInfo = CATEGORY_STAGE[catId];
  return (
    <>
      <SectionHeaderRow
        label={catLabel}
        summary={
          catTotal > 0
            ? `${catFilled}/${catTotal} uzupełnione`
            : "Tylko własne dokumenty"
        }
        accent={allDone ? "ok" : "violet"}
        colSpan={3 + fileColumns}
        stage={stageInfo}
      />
      {namedSlots.map((slot) => (
        <SlotRow
          key={slot.id}
          slot={slot}
          orderId={orderId}
          files={bySlot.get(slot.id) ?? []}
          fileColumns={fileColumns}
        />
      ))}
      {/* Każdy własny dokument = osobny wiersz */}
      {customSlot &&
        customFiles.map((file) => (
          <CustomDocRow
            key={file.id}
            file={file}
            fileColumns={fileColumns}
          />
        ))}
      {/* Wiersz „+ dodaj własny dokument" na pełną szerokość */}
      {customSlot && (
        <AddCustomDocRow
          slotId={customSlot.id}
          orderId={orderId}
          colSpan={3 + fileColumns}
        />
      )}
    </>
  );
}

// ─── Nagłówek sekcji ───────────────────────────────────────────────

function SectionHeaderRow({
  label,
  summary,
  accent = "violet",
  colSpan,
  stage,
}: {
  label: string;
  summary?: string;
  accent?: "violet" | "ok" | "slate";
  colSpan: number;
  stage?: DocCategoryStage;
}) {
  const bg =
    accent === "ok"
      ? "bg-emerald-50/60"
      : accent === "slate"
        ? "bg-slate-50/80"
        : "bg-violet-50/60";
  const text =
    accent === "ok"
      ? "text-emerald-900"
      : accent === "slate"
        ? "text-slate-700"
        : "text-violet-900";
  const border =
    accent === "ok"
      ? "border-y-2 border-emerald-200"
      : accent === "slate"
        ? "border-y border-slate-200"
        : "border-y-2 border-violet-200";
  return (
    <tr className={cn(bg, border)}>
      <td colSpan={colSpan} className="p-0">
        <div className="flex items-stretch">
          {stage && (
            <span
              className={cn("w-1.5 shrink-0 self-stretch", stage.stripeColor)}
              aria-hidden
            />
          )}
          <div className="flex items-center gap-2 px-3 py-1.5 flex-1">
            <FolderOpen className={cn("size-3.5", text)} />
            <span
              className={cn(
                "text-[11px] font-bold uppercase tracking-wide",
                text,
              )}
            >
              {label}
            </span>
            {stage && (
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ring-1",
                  stage.stageColor,
                )}
              >
                {stage.label}
              </span>
            )}
            {summary && (
              <span
                className={cn(
                  "text-[10px] tabular-nums opacity-70 ml-auto",
                  text,
                )}
              >
                {summary}
              </span>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

// ─── Wiersz slotu ──────────────────────────────────────────────────

function SlotRow({
  slot,
  orderId,
  files,
  fileColumns,
}: {
  slot: DocSlot;
  orderId: string;
  files: OrderFile[];
  fileColumns: number;
}) {
  const Icon = slot.icon;
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [customOpen, setCustomOpen] = useState(false);

  async function uploadFiles(
    fileList: FileList | null,
    customLabel?: string,
  ) {
    if (!fileList || fileList.length === 0) return;
    const arr = Array.from(fileList);
    setUploads(
      arr.map((f) => ({ name: f.name, pct: 0, status: "uploading" })),
    );
    setPending(true);
    let okCount = 0;
    for (const file of arr) {
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("slot", slot.id);
        if (customLabel) fd.append("label", customLabel);
        await uploadFileWithProgress(orderId, fd, (pct) => {
          setUploads((prev) =>
            prev.map((p) => (p.name === file.name ? { ...p, pct } : p)),
          );
        });
        setUploads((prev) =>
          prev.map((p) =>
            p.name === file.name ? { ...p, pct: 100, status: "done" } : p,
          ),
        );
        okCount++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : `Bład uploadu ${file.name}`;
        setUploads((prev) =>
          prev.map((p) =>
            p.name === file.name ? { ...p, status: "error", error: msg } : p,
          ),
        );
        toast.error(msg);
      }
    }
    setPending(false);
    if (okCount > 0) {
      toast.success(`Wgrano ${okCount} plik(ów)`);
      router.refresh();
    }
    setTimeout(() => setUploads([]), 2500);
  }

  function onAddClick() {
    if (slot.custom) {
      setCustomOpen(true);
    } else {
      inputRef.current?.click();
    }
  }

  const hasFiles = files.length > 0;
  // Notatkę trzymamy na pierwszym pliku (semantyka „notatka slotu")
  const noteSourceFile = files[0] ?? null;

  return (
    <>
      <tr
        className={cn(
          "transition-colors hover:bg-violet-50/30",
          hasFiles && "bg-emerald-50/30",
        )}
      >
        {/* Ikona slotu */}
        <td className="border-r border-slate-200 px-2 py-1.5">
          <div
            className={cn(
              "size-7 rounded-md grid place-items-center relative",
              hasFiles
                ? "bg-emerald-600 text-white"
                : "bg-violet-100 text-violet-700",
            )}
          >
            <Icon className="size-3.5" />
            {hasFiles && (
              <span className="absolute -top-1 -right-1 bg-emerald-700 rounded-full size-3 grid place-items-center">
                <Check className="size-2 text-white" strokeWidth={3} />
              </span>
            )}
          </div>
        </td>
        {/* Nazwa slotu */}
        <td className="border-r border-slate-200 px-2 py-1.5">
          <div
            className={cn(
              "font-medium flex items-center gap-2 flex-wrap",
              hasFiles && "text-emerald-900",
              slot.custom && "italic",
            )}
          >
            {slot.label}
            {slot.id === "QC_REPORT" && (
              <span className="inline-flex items-center rounded-full bg-fuchsia-50 text-fuchsia-700 ring-1 ring-fuchsia-200 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide">
                Etap: Quality Check
              </span>
            )}
          </div>
          {hasFiles && (
            <div className="text-[10px] text-emerald-700/80 tabular-nums">
              {files.length} plik{files.length === 1 ? "" : "ów"}
            </div>
          )}
        </td>
        {/* Komórki plików — fileColumns kolumn */}
        {Array.from({ length: fileColumns }).map((_, idx) => {
          const file = files[idx];
          return (
            <td
              key={idx}
              className={cn(
                "border-r border-slate-200 p-1 align-middle",
                file && "bg-emerald-50/20",
              )}
            >
              {file ? (
                <FileCell file={file} />
              ) : idx === files.length ? (
                <AddCell
                  onClick={onAddClick}
                  pending={pending}
                  label={hasFiles ? "Dodaj kolejny" : "Dodaj plik"}
                />
              ) : (
                <div className="h-7 grid place-items-center text-muted-foreground/30">
                  —
                </div>
              )}
            </td>
          );
        })}
        {/* Notatka + ukryty file input (uruchamiany przez AddCell) */}
        <td className="px-2 py-1.5 align-middle">
          <NoteCell file={noteSourceFile} />
          {!slot.custom && (
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                uploadFiles(e.target.files);
                e.target.value = "";
              }}
            />
          )}
        </td>
      </tr>

      {uploads.length > 0 && (
        <tr>
          <td
            colSpan={3 + fileColumns}
            className="px-3 py-2 bg-violet-50/40 border-b border-violet-100"
          >
            <UploadProgressList items={uploads} />
          </td>
        </tr>
      )}

      {slot.custom && (
        <CustomFileDialog
          open={customOpen}
          onClose={() => setCustomOpen(false)}
          onSubmit={(label, fl) => {
            uploadFiles(fl, label);
            setCustomOpen(false);
          }}
          pending={pending}
        />
      )}
    </>
  );
}

// ─── Pasek postępu uploadu (jeden element listy = jeden plik) ──────

function UploadProgressList({ items }: { items: UploadItem[] }) {
  return (
    <div className="space-y-1.5">
      {items.map((it) => {
        const color =
          it.status === "error"
            ? "bg-red-500"
            : it.status === "done"
              ? "bg-emerald-500"
              : "bg-violet-500";
        const label =
          it.status === "error"
            ? it.error || "Bład"
            : it.status === "done"
              ? "Gotowe"
              : `${it.pct}%`;
        return (
          <div key={it.name} className="space-y-0.5">
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="truncate text-slate-700" title={it.name}>
                {it.name}
              </span>
              <span
                className={cn(
                  "tabular-nums font-medium shrink-0",
                  it.status === "error"
                    ? "text-red-700"
                    : it.status === "done"
                      ? "text-emerald-700"
                      : "text-violet-700",
                )}
              >
                {label}
              </span>
            </div>
            <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                className={cn("h-full transition-all", color)}
                style={{
                  width: `${it.status === "done" ? 100 : it.status === "error" ? 100 : it.pct}%`,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Wiersz „dokument własny" (jeden plik = jeden wiersz) ──────────

function CustomDocRow({
  file,
  fileColumns,
}: {
  file: OrderFile;
  fileColumns: number;
}) {
  const displayName = file.label || file.filename;
  return (
    <tr className="bg-violet-50/20 hover:bg-violet-50/40 transition-colors">
      <td className="border-r border-slate-200 px-2 py-1.5">
        <div className="size-7 rounded-md grid place-items-center bg-violet-100 text-violet-700 ring-1 ring-violet-200">
          <FilePlus className="size-3.5" />
        </div>
      </td>
      <td className="border-r border-slate-200 px-2 py-1.5">
        <div
          className="font-medium italic truncate text-violet-900"
          title={displayName}
        >
          {displayName}
        </div>
        <div className="text-[10px] text-violet-700/70">własny dokument</div>
      </td>
      <td className="border-r border-slate-200 p-1">
        <FileCell file={file} />
      </td>
      {Array.from({ length: fileColumns - 1 }).map((_, i) => (
        <td
          key={i}
          className="border-r border-slate-200 p-1 text-center text-muted-foreground/30"
        >
          —
        </td>
      ))}
      <td className="px-2 py-1.5 align-middle">
        <NoteCell file={file} />
      </td>
    </tr>
  );
}

// ─── Wiersz „+ Dodaj własny dokument" (pełna szerokość) ────────────

function AddCustomDocRow({
  slotId,
  orderId,
  colSpan,
}: {
  slotId: string;
  orderId: string;
  colSpan: number;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const router = useRouter();

  async function handleSubmit(label: string, files: FileList) {
    const arr = Array.from(files);
    setUploads(arr.map((f) => ({ name: f.name, pct: 0, status: "uploading" })));
    setPending(true);
    let okCount = 0;
    for (const file of arr) {
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("slot", slotId);
        fd.append("label", label);
        await uploadFileWithProgress(orderId, fd, (pct) => {
          setUploads((prev) =>
            prev.map((p) => (p.name === file.name ? { ...p, pct } : p)),
          );
        });
        setUploads((prev) =>
          prev.map((p) =>
            p.name === file.name ? { ...p, pct: 100, status: "done" } : p,
          ),
        );
        okCount++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : `Bład uploadu ${file.name}`;
        setUploads((prev) =>
          prev.map((p) =>
            p.name === file.name ? { ...p, status: "error", error: msg } : p,
          ),
        );
        toast.error(msg);
      }
    }
    setPending(false);
    if (okCount > 0) {
      toast.success(`Wgrano ${okCount} plik(ów)`);
      router.refresh();
    }
    setOpen(false);
    setTimeout(() => setUploads([]), 2500);
  }

  return (
    <>
      <tr>
        <td colSpan={colSpan} className="p-2 bg-violet-50/30">
          <button
            type="button"
            onClick={() => setOpen(true)}
            disabled={pending}
            className="group w-full flex items-center justify-center gap-2 h-9 rounded-md border-2 border-dashed border-violet-300 text-violet-700 hover:bg-violet-100/50 hover:border-violet-400 transition-all text-xs font-semibold uppercase tracking-wide disabled:opacity-50"
          >
            <Plus className="size-4 transition-transform group-hover:scale-110" />
            {pending ? "Wgrywam…" : "Dodaj własny dokument"}
          </button>
        </td>
      </tr>
      {uploads.length > 0 && (
        <tr>
          <td
            colSpan={colSpan}
            className="px-3 py-2 bg-violet-50/40 border-b border-violet-100"
          >
            <UploadProgressList items={uploads} />
          </td>
        </tr>
      )}
      <CustomFileDialog
        open={open}
        onClose={() => setOpen(false)}
        onSubmit={handleSubmit}
        pending={pending}
      />
    </>
  );
}

// ─── Wiersz pliku archiwalnego (bez kategorii) ─────────────────────

function UnassignedRow({
  file,
  fileColumns,
}: {
  file: OrderFile;
  fileColumns: number;
}) {
  return (
    <tr className="hover:bg-muted/20 transition-colors">
      <td className="border-r border-slate-200 px-2 py-1.5">
        <div className="size-7 rounded-md grid place-items-center bg-slate-200 text-slate-600">
          <FileIcon className="size-3.5" />
        </div>
      </td>
      <td className="border-r border-slate-200 px-2 py-1.5">
        <div className="font-medium truncate" title={file.filename}>
          {file.label || file.filename}
        </div>
      </td>
      <td className="border-r border-slate-200 p-1">
        <FileCell file={file} />
      </td>
      {Array.from({ length: fileColumns - 1 }).map((_, i) => (
        <td
          key={i}
          className="border-r border-slate-200 p-1 text-center text-muted-foreground/30"
        >
          —
        </td>
      ))}
      <td className="px-2 py-1.5 align-middle">
        <NoteCell file={file} />
      </td>
    </tr>
  );
}

// ─── Komórka pliku (ikona + nazwa + akcje) ─────────────────────────

function FileCell({ file }: { file: OrderFile }) {
  const [pending, startTransition] = useTransition();
  const meta = getFileTypeMeta(file);
  const Icon = meta.icon;

  function onDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Usunąć ${file.filename}?`)) return;
    startTransition(async () => {
      try {
        await deleteOrderFileAction(file.id);
        toast.success("Usunięto");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Nie udało się");
      }
    });
  }

  const displayName = file.label || file.filename;
  const shortName = shortenFileName(displayName, 10);

  return (
    <a
      href={file.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "group/file relative flex items-center gap-1.5 px-2 py-1 rounded-md ring-1 transition-all hover:scale-[1.02] hover:shadow-sm",
        meta.bg,
        meta.ring,
        pending && "opacity-50 pointer-events-none",
      )}
    >
      <div
        className={cn(
          "size-7 rounded grid place-items-center shrink-0",
          meta.iconBg,
        )}
      >
        <Icon className={cn("size-4", meta.iconColor)} />
      </div>
      <div className="flex-1 min-w-0">
        <div
          className={cn(
            "text-[10px] font-bold uppercase leading-tight tabular-nums",
            meta.labelColor,
          )}
        >
          {meta.typeLabel}
        </div>
        <div
          className={cn(
            "text-[10px] truncate leading-tight",
            meta.nameColor,
          )}
        >
          {shortName}
        </div>
        <div className="text-[9px] text-muted-foreground/80 tabular-nums leading-tight">
          {new Date(file.createdAt).toLocaleDateString("pl-PL", {
            day: "2-digit",
            month: "2-digit",
            year: "2-digit",
          })}
        </div>
      </div>
      <button
        type="button"
        onClick={onDelete}
        disabled={pending}
        aria-label="Usuń"
        className="opacity-0 group-hover/file:opacity-100 transition-opacity rounded p-0.5 hover:bg-destructive/15 text-muted-foreground hover:text-destructive shrink-0"
      >
        <Trash2 className="size-3" />
      </button>
      {/* Dark tooltip */}
      <span
        className="pointer-events-none absolute left-0 top-full mt-1 z-50 w-64 rounded-md bg-slate-900 text-white p-2 text-[10px] leading-snug shadow-lg opacity-0 group-hover/file:opacity-100 transition-opacity text-left"
      >
        <div className="font-bold text-indigo-200 mb-1 flex items-center gap-1">
          <Icon className={cn("size-3", meta.iconColor)} />
          <span>{meta.typeLabel}</span>
          <span className="ml-auto text-[9px] uppercase text-slate-400">
            {formatSize(file.sizeBytes)}
          </span>
        </div>
        <div className="space-y-0.5">
          <div className="font-semibold text-white break-all">
            {displayName}
          </div>
          {file.label && (
            <div className="text-slate-300 text-[9px] break-all">
              {file.filename}
            </div>
          )}
          <div className="text-slate-400 italic mt-1">
            Dodano:{" "}
            {new Date(file.createdAt).toLocaleDateString("pl-PL")}
          </div>
        </div>
      </span>
    </a>
  );
}

// ─── Komórka „Dodaj plik" w wierszu ────────────────────────────────

function AddCell({
  onClick,
  pending,
  label,
}: {
  onClick: () => void;
  pending: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="w-full h-9 flex items-center justify-center gap-1 rounded-md border border-dashed border-violet-300 text-violet-700 hover:bg-violet-50 hover:border-violet-400 transition-colors text-[10px] font-medium uppercase tracking-wide"
    >
      <Plus className="size-3" />
      {pending ? "…" : label}
    </button>
  );
}

// ─── Notatka edytowalna inline ─────────────────────────────────────

function NoteCell({ file }: { file: OrderFile | null }) {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(file?.notes ?? "");
  const [pending, startTransition] = useTransition();

  if (!file) {
    return (
      <div className="text-[10px] text-muted-foreground/50 italic">
        Najpierw dodaj plik
      </div>
    );
  }

  function save() {
    if (!file) return;
    if (note === (file.notes ?? "")) {
      setEditing(false);
      return;
    }
    startTransition(async () => {
      try {
        await updateOrderFileNotesAction(file.id, note);
        setEditing(false);
        toast.success("Zapisano notatkę");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  if (editing) {
    return (
      <div className="flex items-start gap-1">
        <textarea
          autoFocus
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setNote(file.notes ?? "");
              setEditing(false);
            }
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              save();
            }
          }}
          disabled={pending}
          rows={2}
          className="w-full text-[11px] px-2 py-1 rounded border border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400 resize-none"
          placeholder="np. wystawiona 12.05.2026"
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={cn(
        "w-full text-left text-[11px] px-2 py-1 rounded hover:bg-violet-100/60 transition-colors",
        file.notes
          ? "text-foreground"
          : "text-muted-foreground/60 italic hover:text-violet-700",
      )}
    >
      {file.notes || "+ dodaj notatkę"}
    </button>
  );
}

// ─── Dialog: dokument własny ───────────────────────────────────────

function CustomFileDialog({
  open,
  onClose,
  onSubmit,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (label: string, files: FileList) => void;
  pending: boolean;
}) {
  const [label, setLabel] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);

  function handleSubmit() {
    if (!label.trim()) {
      toast.error("Podaj nazwę dokumentu");
      return;
    }
    if (!files || files.length === 0) {
      toast.error("Wybierz plik");
      return;
    }
    onSubmit(label.trim(), files);
    setLabel("");
    setFiles(null);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setLabel("");
          setFiles(null);
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dodaj dokument własny</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="custom-label">Nazwa dokumentu</Label>
            <Input
              id="custom-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="np. Umowa z importerem"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="custom-file">Plik (można wybrać kilka)</Label>
            <Input
              id="custom-file"
              type="file"
              multiple
              onChange={(e) => setFiles(e.target.files)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={pending}
          >
            Anuluj
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={pending}>
            {pending ? "Wgrywam…" : "Dodaj"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Helpery typów plików ──────────────────────────────────────────

type FileTypeMeta = {
  typeLabel: string;
  icon: typeof FileIcon;
  bg: string;
  ring: string;
  iconBg: string;
  iconColor: string;
  labelColor: string;
  nameColor: string;
};

function getFileTypeMeta(file: OrderFile): FileTypeMeta {
  const name = (file.filename ?? "").toLowerCase();
  const ct = (file.contentType ?? "").toLowerCase();
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : "";

  // PDF
  if (ct.includes("pdf") || ext === "pdf") {
    return {
      typeLabel: "PDF",
      icon: FileText,
      bg: "bg-rose-50",
      ring: "ring-rose-200",
      iconBg: "bg-rose-600",
      iconColor: "text-white",
      labelColor: "text-rose-700",
      nameColor: "text-rose-900",
    };
  }
  // Obrazy
  if (
    ct.startsWith("image/") ||
    ["jpg", "jpeg", "png", "gif", "webp", "bmp", "heic", "tif", "tiff"].includes(
      ext,
    )
  ) {
    return {
      typeLabel: ext.toUpperCase() || "IMG",
      icon: FileImage,
      bg: "bg-blue-50",
      ring: "ring-blue-200",
      iconBg: "bg-blue-600",
      iconColor: "text-white",
      labelColor: "text-blue-700",
      nameColor: "text-blue-900",
    };
  }
  // Excel / CSV
  if (
    ct.includes("spreadsheet") ||
    ct.includes("excel") ||
    ct.includes("csv") ||
    ["xls", "xlsx", "csv", "ods"].includes(ext)
  ) {
    return {
      typeLabel: ext.toUpperCase() || "XLS",
      icon: FileSpreadsheet,
      bg: "bg-emerald-50",
      ring: "ring-emerald-200",
      iconBg: "bg-emerald-600",
      iconColor: "text-white",
      labelColor: "text-emerald-700",
      nameColor: "text-emerald-900",
    };
  }
  // Word / docs
  if (
    ct.includes("word") ||
    ct.includes("document") ||
    ["doc", "docx", "odt", "rtf", "txt"].includes(ext)
  ) {
    return {
      typeLabel: ext.toUpperCase() || "DOC",
      icon: FileText,
      bg: "bg-indigo-50",
      ring: "ring-indigo-200",
      iconBg: "bg-indigo-600",
      iconColor: "text-white",
      labelColor: "text-indigo-700",
      nameColor: "text-indigo-900",
    };
  }
  // Generic
  return {
    typeLabel: ext.toUpperCase() || "PLIK",
    icon: FileIcon,
    bg: "bg-slate-50",
    ring: "ring-slate-200",
    iconBg: "bg-slate-500",
    iconColor: "text-white",
    labelColor: "text-slate-700",
    nameColor: "text-slate-900",
  };
}

/**
 * Skraca nazwę pliku do `maxLen` znaków zachowując rozszerzenie.
 * Przykład: shortenFileName("commercial-invoice-2026-final.pdf", 10) → "comme….pdf"
 */
function shortenFileName(name: string, maxLen: number): string {
  if (!name) return "";
  if (name.length <= maxLen) return name;
  const dotIdx = name.lastIndexOf(".");
  if (dotIdx > 0 && dotIdx > name.length - 6) {
    const ext = name.slice(dotIdx); // np. .pdf
    const base = name.slice(0, dotIdx);
    const room = Math.max(2, maxLen - ext.length - 1);
    return `${base.slice(0, room)}…${ext}`;
  }
  return `${name.slice(0, Math.max(2, maxLen - 1))}…`;
}

function formatSize(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
