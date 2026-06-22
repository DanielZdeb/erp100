"use client";

import { useState } from "react";
import { CalendarClock, Flame, Image as ImageIcon, Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  CompanyTaskWithRelations,
  CompanyTaskPriorityT,
} from "./company-tasks-types";

const PRIORITY_STYLE: Record<
  CompanyTaskPriorityT,
  { ring: string; bg: string; text: string; label: string }
> = {
  LOW: {
    ring: "ring-slate-200",
    bg: "bg-slate-50",
    text: "text-slate-600",
    label: "Niski",
  },
  NORMAL: {
    ring: "ring-slate-200",
    bg: "bg-white",
    text: "text-slate-700",
    label: "Zwykły",
  },
  HIGH: {
    ring: "ring-amber-300",
    bg: "bg-amber-50",
    text: "text-amber-800",
    label: "Wysoki",
  },
  URGENT: {
    ring: "ring-rose-300",
    bg: "bg-rose-50",
    text: "text-rose-800",
    label: "Pilne",
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
  // Deterministyczny kolor po id — żeby ta sama osoba miała zawsze ten sam kolor.
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

export function CompanyTaskCard({
  task,
  onOpen,
  onDragStart,
  onDragEnd,
  isDragging,
}: {
  task: CompanyTaskWithRelations;
  onOpen: () => void;
  onDragStart: (taskId: string) => void;
  onDragEnd: () => void;
  isDragging: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const priority = PRIORITY_STYLE[task.priority];
  const attCount = task.attachments?.length ?? 0;
  const imgCount = task.attachments?.filter((a) => a.isImage).length ?? 0;
  const otherFiles = attCount - imgCount;
  const firstImage = task.attachments?.find((a) => a.isImage)?.url ?? null;

  const dueInfo = (() => {
    if (!task.dueAt) return null;
    const due = new Date(task.dueAt);
    const now = new Date();
    const diffMs = due.getTime() - now.getTime();
    const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    const overdue = days < 0 && task.status !== "DONE";
    const soon = days >= 0 && days <= 2 && task.status !== "DONE";
    return {
      label: due.toLocaleDateString("pl-PL", {
        day: "2-digit",
        month: "2-digit",
      }),
      days,
      overdue,
      soon,
    };
  })();

  return (
    <div
      draggable={task.status !== "DONE"}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", task.id);
        onDragStart(task.id);
      }}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "group rounded-lg border ring-1 ring-transparent p-3 space-y-2 cursor-pointer transition-all",
        "hover:shadow-md hover:ring-violet-200",
        priority.bg,
        priority.ring,
        isDragging && "opacity-40 scale-95",
        task.status === "DONE" && "opacity-70",
      )}
    >
      {/* Header: priority + due */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {task.priority === "URGENT" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-600 text-white px-1.5 py-0 text-[9px] font-bold uppercase tracking-wide">
              <Flame className="size-2.5" />
              PILNE
            </span>
          )}
          {task.priority === "HIGH" && (
            <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-900 ring-1 ring-amber-300 px-1.5 py-0 text-[9px] font-bold uppercase tracking-wide">
              WYSOKI
            </span>
          )}
        </div>
        {dueInfo && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-1.5 py-0 text-[10px] font-semibold tabular-nums whitespace-nowrap",
              dueInfo.overdue
                ? "bg-rose-100 text-rose-800 ring-1 ring-rose-300"
                : dueInfo.soon
                  ? "bg-amber-100 text-amber-800 ring-1 ring-amber-300"
                  : "bg-slate-100 text-slate-600",
            )}
            title={
              dueInfo.overdue
                ? `Opóźnione o ${Math.abs(dueInfo.days)} dni`
                : `Za ${dueInfo.days} dni`
            }
          >
            <CalendarClock className="size-2.5" />
            {dueInfo.label}
          </span>
        )}
      </div>

      {/* Title */}
      <div
        className={cn(
          "text-sm font-semibold leading-tight",
          priority.text,
          task.status === "DONE" && "line-through",
        )}
      >
        {task.title}
      </div>

      {/* Description preview — opis jest HTML z TipTapa (StarterKit, bezpieczny);
          stripujemy do plain textu dla zwięzłej miniaturki na karcie. Pełen
          formatting widać w dialogu edycji. */}
      {task.description &&
        (() => {
          const plain = task.description
            .replace(/<\/(p|div|h\d|li|br)>/gi, "\n")
            .replace(/<[^>]+>/g, "")
            .replace(/&nbsp;/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .trim();
          if (!plain) return null;
          return (
            <div className="text-[11px] text-slate-500 line-clamp-2 leading-snug whitespace-pre-line">
              {plain}
            </div>
          );
        })()}

      {/* Image preview thumbnail (pierwszy obrazek) */}
      {firstImage && (
        <div className="rounded-md overflow-hidden ring-1 ring-slate-200 bg-slate-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={firstImage}
            alt=""
            className="w-full h-20 object-cover"
            draggable={false}
          />
        </div>
      )}

      {/* Footer: assignee + attachments count */}
      <div className="flex items-center justify-between gap-2 pt-1">
        {task.assignedTo ? (
          <div className="flex items-center gap-1.5 min-w-0">
            <div
              className={cn(
                "size-5 rounded-full grid place-items-center text-[9px] font-bold text-white shrink-0",
                userColor(task.assignedTo.id),
              )}
              title={task.assignedTo.name ?? task.assignedTo.email}
            >
              {initials(task.assignedTo.name ?? task.assignedTo.email)}
            </div>
            <span className="text-[10px] text-slate-600 truncate">
              {task.assignedTo.name ?? task.assignedTo.email}
            </span>
          </div>
        ) : (
          <span className="text-[10px] text-slate-400 italic">
            Pula firmy
          </span>
        )}
        <div className="flex items-center gap-2 text-[10px] text-slate-500 shrink-0">
          {imgCount > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <ImageIcon className="size-2.5" />
              {imgCount}
            </span>
          )}
          {otherFiles > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <Paperclip className="size-2.5" />
              {otherFiles}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
