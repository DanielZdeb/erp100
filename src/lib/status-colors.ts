import type { OrderStatusT } from "@/lib/order-status";

export const STATUS_BADGE: Record<OrderStatusT, string> = {
  PLANOWANE: "bg-slate-100 text-slate-700 ring-slate-200",
  DOGADYWANE: "bg-amber-100 text-amber-800 ring-amber-200",
  PRODUKOWANE: "bg-orange-100 text-orange-700 ring-orange-200",
  WYPRODUKOWANE: "bg-purple-100 text-purple-700 ring-purple-200",
  WYSLANE: "bg-cyan-100 text-cyan-700 ring-cyan-200",
  ODEBRANE: "bg-teal-100 text-teal-700 ring-teal-200",
  W_MAGAZYNIE: "bg-emerald-100 text-emerald-700 ring-emerald-200",
};

export const STATUS_THEME: Record<
  OrderStatusT,
  {
    text: string;
    bg: string;
    border: string;
    iconBg: string;
    activeBg: string;
    activeText: string;
    activeBorder: string;
    accent: string;
  }
> = {
  PLANOWANE: {
    text: "text-slate-700",
    bg: "bg-slate-50",
    border: "border-slate-200",
    iconBg: "bg-slate-100",
    activeBg: "bg-slate-100",
    activeText: "text-slate-900",
    activeBorder: "border-slate-400",
    accent: "text-slate-500",
  },
  DOGADYWANE: {
    text: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200",
    iconBg: "bg-amber-100",
    activeBg: "bg-amber-100",
    activeText: "text-amber-900",
    activeBorder: "border-amber-400",
    accent: "text-amber-500",
  },
  PRODUKOWANE: {
    text: "text-orange-700",
    bg: "bg-orange-50",
    border: "border-orange-200",
    iconBg: "bg-orange-100",
    activeBg: "bg-orange-100",
    activeText: "text-orange-900",
    activeBorder: "border-orange-400",
    accent: "text-orange-500",
  },
  WYPRODUKOWANE: {
    text: "text-purple-700",
    bg: "bg-purple-50",
    border: "border-purple-200",
    iconBg: "bg-purple-100",
    activeBg: "bg-purple-100",
    activeText: "text-purple-900",
    activeBorder: "border-purple-400",
    accent: "text-purple-500",
  },
  WYSLANE: {
    text: "text-cyan-700",
    bg: "bg-cyan-50",
    border: "border-cyan-200",
    iconBg: "bg-cyan-100",
    activeBg: "bg-cyan-100",
    activeText: "text-cyan-900",
    activeBorder: "border-cyan-400",
    accent: "text-cyan-500",
  },
  ODEBRANE: {
    text: "text-teal-700",
    bg: "bg-teal-50",
    border: "border-teal-200",
    iconBg: "bg-teal-100",
    activeBg: "bg-teal-100",
    activeText: "text-teal-900",
    activeBorder: "border-teal-400",
    accent: "text-teal-500",
  },
  W_MAGAZYNIE: {
    text: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    iconBg: "bg-emerald-100",
    activeBg: "bg-emerald-100",
    activeText: "text-emerald-900",
    activeBorder: "border-emerald-400",
    accent: "text-emerald-500",
  },
};
