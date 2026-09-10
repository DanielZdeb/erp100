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
      <div className="h-1 bg-slate-100 rounded-full overflow-hidden mb-6">
        <div
          className="h-full bg-slate-900 transition-all duration-300"
          style={{ width: `${((i + 1) / total) * 100}%` }}
        />
      </div>

      {/* Kropki + licznik */}
      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
          {i + 1} / {total}
          {section.title && (
            <span className="ml-2 text-slate-400 font-normal normal-case tracking-normal">
              · {section.title}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto max-w-[50%]">
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

      {/* Nawigacja u dołu */}
      <div className="mt-10 flex items-center justify-between gap-3 border-t border-slate-200 pt-6">
        <button
          type="button"
          onClick={() => go(i - 1)}
          disabled={!canPrev}
          className={
            canPrev
              ? "inline-flex items-center gap-2 rounded-lg bg-slate-900 text-white px-4 py-2.5 text-sm font-semibold hover:bg-slate-800 transition-colors"
              : "inline-flex items-center gap-2 rounded-lg bg-slate-100 text-slate-400 px-4 py-2.5 text-sm font-semibold cursor-not-allowed"
          }
        >
          <ChevronLeft className="size-4" />
          Poprzednia
        </button>
        <div className="text-xs text-slate-400 hidden sm:block">
          ← → klawiatura · swipe na mobile
        </div>
        <button
          type="button"
          onClick={() => go(i + 1)}
          disabled={!canNext}
          className={
            canNext
              ? "inline-flex items-center gap-2 rounded-lg bg-slate-900 text-white px-4 py-2.5 text-sm font-semibold hover:bg-slate-800 transition-colors"
              : "inline-flex items-center gap-2 rounded-lg bg-slate-100 text-slate-400 px-4 py-2.5 text-sm font-semibold cursor-not-allowed"
          }
        >
          Następna
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}
