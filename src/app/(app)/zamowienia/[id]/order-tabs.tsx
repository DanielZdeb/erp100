"use client";

import { useEffect, useRef, useState } from "react";
import {
  ClipboardList,
  FileText,
  Package,
  Truck,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ThemeKey = "emerald" | "indigo" | "violet" | "amber" | "cyan";

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
  cyan: {
    activeText: "text-cyan-900",
    indicator: "bg-gradient-to-r from-cyan-500 to-teal-400",
    badgeActive: "bg-cyan-100 text-cyan-800 ring-cyan-200",
    badgeInactive: "bg-white/60 text-cyan-700 ring-cyan-100",
    iconActive: "text-cyan-600",
  },
};

type TabId =
  | "order"
  | "guidelines-fabryka"
  | "guidelines-szwalnia"
  | "payments"
  | "docs"
  | "awizacja";

type TabDef = {
  id: TabId;
  label: string;
  icon: LucideIcon;
  badge?: string;
  theme: ThemeKey;
  content: React.ReactNode;
};

export function OrderTabs({
  itemsBadge,
  paymentsBadge,
  docsBadge,
  awizacjaBadge,
  guidelinesBadge,
  orderSection,
  paymentsSection,
  docsSection,
  awizacjaSection,
  guidelinesFabrykaSection,
  guidelinesSzwalniaSection,
}: {
  itemsBadge?: string;
  paymentsBadge?: string;
  docsBadge?: string;
  awizacjaBadge?: string;
  guidelinesBadge?: string;
  orderSection: React.ReactNode;
  paymentsSection: React.ReactNode;
  docsSection: React.ReactNode;
  awizacjaSection: React.ReactNode;
  /** Zakładka „Zamówienie Fabryka" (PL). Generuje PDF z trybem fabryka. */
  guidelinesFabrykaSection?: React.ReactNode;
  /** Zakładka „Zamówienie Szwalnia" (PL). Generuje PDF z trybem krajalnia. */
  guidelinesSzwalniaSection?: React.ReactNode;
}) {
  const [tab, setTab] = useState<TabId>("order");

  const containerRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Record<TabId, HTMLButtonElement | null>>({
    order: null,
    "guidelines-fabryka": null,
    "guidelines-szwalnia": null,
    payments: null,
    docs: null,
    awizacja: null,
  });
  const [indicator, setIndicator] = useState<{ left: number; width: number }>({
    left: 0,
    width: 0,
  });

  function recompute(activeId: TabId) {
    const activeBtn = btnRefs.current[activeId];
    const container = containerRef.current;
    if (!activeBtn || !container) return;
    const containerRect = container.getBoundingClientRect();
    const btnRect = activeBtn.getBoundingClientRect();
    setIndicator({
      left: btnRect.left - containerRect.left,
      width: btnRect.width,
    });
  }

  useEffect(() => {
    recompute(tab);
  }, [tab]);

  useEffect(() => {
    function onResize() {
      recompute(tab);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [tab]);

  const tabs: TabDef[] = [
    {
      id: "order",
      label: "Zamówienie",
      icon: Package,
      badge: itemsBadge,
      theme: "emerald",
      content: orderSection,
    },
    ...(guidelinesFabrykaSection
      ? [
          {
            id: "guidelines-fabryka" as TabId,
            label: "Zamówienie Fabryka",
            icon: ClipboardList,
            badge: guidelinesBadge,
            theme: "amber" as ThemeKey,
            content: guidelinesFabrykaSection,
          },
        ]
      : []),
    ...(guidelinesSzwalniaSection
      ? [
          {
            id: "guidelines-szwalnia" as TabId,
            label: "Zamówienie Szwalnia",
            icon: ClipboardList,
            badge: guidelinesBadge,
            theme: "cyan" as ThemeKey,
            content: guidelinesSzwalniaSection,
          },
        ]
      : []),
    {
      id: "payments",
      label: "Płatności",
      icon: Wallet,
      badge: paymentsBadge,
      theme: "indigo",
      content: paymentsSection,
    },
    {
      id: "docs",
      label: "Dokumentacja",
      icon: FileText,
      badge: docsBadge,
      theme: "violet",
      content: docsSection,
    },
    {
      id: "awizacja",
      label: "Awizacja i PZ",
      icon: Truck,
      badge: awizacjaBadge,
      theme: "amber",
      content: awizacjaSection,
    },
  ];

  const activeTabDef = tabs.find((t) => t.id === tab)!;

  return (
    <div className="space-y-5">
      {/* Pasek zakładek */}
      <div
        ref={containerRef}
        className="relative inline-flex items-center gap-1 rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 ring-1 ring-slate-200 p-1 shadow-sm"
        role="tablist"
        aria-orientation="horizontal"
      >
        {/* Animowane tło pod aktywnym tabem */}
        <div
          aria-hidden
          className="absolute top-1 bottom-1 rounded-lg bg-white shadow-md ring-1 ring-slate-200/80 transition-all duration-300 ease-out"
          style={{
            left: indicator.left,
            width: indicator.width,
          }}
        />
        {/* Animowany akcent na dole aktywnego taba (cienka kreska) */}
        <div
          aria-hidden
          className={cn(
            "absolute bottom-1.5 h-0.5 rounded-full transition-all duration-300 ease-out",
            TABS_THEME[activeTabDef.theme].indicator,
          )}
          style={{
            left: indicator.left + 12,
            width: Math.max(0, indicator.width - 24),
          }}
        />
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.id;
          const theme = TABS_THEME[t.theme];
          return (
            <button
              key={t.id}
              ref={(el) => {
                btnRefs.current[t.id] = el;
              }}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setTab(t.id)}
              className={cn(
                "relative z-10 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 group select-none",
                isActive
                  ? cn(theme.activeText, "font-semibold")
                  : "text-slate-500 hover:text-slate-800",
              )}
            >
              <Icon
                className={cn(
                  "size-4 transition-transform duration-200",
                  isActive
                    ? cn(theme.iconActive, "scale-110")
                    : "group-hover:scale-105",
                )}
              />
              <span>{t.label}</span>
              {t.badge && (
                <span
                  className={cn(
                    "inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-full text-[10px] font-bold tabular-nums ring-1 transition-colors duration-200",
                    isActive ? theme.badgeActive : theme.badgeInactive,
                  )}
                >
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Treść z animacją wejścia */}
      <div className="relative">
        <div
          key={tab}
          className="animate-in fade-in-0 slide-in-from-bottom-1 duration-300"
        >
          {activeTabDef.content}
        </div>
      </div>
    </div>
  );
}
