"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import { createCompanyTaskAction } from "@/server/company-tasks";
import {
  type TaskUser,
  PRIORITY_LABELS,
  STATUS_LABELS,
  STATUS_ORDER,
} from "./company-tasks-types";

export function CompanyTaskCreateDialog({
  open,
  onClose,
  members,
  defaultStatus = "TODO",
  defaultAssigneeId = "",
}: {
  open: boolean;
  onClose: () => void;
  members: TaskUser[];
  defaultStatus?: "TODO" | "IN_PROGRESS" | "DONE";
  defaultAssigneeId?: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"TODO" | "IN_PROGRESS" | "DONE">(
    defaultStatus,
  );
  const [priority, setPriority] = useState<
    "LOW" | "NORMAL" | "HIGH" | "URGENT"
  >("NORMAL");
  const [assignedToId, setAssignedToId] = useState(defaultAssigneeId);
  const [dueAt, setDueAt] = useState("");
  const [pending, startTransition] = useTransition();

  function reset() {
    setTitle("");
    setDescription("");
    setStatus(defaultStatus);
    setPriority("NORMAL");
    setAssignedToId(defaultAssigneeId);
    setDueAt("");
  }

  function submit() {
    if (!title.trim()) {
      toast.error("Tytuł wymagany");
      return;
    }
    startTransition(async () => {
      try {
        await createCompanyTaskAction({
          title: title.trim(),
          description: description.trim() || null,
          status,
          priority,
          assignedToId: assignedToId || null,
          dueAt: dueAt || null,
        });
        toast.success("Dodano zadanie");
        reset();
        router.refresh();
        onClose();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Nowe zadanie</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="new-title" className="text-xs uppercase tracking-wide">
              Tytuł
            </Label>
            <Input
              id="new-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="np. Zamów próbki materiału X"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="new-desc"
              className="text-xs uppercase tracking-wide"
            >
              Opis (opcjonalnie)
            </Label>
            <Textarea
              id="new-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Szczegóły, kontekst…"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
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
                htmlFor="new-due"
                className="text-xs uppercase tracking-wide"
              >
                Deadline
              </Label>
              <Input
                id="new-due"
                type="date"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide">
              Przypisanie
            </Label>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setAssignedToId("")}
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
                  onClick={() => setAssignedToId(m.id)}
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
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              reset();
              onClose();
            }}
            disabled={pending}
          >
            Anuluj
          </Button>
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? "Dodaję…" : "Dodaj zadanie"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
