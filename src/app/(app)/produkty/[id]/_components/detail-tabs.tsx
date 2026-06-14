"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CircleDollarSign,
  FileText,
  Folder,
  Image as ImageIcon,
  Info,
  Layers,
  Package,
  Puzzle,
  ScrollText,
  Settings2,
  Ship,
  ShoppingCart,
  Tag,
  Truck,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

type ThemeKey =
  | "emerald"
  | "indigo"
  | "violet"
  | "amber"
  | "rose"
  | "sky"
  | "lime"
  | "slate";

type ThemeDef = {
  activeText: string;
  indicator: string;
  badgeActive: string;
  badgeInactive: string;
  iconActive: string;
};

const TABS_THEME: Record<ThemeKey, ThemeDef> = {
  emerald: {
    activeText: "text-emerald-900",
    indicator: "bg-gradient-to-r from-emerald-500 to-emerald-400",
    badgeActive: "bg-emerald-100 text-emerald-800 ring-emerald-200",
    badgeInactive: "bg-white/60 text-emerald-700 ring-emerald-100",
    iconActive: "text-emerald-600",
  },
  indigo: {
    activeText: "text-indigo-900",
    indicator: "bg-gradient-to-r from-indigo-500 to-blue-400",
    badgeActive: "bg-indigo-100 text-indigo-800 ring-indigo-200",
    badgeInactive: "bg-white/60 text-indigo-700 ring-indigo-100",
    iconActive: "text-indigo-600",
  },
  violet: {
    activeText: "text-violet-900",
    indicator: "bg-gradient-to-r from-violet-500 to-fuchsia-400",
    badgeActive: "bg-violet-100 text-violet-800 ring-violet-200",
    badgeInactive: "bg-white/60 text-violet-700 ring-violet-100",
    iconActive: "text-violet-600",
  },
  amber: {
    activeText: "text-amber-900",
    indicator: "bg-gradient-to-r from-amber-500 to-orange-400",
    badgeActive: "bg-amber-100 text-amber-800 ring-amber-200",
    badgeInactive: "bg-white/60 text-amber-700 ring-amber-100",
    iconActive: "text-amber-600",
  },
  rose: {
    activeText: "text-rose-900",
    indicator: "bg-gradient-to-r from-rose-500 to-pink-400",
    badgeActive: "bg-rose-100 text-rose-800 ring-rose-200",
    badgeInactive: "bg-white/60 text-rose-700 ring-rose-100",
    iconActive: "text-rose-600",
  },
  sky: {
    activeText: "text-sky-900",
    indicator: "bg-gradient-to-r from-sky-500 to-cyan-400",
    badgeActive: "bg-sky-100 text-sky-800 ring-sky-200",
    badgeInactive: "bg-white/60 text-sky-700 ring-sky-100",
    iconActive: "text-sky-600",
  },
  lime: {
    activeText: "text-lime-900",
    indicator: "bg-gradient-to-r from-lime-500 to-green-400",
    badgeActive: "bg-lime-100 text-lime-800 ring-lime-200",
    badgeInactive: "bg-white/60 text-lime-700 ring-lime-100",
    iconActive: "text-lime-600",
  },
  slate: {
    activeText: "text-slate-900",
    indicator: "bg-gradient-to-r from-slate-500 to-slate-400",
    badgeActive: "bg-slate-200 text-slate-800 ring-slate-300",
    badgeInactive: "bg-white/60 text-slate-700 ring-slate-200",
    iconActive: "text-slate-700",
  },
};

const ICONS: Record<string, LucideIcon> = {
  podstawowe: Info,
  ceny: CircleDollarSign,
  pakowanie: Package,
  import: Ship,
  "parametry-opis": Settings2,
  zamowienia: ShoppingCart,
  komponenty: Puzzle,
  "pudelka-logistyka": Truck,
  grafiki: ImageIcon,
  wytyczne: ScrollText,
  dokumentacja: Folder,
  etapy: Layers,
  etykieta: Tag,
  pudelka: Truck,
  logistyka: Truck,
  zdjecia: ImageIcon,
  pliki: FileText,
};

const TAB_THEME: Record<string, ThemeKey> = {
  podstawowe: "emerald",
  ceny: "amber",
  pakowanie: "indigo",
  import: "amber",
  "parametry-opis": "sky",
  zamowienia: "indigo",
  komponenty: "violet",
  "pudelka-logistyka": "sky",
  grafiki: "rose",
  wytyczne: "lime",
  dokumentacja: "violet",
  etapy: "slate",
  etykieta: "amber",
};

export type DetailTabItem = {
  slug: string;
  label: string;
  /** Liczba w badge'u — np. liczba pudełek, komponentów itd. */
  count?: number;
  /** Badge X/Y (filled/total) — pokazuje postęp uzupełnienia danych w sekcji.
   *  Wyświetlany ZAMIAST `count` gdy obecny. Kolor zależy od wypełnienia:
   *  zielony gdy X===Y, czerwony gdy X==0, neutralny pomiędzy. */
  badge?: string;
  /** Pokazuj tylko gdy `true` (np. komponenty tylko dla KOMPONENTOWY). */
  show?: boolean;
};

/** Parse "X/Y" → ratio (0..1). */
function parseBadgeRatio(badge: string): number | null {
  const m = badge.match(/^(\d+)\/(\d+)$/);
  if (!m) return null;
  const filled = Number(m[1]);
  const total = Number(m[2]);
  if (total === 0) return null;
  return Math.max(0, Math.min(1, filled / total));
}

export function ProductDetailTabs({
  productId,
  items,
  orientation = "horizontal",
}: {
  productId: string;
  items: DetailTabItem[];
  /** Layout: `horizontal` (poziome taby u góry) lub `vertical` (sidebar). */
  orientation?: "horizontal" | "vertical";
}) {
  const pathname = usePathname();
  const basePath = `/produkty/${productId}`;
  const visibleItems = items.filter((it) => it.show !== false);

  const containerRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [indicator, setIndicator] = useState<{
    left: number;
    width: number;
    top: number;
    height: number;
  }>({ left: 0, width: 0, top: 0, height: 0 });

  // Znajdź aktywny slug z pathname
  const activeSlug =
    visibleItems.find((it) => {
      const href = `${basePath}/${it.slug}`;
      return pathname === href || pathname.startsWith(`${href}/`);
    })?.slug ?? visibleItems[0]?.slug;

  function recompute(slug: string) {
    const activeBtn = btnRefs.current[slug];
    const container = containerRef.current;
    if (!activeBtn || !container) return;
    const containerRect = container.getBoundingClientRect();
    const btnRect = activeBtn.getBoundingClientRect();
    setIndicator({
      left: btnRect.left - containerRect.left + container.scrollLeft,
      width: btnRect.width,
      top: btnRect.top - containerRect.top + container.scrollTop,
      height: btnRect.height,
    });
  }

  useEffect(() => {
    if (activeSlug) recompute(activeSlug);
  }, [activeSlug]);

  useEffect(() => {
    function onResize() {
      if (activeSlug) recompute(activeSlug);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [activeSlug]);

  const activeTheme = activeSlug
    ? TABS_THEME[TAB_THEME[activeSlug] ?? "indigo"]
    : TABS_THEME.indigo;

  const isVertical = orientation === "vertical";

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 ring-1 ring-slate-200 p-1 shadow-sm",
        isVertical
          ? "flex flex-col gap-1 w-full"
          : "inline-flex items-center gap-1 max-w-full overflow-x-auto",
      )}
      role="tablist"
      aria-orientation={isVertical ? "vertical" : "horizontal"}
    >
      {/* Animowane tło pod aktywnym tabem */}
      <div
        aria-hidden
        className="absolute rounded-lg bg-white shadow-md ring-1 ring-slate-200/80 transition-all duration-300 ease-out"
        style={
          isVertical
            ? {
                left: 4,
                right: 4,
                top: indicator.top,
                height: indicator.height,
              }
            : {
                top: 4,
                bottom: 4,
                left: indicator.left,
                width: indicator.width,
              }
        }
      />
      {/* Animowany akcent przy aktywnym tabie (na dole horizontal / z lewej vertical) */}
      <div
        aria-hidden
        className={cn(
          "absolute rounded-full transition-all duration-300 ease-out",
          activeTheme.indicator,
          isVertical ? "w-1 left-1" : "h-0.5 bottom-1.5",
        )}
        style={
          isVertical
            ? {
                top: indicator.top + 6,
                height: Math.max(0, indicator.height - 12),
              }
            : {
                left: indicator.left + 12,
                width: Math.max(0, indicator.width - 24),
              }
        }
      />
      {visibleItems.map((it) => {
        const themeKey = TAB_THEME[it.slug] ?? "indigo";
        const theme = TABS_THEME[themeKey];
        const Icon = ICONS[it.slug] ?? Info;
        const href = `${basePath}/${it.slug}`;
        const isActive = activeSlug === it.slug;
        return (
          <Link
            key={it.slug}
            ref={(el) => {
              btnRefs.current[it.slug] = el;
            }}
            href={href}
            role="tab"
            aria-selected={isActive}
            className={cn(
              "relative z-10 inline-flex items-center gap-2 rounded-lg text-sm font-medium transition-all duration-200 group select-none",
              isVertical
                ? "w-full px-3 py-2 justify-start"
                : "px-4 py-2 whitespace-nowrap",
              isActive
                ? cn(theme.activeText, "font-semibold")
                : "text-slate-500 hover:text-slate-800",
            )}
          >
            <Icon
              className={cn(
                "size-4 transition-transform duration-200 shrink-0",
                isActive
                  ? cn(theme.iconActive, "scale-110")
                  : "group-hover:scale-105",
              )}
            />
            <span className={cn(isVertical && "flex-1 min-w-0 truncate")}>
              {it.label}
            </span>
            {it.badge !== undefined && (() => {
              const ratio = parseBadgeRatio(it.badge);
              const colorClass =
                ratio === 1
                  ? "bg-emerald-100 text-emerald-800 ring-emerald-300"
                  : ratio === 0
                    ? "bg-rose-100 text-rose-800 ring-rose-300"
                    : ratio != null && ratio >= 0.5
                      ? "bg-amber-100 text-amber-800 ring-amber-300"
                      : "bg-slate-100 text-slate-700 ring-slate-300";
              return (
                <span
                  className={cn(
                    "inline-flex items-center justify-center min-w-[2rem] h-5 px-1.5 rounded-full text-[10px] font-bold tabular-nums ring-1 transition-colors duration-200 shrink-0",
                    isVertical && "ml-auto",
                    colorClass,
                  )}
                >
                  {it.badge}
                </span>
              );
            })()}
            {it.badge === undefined &&
              it.count !== undefined &&
              it.count > 0 && (
                <span
                  className={cn(
                    "inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-full text-[10px] font-bold tabular-nums ring-1 transition-colors duration-200 shrink-0",
                    isVertical && "ml-auto",
                    isActive ? theme.badgeActive : theme.badgeInactive,
                  )}
                >
                  {it.count}
                </span>
              )}
          </Link>
        );
      })}
    </div>
  );
}
