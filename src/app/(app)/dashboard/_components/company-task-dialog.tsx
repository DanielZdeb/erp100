"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CalendarClock,
  Download,
  Image as ImageIcon,
  Paperclip,
  Trash2,
  UploadCloud,
  User as UserIcon,
} from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import {
  assignCompanyTaskAction,
  deleteCompanyTaskAction,
  deleteCompanyTaskAttachmentAction,
  updateCompanyTaskAction,
  uploadCompanyTaskAttachmentAction,
} from "@/server/company-tasks";
import {
  type CompanyTaskWithRelations,
  type TaskUser,
  PRIORITY_LABELS,
  STATUS_LABELS,
  STATUS_ORDER,
} from "./company-tasks-types";

function dateToInputValue(d: Date | null): string {
  if (!d) return "";
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function CompanyTaskDialog({
  task,
  members,
  open,
  onClose,
}: {
  task: CompanyTaskWithRelations | null;
  members: TaskUser[];
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"TODO" | "IN_PROGRESS" | "DONE">("TODO");
  const [priority, setPriority] = useState<
    "LOW" | "NORMAL" | "HIGH" | "URGENT"
  >("NORMAL");
  const [assignedToId, setAssignedToId] = useState<string>("");
  const [dueAt, setDueAt] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync gdy task się zmienia (np. inny task otwarty)
  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description ?? "");
      setStatus(task.status);
      setPriority(task.priority);
      setAssignedToId(task.assignedToId ?? "");
      setDueAt(dateToInputValue(task.dueAt));
    }
  }, [task]);

  if (!task) return null;

  function save() {
    if (!task) return;
    if (!title.trim()) {
      toast.error("Tytuł nie może być pusty");
      return;
    }
    startTransition(async () => {
      try {
        await updateCompanyTaskAction(task.id, {
          title: title.trim(),
          description: description.trim() || null,
          status,
          priority,
          assignedToId: assignedToId || null,
          dueAt: dueAt || null,
        });
        toast.success("Zapisano");
        router.refresh();
        onClose();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się zapisać");
      }
    });
  }

  function quickAssign(userId: string | null) {
    if (!task) return;
    setAssignedToId(userId ?? "");
    startTransition(async () => {
      try {
        await assignCompanyTaskAction(task.id, userId);
        toast.success(userId ? "Przypisano" : "Wycofano przypisanie");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Błąd przypisania");
      }
    });
  }

  function remove() {
    if (!task) return;
    if (!confirm(`Usunąć zadanie „${task.title}"?`)) return;
    startTransition(async () => {
      try {
        await deleteCompanyTaskAction(task.id);
        toast.success("Usunięto zadanie");
        router.refresh();
        onClose();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się usunąć");
      }
    });
  }

  async function uploadFiles(files: FileList | null) {
    if (!task || !files || files.length === 0) return;
    setUploading(true);
    let okCount = 0;
    for (const file of Array.from(files)) {
      try {
        const fd = new FormData();
        fd.append("file", file);
        await uploadCompanyTaskAttachmentAction(task.id, fd);
        okCount++;
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : `Błąd uploadu ${file.name}`,
        );
      }
    }
    setUploading(false);
    if (okCount > 0) {
      toast.success(`Wgrano ${okCount} plik(ów)`);
      router.refresh();
    }
  }

  function deleteAttachment(attachmentId: string) {
    if (!confirm("Usunąć ten załącznik?")) return;
    startTransition(async () => {
      try {
        await deleteCompanyTaskAttachmentAction(attachmentId);
        toast.success("Usunięto");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Edycja zadania
            {task.createdBy && (
              <span className="text-[10px] font-normal text-muted-foreground">
                · utworzył{" "}
                {task.createdBy.name ?? task.createdBy.email} ·{" "}
                {new Date(task.createdAt).toLocaleDateString("pl-PL")}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Tytuł */}
          <div className="space-y-1.5">
            <Label htmlFor="title" className="text-xs uppercase tracking-wide">
              Tytuł
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Krótko, co trzeba zrobić"
              className="text-base font-semibold"
            />
          </div>

          {/* Opis */}
          <div className="space-y-1.5">
            <Label htmlFor="desc" className="text-xs uppercase tracking-wide">
              Opis
            </Label>
            <Textarea
              id="desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              placeholder="Szczegóły, kontekst, linki, kroki…"
            />
          </div>

          {/* Wiersz: Status + Priorytet + Deadline */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide">Status</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as typeof status)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_ORDER.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide">
                Priorytet
              </Label>
              <Select
                value={priority}
                onValueChange={(v) => setPriority(v as typeof priority)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["LOW", "NORMAL", "HIGH", "URGENT"] as const).map((p) => (
                    <SelectItem key={p} value={p}>
                      {PRIORITY_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="due"
                className="text-xs uppercase tracking-wide inline-flex items-center gap-1"
              >
                <CalendarClock className="size-3" />
                Deadline
              </Label>
              <Input
                id="due"
                type="date"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
              />
            </div>
          </div>

          {/* Przypisanie do osoby */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide inline-flex items-center gap-1">
              <UserIcon className="size-3" />
              Przypisanie
            </Label>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => quickAssign(null)}
                disabled={pending}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium ring-1 transition-colors",
                  !assignedToId
                    ? "bg-slate-900 text-white ring-slate-900"
                    : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50",
                )}
              >
                Pula firmy
              </button>
              {members.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => quickAssign(m.id)}
                  disabled={pending}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium ring-1 transition-colors",
                    assignedToId === m.id
                      ? "bg-violet-600 text-white ring-violet-600"
                      : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50",
                  )}
                >
                  {m.name ?? m.email}
                </button>
              ))}
            </div>
          </div>

          {/* Załączniki */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wide inline-flex items-center gap-1">
                <Paperclip className="size-3" />
                Załączniki ({task.attachments.length})
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploading || pending}
                onClick={() => fileInputRef.current?.click()}
                className="h-7 gap-1.5 text-xs"
              >
                <UploadCloud className="size-3.5" />
                {uploading ? "Wgrywam…" : "Dodaj plik"}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  uploadFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>

            {task.attachments.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {task.attachments.map((att) => (
                  <div
                    key={att.id}
                    className="group relative rounded-md ring-1 ring-slate-200 overflow-hidden bg-slate-50"
                  >
                    {att.isImage ? (
                      <a
                        href={att.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={att.url}
                          alt={att.filename}
                          className="w-full h-24 object-cover"
                        />
                      </a>
                    ) : (
                      <a
                        href={att.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex flex-col items-center justify-center h-24 gap-1 text-slate-600 hover:bg-slate-100"
                      >
                        <Paperclip className="size-5 text-slate-400" />
                        <span className="text-[10px] truncate max-w-full px-1">
                          {att.filename}
                        </span>
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        deleteAttachment(att.id);
                      }}
                      className="absolute top-1 right-1 size-5 rounded-full bg-rose-600 text-white grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Usuń"
                    >
                      <Trash2 className="size-3" />
                    </button>
                    <a
                      href={att.url}
                      download={att.filename}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="absolute bottom-1 right-1 size-5 rounded-full bg-slate-900/70 text-white grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Pobierz"
                    >
                      <Download className="size-3" />
                    </a>
                  </div>
                ))}
              </div>
            )}
            {task.attachments.length === 0 && (
              <div
                className="rounded-md border-2 border-dashed border-slate-200 text-center py-6 text-xs text-muted-foreground"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  uploadFiles(e.dataTransfer.files);
                }}
              >
                <ImageIcon className="size-6 mx-auto text-slate-300 mb-1" />
                Przeciągnij pliki lub kliknij „Dodaj plik" powyżej
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex sm:justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={remove}
            disabled={pending}
            className="text-rose-700 ring-rose-200 hover:bg-rose-50"
          >
            <Trash2 className="size-3.5" />
            Usuń
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={pending}
            >
              Anuluj
            </Button>
            <Button type="button" onClick={save} disabled={pending}>
              {pending ? "Zapisuję…" : "Zapisz"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
