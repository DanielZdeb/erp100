"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

export type ChannelView = "sklep" | "allegro" | "all";

/**
 * Client-side toggle dla widoku kanałów (Sklep / Allegro / Wszystkie) na
 * liście produktów. Toggle bez przeładowania strony — `display: none` na
 * komórkach poprzez data attribute na wrapperze + CSS w globals.css.
 *
 * Komórki Allegro powinny mieć klasę `cv-allegro`, Sklepu `cv-sklep`.
 */
export function ChannelViewSwitcher({
  children,
}: {
  children: React.ReactNode;
}) {
  const [view, setView] = useState<ChannelView>("sklep");

  return (
    <div className="space-y-3 cv-wrapper" data-cv={view}>
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Kanał:
        </span>
        <div className="inline-flex rounded-lg ring-1 ring-border bg-card p-0.5 gap-0.5">
          {(
            [
              { id: "sklep", label: "Sklep", activeCls: "bg-emerald-600 text-white" },
              { id: "allegro", label: "Allegro", activeCls: "bg-amber-500 text-white" },
              { id: "all", label: "Wszystkie", activeCls: "bg-primary text-primary-foreground" },
            ] as { id: ChannelView; label: string; activeCls: string }[]
          ).map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setView(c.id)}
              className={cn(
                "px-3 py-1 rounded-md text-xs font-medium transition-colors",
                view === c.id
                  ? c.activeCls
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
      {children}
    </div>
  );
}
