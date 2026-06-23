"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Circle,
  Loader2,
  Plus,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { changeCompanyTaskStatusAction } from "@/server/company-tasks";
import { removeTeamMemberAction } from "@/server/team-members";

import { AddTeamMemberDialog } from "./add-team-member-dialog";
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
  {
    ring: string;
    bg: string;
    accent: string;
    icon: LucideIcon;
    iconBg: string;
    headerBar: string;
    badgeRing: string;
  }
> = {
  // Cyan zamiast violet — odrozniamy sie od fioletowego menu po lewej.
  TODO: {
    ring: "ring-sky-200",
    bg: "bg-white",
    accent: "text-sky-700",
    icon: Circle,
    iconBg: "bg-sky-100 text-sky-700",
    headerBar: "bg-gradient-to-r from-sky-500 to-cyan-500",
    badgeRing: "ring-sky-200",
  },
  IN_PROGRESS: {
    ring: "ring-amber-200",
    bg: "bg-white",
    accent: "text-amber-800",
    icon: Loader2,
    iconBg: "bg-amber-100 text-amber-700",
    headerBar: "bg-gradient-to-r from-amber-500 to-orange-500",
    badgeRing: "ring-amber-200",
  },
  DONE: {
    ring: "ring-emerald-200",
    bg: "bg-white",
    accent: "text-emerald-700",
    icon: CheckCircle2,
    iconBg: "bg-emerald-100 text-emerald-700",
    headerBar: "bg-gradient-to-r from-emerald-500 to-teal-500",
    badgeRing: "ring-emerald-200",
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
  const [addMemberOpen, setAddMemberOpen] = useState(false);
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
              <div key={m.id} className="relative group/chip">
                <button
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
                {/* X usun w hover — pasek zespołu też ma szybką akcję usuwania */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (
                      !confirm(
                        `Usunąć ${m.name ?? m.email} z zespołu? Zadania pozostaną, ale stracą przypisanie.`,
                      )
                    )
                      return;
                    removeTeamMemberAction(m.id)
                      .then(() => {
                        toast.success("Usunięto z zespołu");
                        router.refresh();
                      })
                      .catch((err) => {
                        toast.error(
                          err instanceof Error ? err.message : "Nie udało się",
                        );
                      });
                  }}
                  className="absolute -top-1 -right-1 size-4 rounded-full bg-rose-600 text-white grid place-items-center opacity-0 group-hover/chip:opacity-100 transition-opacity shadow-sm ring-2 ring-white"
                  title="Usuń z zespołu"
                  aria-label="Usuń z zespołu"
                >
                  <span className="text-[10px] leading-none">×</span>
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setAddMemberOpen(true)}
            className="gap-1.5"
          >
            <UserPlus className="size-4" />
            Dodaj osobę
          </Button>
          <Button
            type="button"
            onClick={() => openCreate("TODO")}
            className="gap-1.5"
          >
            <Plus className="size-4" />
            Nowe zadanie
          </Button>
        </div>
      </div>

      {/* Kanban: 3 kolumny z kolorowym paskiem u góry */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {STATUS_ORDER.map((status) => {
          const style = COLUMN_STYLE[status];
          const Icon = style.icon;
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
                "rounded-xl ring-1 ring-slate-200 bg-white shadow-sm overflow-hidden transition-all min-h-[420px] flex flex-col",
                isDropTarget &&
                  "ring-2 ring-offset-2 ring-offset-slate-50 ring-slate-900 shadow-lg",
              )}
            >
              {/* Kolorowy pasek-akcent u góry — szybka identyfikacja statusu */}
              <div className={cn("h-1", style.headerBar)} />

              {/* Nagłówek kolumny */}
              <div className="px-3 py-2.5 flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/40">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "size-6 rounded-md grid place-items-center",
                      style.iconBg,
                    )}
                  >
                    <Icon
                      className={cn(
                        "size-3.5",
                        status === "IN_PROGRESS" && "animate-spin-slow",
                      )}
                      strokeWidth={2.5}
                    />
                  </div>
                  <h3
                    className={cn(
                      "text-xs uppercase tracking-wider font-bold",
                      style.accent,
                    )}
                  >
                    {STATUS_LABELS[status]}
                  </h3>
                  <span
                    className={cn(
                      "rounded-full bg-white ring-1 px-2 py-0.5 text-[10px] font-bold tabular-nums",
                      style.badgeRing,
                      style.accent,
                    )}
                  >
                    {items.length}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => openCreate(status)}
                  className="size-6 rounded-md grid place-items-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                  title="Dodaj zadanie w tej kolumnie"
                >
                  <Plus className="size-4" />
                </button>
              </div>

              {/* Lista kart */}
              <div
                className={cn(
                  "flex-1 p-3 space-y-2 transition-colors",
                  isDropTarget && "bg-slate-50",
                )}
              >
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
                  <div className="text-center py-10 text-xs text-muted-foreground/60 italic">
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

      {/* ── Panel "Zespół" — kafelki osób z avatarami i ich aktywnymi zadaniami */}
      <TeamPanel
        members={members}
        tasks={tasksWithOverrides}
        activeFilter={filter}
        onSelectFilter={setFilter}
        onOpenTask={(t) => setOpenTask(t)}
      />

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
      <AddTeamMemberDialog
        open={addMemberOpen}
        onClose={() => setAddMemberOpen(false)}
      />
      {pending && (
        <div className="fixed bottom-4 right-4 bg-slate-900 text-white text-xs rounded-full px-3 py-1.5 shadow-lg">
          Zapisuję…
        </div>
      )}
    </div>
  );
}

// ─── Panel "Zespół" — karty osób z ich aktywnymi zadaniami ─────────

function TeamPanel({
  members,
  tasks,
  activeFilter,
  onSelectFilter,
  onOpenTask,
}: {
  members: TaskUser[];
  tasks: CompanyTaskWithRelations[];
  activeFilter: string;
  onSelectFilter: (filter: string) => void;
  onOpenTask: (t: CompanyTaskWithRelations) => void;
}) {
  const router = useRouter();
  const [removingId, setRemovingId] = useState<string | null>(null);

  function removeMember(userId: string, name: string) {
    if (
      !confirm(
        `Usunąć ${name} z zespołu? Zadania pozostaną, ale stracą przypisanie.`,
      )
    ) {
      return;
    }
    setRemovingId(userId);
    removeTeamMemberAction(userId)
      .then(() => {
        toast.success("Usunięto z zespołu");
        router.refresh();
      })
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      })
      .finally(() => setRemovingId(null));
  }

  // Grupowanie: per assignee (vs null = pula firmy)
  const byAssignee = new Map<string | "POOL", CompanyTaskWithRelations[]>();
  for (const t of tasks) {
    if (t.status === "DONE") continue;
    const key = t.assignedToId ?? "POOL";
    const arr = byAssignee.get(key) ?? [];
    arr.push(t);
    byAssignee.set(key, arr);
  }

  // Sort wewnątrz osoby: po priorytecie (URGENT najpierw), potem po statusie
  // (IN_PROGRESS przed TODO), potem po dueAt.
  const priorityRank = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 } as const;
  const statusRank = { IN_PROGRESS: 0, TODO: 1, DONE: 2 } as const;
  for (const arr of byAssignee.values()) {
    arr.sort((a, b) => {
      const pa = priorityRank[a.priority];
      const pb = priorityRank[b.priority];
      if (pa !== pb) return pa - pb;
      const sa = statusRank[a.status];
      const sb = statusRank[b.status];
      if (sa !== sb) return sa - sb;
      const da = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
      const db = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
      return da - db;
    });
  }

  // Kafelki: najpierw "Pula firmy", potem osoby (sortowane po liczbie zadań desc)
  const cards: Array<{
    key: string;
    filterKey: string;
    title: string;
    subtitle: string | null;
    color: string;
    initials: string;
    tasks: CompanyTaskWithRelations[];
  }> = [];

  const poolTasks = byAssignee.get("POOL") ?? [];
  cards.push({
    key: "POOL",
    filterKey: "unassigned",
    title: "Pula firmy",
    subtitle: "Nieprzypisane",
    color: "bg-slate-700",
    initials: "??",
    tasks: poolTasks,
  });

  const sortedMembers = [...members].sort((a, b) => {
    const ac = (byAssignee.get(a.id) ?? []).length;
    const bc = (byAssignee.get(b.id) ?? []).length;
    return bc - ac;
  });
  for (const m of sortedMembers) {
    cards.push({
      key: m.id,
      filterKey: m.id,
      title: m.name ?? m.email,
      subtitle: m.name ? m.email : null,
      color: userColor(m.id),
      initials: initials(m.name ?? m.email),
      tasks: byAssignee.get(m.id) ?? [],
    });
  }

  return (
    <section className="space-y-3 pt-2">
      <div className="flex items-center gap-2">
        <h3 className="text-xs uppercase tracking-wide font-bold text-slate-700">
          Zespół — kto co robi
        </h3>
        <span className="text-[10px] text-muted-foreground">
          · klik osoby filtruje Kanban, klik zadania otwiera szczegóły
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {cards.map((c) => {
          const isActive = activeFilter === c.filterKey;
          const visible = c.tasks.slice(0, 5);
          const rest = c.tasks.length - visible.length;
          return (
            <div
              key={c.key}
              className={cn(
                "group/card relative rounded-xl ring-1 bg-white p-3 space-y-2 transition-all",
                isActive
                  ? "ring-2 ring-violet-500 shadow-md"
                  : "ring-slate-200 hover:ring-violet-300 hover:shadow-sm",
                removingId === c.key && "opacity-50 pointer-events-none",
              )}
            >
              {/* Usuń osobę (X w hover) — tylko dla osób, nie dla Puli */}
              {c.key !== "POOL" && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeMember(c.key, c.title);
                  }}
                  className="absolute top-1.5 right-1.5 size-5 rounded-full bg-slate-100 hover:bg-rose-100 text-slate-400 hover:text-rose-700 grid place-items-center opacity-0 group-hover/card:opacity-100 transition-opacity"
                  title="Usuń z zespołu"
                  aria-label="Usuń z zespołu"
                >
                  <Trash2 className="size-3" />
                </button>
              )}
              <button
                type="button"
                onClick={() => onSelectFilter(isActive ? "all" : c.filterKey)}
                className="w-full flex items-center gap-2.5 text-left"
                title={
                  isActive
                    ? "Klik: wyczyść filtr"
                    : `Klik: pokaż tylko zadania ${c.title}`
                }
              >
                <div
                  className={cn(
                    "size-9 rounded-full grid place-items-center text-xs font-bold text-white shrink-0 shadow-sm",
                    c.color,
                  )}
                >
                  {c.initials}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-900 truncate">
                    {c.title}
                  </div>
                  {c.subtitle && (
                    <div className="text-[10px] text-muted-foreground truncate">
                      {c.subtitle}
                    </div>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <div
                    className={cn(
                      "text-base font-bold tabular-nums leading-none",
                      c.tasks.length === 0
                        ? "text-slate-400"
                        : "text-violet-700",
                    )}
                  >
                    {c.tasks.length}
                  </div>
                  <div className="text-[9px] text-muted-foreground uppercase tracking-wide leading-tight">
                    aktyw.
                  </div>
                </div>
              </button>

              {/* Lista zadań osoby */}
              {visible.length > 0 ? (
                <ul className="space-y-1 pt-1 border-t border-slate-100">
                  {visible.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => onOpenTask(t)}
                        className="w-full flex items-center gap-2 text-left rounded px-1.5 py-1 hover:bg-slate-50 transition-colors group"
                      >
                        <span
                          className={cn(
                            "size-1.5 rounded-full shrink-0",
                            t.status === "IN_PROGRESS"
                              ? "bg-amber-500"
                              : "bg-violet-400",
                          )}
                          title={
                            t.status === "IN_PROGRESS" ? "Robię" : "Do zrobienia"
                          }
                        />
                        <span
                          className={cn(
                            "flex-1 text-xs truncate text-slate-700 group-hover:text-slate-900",
                            t.priority === "URGENT" &&
                              "font-semibold text-rose-700",
                          )}
                        >
                          {t.priority === "URGENT" && "🔥 "}
                          {t.title}
                        </span>
                        {t.dueAt && (
                          <span
                            className={cn(
                              "text-[9px] tabular-nums shrink-0",
                              new Date(t.dueAt) < new Date()
                                ? "text-rose-600 font-semibold"
                                : "text-slate-400",
                            )}
                          >
                            {new Date(t.dueAt).toLocaleDateString("pl-PL", {
                              day: "2-digit",
                              month: "2-digit",
                            })}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                  {rest > 0 && (
                    <li className="pt-0.5">
                      <button
                        type="button"
                        onClick={() =>
                          onSelectFilter(isActive ? "all" : c.filterKey)
                        }
                        className="w-full text-left text-[10px] text-violet-600 hover:text-violet-800 font-medium px-1.5"
                      >
                        + {rest}{" "}
                        {rest === 1 ? "więcej" : rest < 5 ? "więcej" : "więcej"}
                        …
                      </button>
                    </li>
                  )}
                </ul>
              ) : (
                <div className="text-[10px] text-muted-foreground/60 italic pt-1 border-t border-slate-100">
                  Brak aktywnych zadań
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
