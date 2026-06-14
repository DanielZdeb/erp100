"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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

import {
  addOrderTaskAction,
  toggleTaskDoneAction,
  deleteTaskAction,
} from "@/server/order-costs";
import { STATUS_LABEL, STATUS_ORDER, type OrderStatusT } from "@/lib/order-status";

const NO_STATUS = "__none__";

type Task = {
  id: string;
  title: string;
  description: string | null;
  status: OrderStatusT | null;
  done: boolean;
  doneAt: Date | null;
  dueAt: Date | null;
};

export function TasksTab({
  orderId,
  tasks,
}: {
  orderId: string;
  tasks: Task[];
}) {
  const [addOpen, setAddOpen] = useState(false);

  // grupuj po statusie
  const groups = new Map<OrderStatusT | "GENERAL", Task[]>();
  for (const t of tasks) {
    const k = (t.status ?? "GENERAL") as OrderStatusT | "GENERAL";
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(t);
  }

  const ordered: ((OrderStatusT | "GENERAL"))[] = [
    "GENERAL",
    ...STATUS_ORDER,
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button type="button" onClick={() => setAddOpen(true)} className="gap-2">
          <Plus className="size-4" />
          Nowe zadanie
        </Button>
      </div>

      {tasks.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          Brak zadań. Dodaj pierwsze (np. &quot;Sprawdzić wytyczne&quot; przypisane do
          etapu Kontroli jakości).
        </Card>
      ) : (
        <div className="space-y-3">
          {ordered.map((k) => {
            const list = groups.get(k);
            if (!list || list.length === 0) return null;
            return (
              <Card key={k} className="overflow-hidden p-0">
                <div className="px-4 py-2 bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  {k === "GENERAL" ? "Ogólne" : STATUS_LABEL[k as OrderStatusT]}
                </div>
                <ul className="divide-y">
                  {list.map((t) => (
                    <TaskRow key={t.id} task={t} />
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      )}

      <AddTaskDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        orderId={orderId}
      />
    </div>
  );
}

function TaskRow({ task }: { task: Task }) {
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      try {
        await toggleTaskDoneAction(task.id, !task.done);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }
  function del() {
    if (!confirm("Usunąć to zadanie?")) return;
    startTransition(async () => {
      try {
        await deleteTaskAction(task.id);
        toast.success("Usunięto");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <li className="flex items-start gap-3 p-3">
      <Checkbox
        checked={task.done}
        onCheckedChange={toggle}
        disabled={pending}
        className="mt-0.5"
        aria-label="Wykonane"
      />
      <div className="flex-1 min-w-0">
        <div
          className={`text-sm ${task.done ? "line-through text-muted-foreground" : "font-medium"}`}
        >
          {task.title}
        </div>
        {task.description && (
          <div className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">
            {task.description}
          </div>
        )}
        {task.dueAt && (
          <div className="text-xs text-muted-foreground mt-0.5">
            Termin: {new Date(task.dueAt).toLocaleDateString("pl-PL")}
          </div>
        )}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={del}
        disabled={pending}
        aria-label="Usuń"
      >
        <Trash2 className="size-4 text-destructive" />
      </Button>
    </li>
  );
}

function AddTaskDialog({
  open,
  onClose,
  orderId,
}: {
  open: boolean;
  onClose: () => void;
  orderId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<string>(NO_STATUS);

  function onSubmit(formData: FormData) {
    const payload = Object.fromEntries(formData.entries()) as Record<string, string>;
    payload.status = status === NO_STATUS ? "" : status;
    startTransition(async () => {
      try {
        await addOrderTaskAction(orderId, payload);
        toast.success("Dodano zadanie");
        setStatus(NO_STATUS);
        onClose();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nowe zadanie</DialogTitle>
        </DialogHeader>
        <form action={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Tytuł</Label>
            <Input id="title" name="title" required autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Opis</Label>
            <Textarea id="description" name="description" rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Etap (opcjonalnie)</Label>
              <Select value={status} onValueChange={(v) => setStatus(v ?? NO_STATUS)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_STATUS}>— ogólne —</SelectItem>
                  {STATUS_ORDER.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dueAt">Termin</Label>
              <Input id="dueAt" name="dueAt" type="date" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Anuluj
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Dodaję…" : "Dodaj"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
