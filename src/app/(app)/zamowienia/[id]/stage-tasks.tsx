"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  STATUS_LABEL,
  type OrderStatusT,
} from "@/lib/order-status";

import {
  addOrderTaskAction,
  toggleTaskDoneAction,
  deleteTaskAction,
} from "@/server/order-costs";

type StageTask = {
  id: string;
  title: string;
  done: boolean;
  templateKey: string | null;
};

export function StageTasks({
  orderId,
  currentStatus,
  tasks,
}: {
  orderId: string;
  currentStatus: OrderStatusT;
  tasks: StageTask[];
}) {
  const fixedTasks = tasks.filter((t) => t.templateKey);
  const customTasks = tasks.filter((t) => !t.templateKey);
  const totalCount = tasks.length;
  const doneCount = tasks.filter((t) => t.done).length;
  const allDone = doneCount === totalCount && totalCount > 0;

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-3 py-2 border-b bg-violet-100/70 flex items-center justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-violet-700">
            Zadania na etapie
          </div>
          <div className="text-sm font-medium text-violet-900">
            {STATUS_LABEL[currentStatus]}
          </div>
        </div>
        <div
          className={cn(
            "text-xs tabular-nums font-medium",
            allDone ? "text-emerald-700" : "text-violet-700",
          )}
        >
          {doneCount}/{totalCount}
        </div>
      </div>

      <ul className="divide-y">
        {fixedTasks.map((t) => (
          <TaskRow key={t.id} task={t} canDelete={false} />
        ))}
        {customTasks.map((t) => (
          <TaskRow key={t.id} task={t} canDelete />
        ))}
      </ul>

      <AddCustomTask orderId={orderId} status={currentStatus} />
    </Card>
  );
}

function TaskRow({
  task,
  canDelete,
}: {
  task: StageTask;
  canDelete: boolean;
}) {
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

  function remove() {
    if (!confirm(`Usunąć zadanie „${task.title}"?`)) return;
    startTransition(async () => {
      try {
        await deleteTaskAction(task.id);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <li
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 text-xs transition-colors",
        task.done && "bg-emerald-100 ring-1 ring-inset ring-emerald-300",
      )}
    >
      <span
        className={cn(
          "flex-1 min-w-0 truncate",
          task.done && "text-emerald-900",
        )}
      >
        {task.title}
      </span>
      <Button
        type="button"
        size="sm"
        variant={task.done ? "outline" : "default"}
        onClick={toggle}
        disabled={pending}
        className={cn(
          "h-6 px-2 text-[10px] shrink-0",
          task.done &&
            "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700",
        )}
        aria-label={task.done ? "Cofnij wykonanie" : "Oznacz jako wykonane"}
      >
        {task.done ? "✓ Wykonano" : "Wykonano"}
      </Button>
      {canDelete && (
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          aria-label="Usuń zadanie"
          className="text-muted-foreground hover:text-destructive p-0.5"
        >
          <Trash2 className="size-3" />
        </button>
      )}
    </li>
  );
}

function AddCustomTask({
  orderId,
  status,
}: {
  orderId: string;
  status: OrderStatusT;
}) {
  const [title, setTitle] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    const t = title.trim();
    if (!t) return;
    startTransition(async () => {
      try {
        await addOrderTaskAction(orderId, { title: t, status });
        setTitle("");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 border-t bg-muted/20">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        placeholder="Dodaj własne zadanie…"
        className="h-6 text-xs"
        disabled={pending}
      />
      <Button
        type="button"
        size="sm"
        onClick={submit}
        disabled={pending || !title.trim()}
        className="h-6 px-2 text-xs gap-1 shrink-0"
      >
        <Plus className="size-3" />
        Dodaj
      </Button>
    </div>
  );
}
