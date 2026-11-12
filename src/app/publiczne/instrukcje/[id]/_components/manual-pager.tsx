"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Section = { title: string; html: string };

export function ManualPager({ sections }: { sections: Section[] }) {
  const [i, setI] = useState(0);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const total = sections.length;

  const go = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(total - 1, next));
      setI(clamped);
    },
    [total],
  );

  // Autoscroll do góry treści przy zmianie sekcji.
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [i]);

  // Klawiatura ← / →
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") go(i - 1);
      else if (e.key === "ArrowRight") go(i + 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [i, go]);

  // Swipe mobile
  const touchStartX = useRef<number | null>(null);
  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current == null) return;
    const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
    if (Math.abs(dx) > 60) {
      if (dx < 0) go(i + 1);
      else go(i - 1);
    }
    touchStartX.current = null;
  }

  const section = sections[i];
  if (!section) return null;

  const canPrev = i > 0;
  const canNext = i < total - 1;

  return (
    <div>
      {/* Progress bar u góry (thin) */}
      <div className="h-1 bg-slate-100 rounded-full overflow-hidden mb-4">
        <div
          className="h-full bg-slate-900 transition-all duration-300"
          style={{ width: `${((i + 1) / total) * 100}%` }}
        />
      </div>

      {/* Licznik + tytul sekcji */}
      <div className="flex items-center justify-between mb-3 gap-3">
        <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider shrink-0">
          {i + 1} / {total}
        </div>
        {section.title && (
          <div className="text-xs text-slate-500 truncate">
            {section.title}
          </div>
        )}
        <div className="flex items-center gap-1.5 overflow-x-auto shrink-0">
          {sections.map((s, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => go(idx)}
              aria-label={`Sekcja ${idx + 1}${s.title ? `: ${s.title}` : ""}`}
              className={
                idx === i
                  ? "size-2 rounded-full bg-slate-900 shrink-0"
                  : "size-2 rounded-full bg-slate-300 hover:bg-slate-500 transition-colors shrink-0"
              }
            />
          ))}
        </div>
      </div>

      {/* Treść sekcji */}
      <div
        ref={contentRef}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className="min-h-[40vh]"
      >
        <article
          className="manual-content"
          dangerouslySetInnerHTML={{ __html: section.html }}
        />
      </div>

      {/* Sticky bottom nav — zawsze przyklejona do dołu ekranu */}
      <div
        className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur border-t border-slate-200"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => go(i - 1)}
            disabled={!canPrev}
            className={
              canPrev
                ? "inline-flex items-center gap-1.5 rounded-lg bg-slate-900 text-white px-4 py-2.5 text-sm font-semibold hover:bg-slate-800 transition-colors shadow-sm"
                : "inline-flex items-center gap-1.5 rounded-lg bg-slate-100 text-slate-400 px-4 py-2.5 text-sm font-semibold cursor-not-allowed"
            }
          >
            <ChevronLeft className="size-4" />
            <span className="hidden sm:inline">Poprzednia</span>
          </button>
          <div className="text-xs font-semibold text-slate-700 tabular-nums">
            {i + 1} / {total}
          </div>
          <button
            type="button"
            onClick={() => go(i + 1)}
            disabled={!canNext}
            className={
              canNext
                ? "inline-flex items-center gap-1.5 rounded-lg bg-slate-900 text-white px-4 py-2.5 text-sm font-semibold hover:bg-slate-800 transition-colors shadow-sm"
                : "inline-flex items-center gap-1.5 rounded-lg bg-slate-100 text-slate-400 px-4 py-2.5 text-sm font-semibold cursor-not-allowed"
            }
          >
            <span className="hidden sm:inline">Następna</span>
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      {/* Spacer zeby ostatnia tresc nie byla zaslaniana przez sticky nav */}
      <div className="h-24" aria-hidden="true" />
    </div>
  );
}
