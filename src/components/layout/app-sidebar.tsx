"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen,
  Box,
  ClipboardCheck,
  FileText,
  FolderTree,
  Image as ImageIcon,
  LayoutDashboard,
  Package,
  Settings,
  Ship,
  Sparkles,
  Tag,
  Truck,
  UserCircle,
  Wand2,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { UserMenu } from "./user-menu";
import { FlagCN, FlagPL } from "@/components/icons/country-flags";
import { cn } from "@/lib/utils";
import type { Session } from "next-auth";

type NavIcon = ComponentType<SVGProps<SVGSVGElement>>;

type NavChild = {
  href: string;
  label: string;
  icon: NavIcon;
  disabled?: boolean;
};

type NavItem = {
  href: string;
  label: string;
  icon: NavIcon;
  accent: string;
  activeBg: string;
  children?: NavChild[];
  nonClickable?: boolean;
  disabled?: boolean;
};

type Workspace = "import" | "sprzedaz";

const NAV_IMPORT: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    accent: "text-indigo-500",
    activeBg: "bg-indigo-50 text-indigo-700",
  },
  {
    href: "/produkty",
    label: "Produkty i komponenty",
    icon: Package,
    accent: "text-emerald-500",
    activeBg: "bg-emerald-50 text-emerald-700",
    nonClickable: true,
    children: [
      { href: "/produkty", label: "Produkty", icon: Package },
      {
        href: "/produkty/kontrola",
        label: "Kontrola produktowa",
        icon: ClipboardCheck,
      },
      { href: "/produkty/kategorie", label: "Kategorie", icon: FolderTree },
      { href: "/produkty/pudelka", label: "Pudełka", icon: Box },
      { href: "/produkty/instrukcje", label: "Instrukcje", icon: BookOpen },
    ],
  },
  {
    href: "/zamowienia",
    label: "Zamówienia",
    icon: Ship,
    accent: "text-cyan-500",
    activeBg: "bg-cyan-50 text-cyan-700",
    nonClickable: true,
    children: [
      { href: "/zamowienia", label: "Zamówienia z Chin", icon: FlagCN },
      {
        href: "/zamowienia/z-polski",
        label: "Zamówienia z Polski",
        icon: FlagPL,
      },
    ],
  },
  {
    href: "/kurierzy",
    label: "Kurierzy",
    icon: Truck,
    accent: "text-amber-500",
    activeBg: "bg-amber-50 text-amber-700",
  },
  {
    href: "/ustawienia",
    label: "Ustawienia",
    icon: Settings,
    accent: "text-slate-500",
    activeBg: "bg-slate-100 text-slate-700",
  },
  {
    href: "/moje-konto",
    label: "Moje konto",
    icon: UserCircle,
    accent: "text-rose-500",
    activeBg: "bg-rose-50 text-rose-700",
  },
];

const NAV_SPRZEDAZ: NavItem[] = [
  {
    href: "/sprzedaz",
    label: "Dashboard sprzedaży",
    icon: LayoutDashboard,
    accent: "text-indigo-500",
    activeBg: "bg-indigo-50 text-indigo-700",
  },
  {
    href: "/sprzedaz/oferty",
    label: "Oferty",
    icon: Tag,
    accent: "text-pink-500",
    activeBg: "bg-pink-50 text-pink-700",
    disabled: true,
  },
  {
    href: "/sprzedaz/opisy",
    label: "Opisy produktów",
    icon: FileText,
    accent: "text-emerald-500",
    activeBg: "bg-emerald-50 text-emerald-700",
    disabled: true,
  },
  {
    href: "/sprzedaz/zdjecia",
    label: "Zdjęcia",
    icon: ImageIcon,
    accent: "text-orange-500",
    activeBg: "bg-orange-50 text-orange-700",
    disabled: true,
  },
  {
    href: "/grafiki",
    label: "Generator grafik",
    icon: Wand2,
    accent: "text-violet-500",
    activeBg: "bg-violet-50 text-violet-700",
  },
  {
    href: "/ustawienia",
    label: "Ustawienia",
    icon: Settings,
    accent: "text-slate-500",
    activeBg: "bg-slate-100 text-slate-700",
  },
  {
    href: "/moje-konto",
    label: "Moje konto",
    icon: UserCircle,
    accent: "text-rose-500",
    activeBg: "bg-rose-50 text-rose-700",
  },
];

const SPRZEDAZ_PREFIXES = ["/sprzedaz", "/grafiki", "/oferty", "/opisy", "/zdjecia"];

function detectWorkspace(pathname: string): Workspace {
  const isSprzedaz = SPRZEDAZ_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  return isSprzedaz ? "sprzedaz" : "import";
}

export function AppSidebar({ user }: { user: Session["user"] }) {
  const pathname = usePathname();
  const router = useRouter();
  const workspace = detectWorkspace(pathname);
  const nav = workspace === "sprzedaz" ? NAV_SPRZEDAZ : NAV_IMPORT;

  return (
    <aside
      className="shrink-0 border-r bg-sidebar flex flex-col w-64"
      suppressHydrationWarning
    >
      {/* Header z logo */}
      <div className="border-b flex items-center gap-2 py-4 px-5">
        <Link
          href={workspace === "sprzedaz" ? "/sprzedaz" : "/dashboard"}
          className="font-heading font-bold text-lg tracking-tight inline-flex items-center gap-2 min-w-0"
        >
          <span className="size-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white grid place-items-center text-sm shadow-sm shrink-0">
            E
          </span>
          <span className="truncate">ERP firmy</span>
        </Link>
      </div>

      {/* Workspace tabs (IMPORT / SPRZEDAŻ) */}
      <div className="border-b px-3 py-2.5">
        <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-100">
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className={cn(
              "px-2.5 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wide transition-all",
              workspace === "import"
                ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                : "text-slate-500 hover:text-slate-700",
            )}
          >
            <span className="inline-flex items-center gap-1.5">
              <Ship className="size-3.5" />
              Import
            </span>
          </button>
          <button
            type="button"
            onClick={() => router.push("/sprzedaz")}
            className={cn(
              "px-2.5 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wide transition-all",
              workspace === "sprzedaz"
                ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                : "text-slate-500 hover:text-slate-700",
            )}
          >
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="size-3.5" />
              Sprzedaż
            </span>
          </button>
        </div>
      </div>

      {/* Nawigacja — wszystkie sekcje rozwinięte stale */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {nav.map((item) => {
          const active = item.nonClickable
            ? item.children?.some(
                (c) =>
                  pathname === c.href || pathname.startsWith(`${c.href}/`),
              ) ?? false
            : pathname === item.href ||
              pathname.startsWith(`${item.href}/`);

          const parentClasses = cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
            item.disabled
              ? "text-slate-400 italic cursor-not-allowed select-none"
              : item.nonClickable
                ? cn(
                    "uppercase tracking-wide text-[11px] text-slate-500 select-none cursor-default",
                    active && "text-slate-700",
                  )
                : active
                  ? cn(item.activeBg, "shadow-sm ring-1 ring-current/10")
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
          );

          const parentContent = (
            <>
              <item.icon
                className={cn(
                  "size-[18px] shrink-0 transition-colors",
                  item.disabled
                    ? "opacity-60"
                    : item.nonClickable || active
                      ? ""
                      : item.accent,
                  item.nonClickable && active && item.accent,
                )}
              />
              <span className="flex-1 truncate">{item.label}</span>
              {item.disabled && (
                <span className="text-[9px] uppercase tracking-wide bg-slate-100 text-slate-400 px-1 py-0 rounded">
                  wkrótce
                </span>
              )}
            </>
          );

          return (
            <div key={item.href} className="space-y-1">
              {item.disabled ? (
                <div className={parentClasses} title="Wkrótce dostępne">
                  {parentContent}
                </div>
              ) : item.nonClickable ? (
                <div className={parentClasses}>{parentContent}</div>
              ) : (
                <Link href={item.href} className={parentClasses}>
                  {parentContent}
                </Link>
              )}

              {/* Children — zawsze widoczne (menu stale rozwinięte) */}
              {item.children && (
                <div className="ml-3 pl-4 border-l border-slate-200 space-y-0.5">
                  {(() => {
                    const candidates = item.children.filter(
                      (c) =>
                        !c.disabled &&
                        !c.href.includes("#") &&
                        (pathname === c.href ||
                          pathname.startsWith(`${c.href}/`)),
                    );
                    const bestMatch = candidates.reduce<typeof candidates[number] | null>(
                      (best, c) =>
                        !best || c.href.length > best.href.length ? c : best,
                      null,
                    );
                    return item.children.map((child) => {
                      if (child.disabled) {
                        return (
                          <div
                            key={child.href}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium text-slate-400 italic cursor-not-allowed select-none"
                            title="Wkrótce dostępne"
                          >
                            <child.icon className="size-3.5 shrink-0 opacity-60" />
                            <span className="truncate">{child.label}</span>
                            <span className="ml-auto text-[9px] uppercase tracking-wide bg-slate-100 text-slate-400 px-1 py-0 rounded">
                              wkrótce
                            </span>
                          </div>
                        );
                      }
                      const childActive = bestMatch?.href === child.href;
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={cn(
                            "flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                            childActive
                              ? cn(item.activeBg, "ring-1 ring-current/10")
                              : "text-slate-500 hover:bg-slate-100 hover:text-slate-700",
                          )}
                        >
                          <child.icon className="size-3.5 shrink-0" />
                          {child.label}
                        </Link>
                      );
                    });
                  })()}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* User menu */}
      <div className="border-t bg-white/40 p-3">
        <UserMenu user={user} collapsed={false} />
      </div>
    </aside>
  );
}
