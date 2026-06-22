"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { changeCompanyTaskStatusAction } from "@/server/company-tasks";

import { CompanyTaskCard } from "./company-task-card";
import { CompanyTaskDialog } from "./company-task-dialog";
import { CompanyTaskCreateDialog } from "./company-task-create-dialog";
import {
  STATUS_LABELS,
  STATUS_ORDER,
  type CompanyTaskStatusT,
  type CompanyTaskWithRelations,
  type TaskUser,
} from "./company-tasks-types";

const COLUMN_STYLE: Record<
  CompanyTaskStatusT,
  { ring: string; bg: string; accent: string }
> = {
  TODO: {
    ring: "ring-violet-200",
    bg: "bg-violet-50/40",
    accent: "text-violet-700",
  },
  IN_PROGRESS: {
    ring: "ring-amber-200",
    bg: "bg-amber-50/40",
    accent: "text-amber-800",
  },
  DONE: {
    ring: "ring-emerald-200",
    bg: "bg-emerald-50/40",
    accent: "text-emerald-700",
  },
};

function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function userColor(id: string): string {
  const hues = [
    "bg-violet-500",
    "bg-emerald-500",
    "bg-amber-500",
    "bg-sky-500",
    "bg-rose-500",
    "bg-indigo-500",
    "bg-teal-500",
    "bg-fuchsia-500",
  ];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return hues[Math.abs(h) % hues.length];
}

export function CompanyTasksKanban({
  tasks,
  members,
}: {
  tasks: CompanyTaskWithRelations[];
  members: TaskUser[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<CompanyTaskStatusT | null>(null);

  // filtr: "all" | "unassigned" | userId
  const [filter, setFilter] = useState<string>("all");

  const [openTask, setOpenTask] = useState<CompanyTaskWithRelations | null>(
    null,
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [createDefaults, setCreateDefaults] = useState<{
    status: CompanyTaskStatusT;
    assignee: string;
  }>({ status: "TODO", assignee: "" });

  // Optymistycznie utrzymujemy lokalne statusy zadań podczas dragu
  const [localStatusOverrides, setLocalStatusOverrides] = useState<
    Record<string, CompanyTaskStatusT>
  >({});

  const tasksWithOverrides = useMemo(
    () =>
      tasks.map((t) =>
        localStatusOverrides[t.id]
          ? { ...t, status: localStatusOverrides[t.id]! }
          : t,
      ),
    [tasks, localStatusOverrides],
  );

  const filteredTasks = useMemo(() => {
    if (filter === "all") return tasksWithOverrides;
    if (filter === "unassigned")
      return tasksWithOverrides.filter((t) => !t.assignedToId);
    return tasksWithOverrides.filter((t) => t.assignedToId === filter);
  }, [tasksWithOverrides, filter]);

  const byStatus = useMemo(() => {
    const map: Record<CompanyTaskStatusT, CompanyTaskWithRelations[]> = {
      TODO: [],
      IN_PROGRESS: [],
      DONE: [],
    };
    for (const t of filteredTasks) {
      map[t.status].push(t);
    }
    // Sort: sortOrder asc (mniejsze = wyżej), potem priorytet, potem createdAt desc
    const priorityRank = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 } as const;
    for (const s of STATUS_ORDER) {
      map[s].sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        const pa = priorityRank[a.priority];
        const pb = priorityRank[b.priority];
        if (pa !== pb) return pa - pb;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    }
    return map;
  }, [filteredTasks]);

  // Liczniki zadań aktywnych (TODO + IN_PROGRESS) per osoba — do panelu
  const memberCounts = useMemo(() => {
    const counts = new Map<string, number>();
    let unassigned = 0;
    for (const t of tasksWithOverrides) {
      if (t.status === "DONE") continue;
      if (t.assignedToId) {
        counts.set(t.assignedToId, (counts.get(t.assignedToId) ?? 0) + 1);
      } else {
        unassigned++;
      }
    }
    return { counts, unassigned };
  }, [tasksWithOverrides]);

  function handleDrop(targetStatus: CompanyTaskStatusT, taskId: string) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    if ((localStatusOverrides[taskId] ?? task.status) === targetStatus) return;

    // Optymistyczna zmiana w UI
    setLocalStatusOverrides((prev) => ({ ...prev, [taskId]: targetStatus }));

    startTransition(async () => {
      try {
        await changeCompanyTaskStatusAction(taskId, targetStatus);
        toast.success(`Przeniesiono do: ${STATUS_LABELS[targetStatus]}`);
        router.refresh();
        // Po refreshu serwer zwróci nowe statusy — wyczyść local overrides
        setLocalStatusOverrides({});
      } catch (e) {
        // Cofnij
        setLocalStatusOverrides((prev) => {
          const next = { ...prev };
          delete next[taskId];
          return next;
        });
        toast.error(e instanceof Error ? e.message : "Nie udało się zmienić");
      }
    });
  }

  function openCreate(status: CompanyTaskStatusT) {
    setCreateDefaults({
      status,
      assignee: filter !== "all" && filter !== "unassigned" ? filter : "",
    });
    setCreateOpen(true);
  }

  return (
    <div className="space-y-4">
      {/* Pasek nagłówka z filtrem osób + przyciskiem dodawania */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold inline-flex items-center gap-1">
            <Users className="size-3" />
            Zespół
          </div>
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition-colors",
              filter === "all"
                ? "bg-slate-900 text-white ring-slate-900"
                : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50",
            )}
          >
            Wszyscy
            <span className="ml-1.5 opacity-70">
              ({tasksWithOverrides.filter((t) => t.status !== "DONE").length})
            </span>
          </button>
          <button
            type="button"
            onClick={() => setFilter("unassigned")}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition-colors",
              filter === "unassigned"
                ? "bg-slate-900 text-white ring-slate-900"
                : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50",
            )}
          >
            Pula firmy
            <span className="ml-1.5 opacity-70">
              ({memberCounts.unassigned})
            </span>
          </button>
          {members.map((m) => {
            const count = memberCounts.counts.get(m.id) ?? 0;
            const isActive = filter === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setFilter(m.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full pl-1 pr-2.5 py-1 text-xs font-medium ring-1 transition-colors",
                  isActive
                    ? "bg-violet-600 text-white ring-violet-600"
                    : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50",
                )}
                title={m.email}
              >
                <span
                  className={cn(
                    "size-5 rounded-full grid place-items-center text-[9px] font-bold text-white",
                    userColor(m.id),
                  )}
                >
                  {initials(m.name ?? m.email)}
                </span>
                <span>{m.name ?? m.email}</span>
                <span
                  className={cn(
                    "tabular-nums",
                    isActive ? "opacity-80" : "opacity-50",
                  )}
                >
                  · {count}
                </span>
              </button>
            );
          })}
        </div>
        <Button
          type="button"
          onClick={() => openCreate("TODO")}
          className="gap-1.5"
        >
          <Plus className="size-4" />
          Nowe zadanie
        </Button>
      </div>

      {/* Kanban: 3 kolumny */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {STATUS_ORDER.map((status) => {
          const style = COLUMN_STYLE[status];
          const items = byStatus[status];
          const isDropTarget = dropTarget === status;
          return (
            <div
              key={status}
              onDragOver={(e) => {
                e.preventDefault();
                if (draggedId) setDropTarget(status);
              }}
              onDragLeave={() => setDropTarget(null)}
              onDrop={(e) => {
                e.preventDefault();
                const taskId = e.dataTransfer.getData("text/plain") || draggedId;
                if (taskId) handleDrop(status, taskId);
                setDraggedId(null);
                setDropTarget(null);
              }}
              className={cn(
                "rounded-xl ring-1 p-3 space-y-2 min-h-[400px] transition-all",
                style.ring,
                style.bg,
                isDropTarget && "ring-2 ring-violet-500 bg-violet-100/60",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <h3
                  className={cn(
                    "text-xs uppercase tracking-wide font-bold flex items-center gap-2",
                    style.accent,
                  )}
                >
                  {STATUS_LABELS[status]}
                  <span
                    className={cn(
                      "rounded-full bg-white ring-1 px-1.5 py-0 text-[10px] tabular-nums",
                      style.ring,
                      style.accent,
                    )}
                  >
                    {items.length}
                  </span>
                </h3>
                <button
                  type="button"
                  onClick={() => openCreate(status)}
                  className="text-slate-400 hover:text-slate-700 transition-colors"
                  title="Dodaj zadanie w tej kolumnie"
                >
                  <Plus className="size-4" />
                </button>
              </div>
              <div className="space-y-2">
                {items.map((t) => (
                  <CompanyTaskCard
                    key={t.id}
                    task={t}
                    onOpen={() => setOpenTask(t)}
                    onDragStart={(id) => setDraggedId(id)}
                    onDragEnd={() => {
                      setDraggedId(null);
                      setDropTarget(null);
                    }}
                    isDragging={draggedId === t.id}
                  />
                ))}
                {items.length === 0 && (
                  <div className="text-center py-8 text-xs text-muted-foreground/70 italic">
                    {status === "TODO"
                      ? "Brak zadań — dodaj nowe"
                      : status === "IN_PROGRESS"
                        ? "Przeciągnij tu zadanie nad którym pracujesz"
                        : "Tu ląduje to co skończone"}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <CompanyTaskDialog
        task={openTask}
        members={members}
        open={openTask !== null}
        onClose={() => setOpenTask(null)}
      />
      <CompanyTaskCreateDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        members={members}
        defaultStatus={createDefaults.status}
        defaultAssigneeId={createDefaults.assignee}
      />
      {pending && (
        <div className="fixed bottom-4 right-4 bg-slate-900 text-white text-xs rounded-full px-3 py-1.5 shadow-lg">
          Zapisuję…
        </div>
      )}
    </div>
  );
}
