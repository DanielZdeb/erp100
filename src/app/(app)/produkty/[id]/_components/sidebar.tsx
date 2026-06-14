"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CircleDollarSign,
  FileText,
  Folder,
  Image as ImageIcon,
  Info,
  Layers,
  Puzzle,
  ScrollText,
  ShoppingCart,
  Tag,
  Truck,
} from "lucide-react";

import { cn } from "@/lib/utils";

const ICONS: Record<string, React.ElementType> = {
  podstawowe: Info,
  ceny: CircleDollarSign,
  zamowienia: ShoppingCart,
  komponenty: Puzzle,
  "pudelka-logistyka": Truck,
  grafiki: ImageIcon,
  wytyczne: ScrollText,
  dokumentacja: Folder,
  etapy: Layers,
  etykieta: Tag,
  // Legacy fallbacks (zachowane dla bezpieczeństwa)
  pudelka: Truck,
  logistyka: Truck,
  zdjecia: ImageIcon,
  pliki: FileText,
};

export type SidebarItem = {
  slug: string;
  label: string;
  /** Liczba w prawym górnym rogu — np. liczba pudełek, komponentów itd. */
  count?: number;
  /** Pokazuj tylko gdy `true` (np. komponenty tylko dla KOMPONENTOWY). */
  show?: boolean;
};

export function ProductDetailSidebar({
  productId,
  items,
}: {
  productId: string;
  items: SidebarItem[];
}) {
  const pathname = usePathname();
  const basePath = `/produkty/${productId}`;
  return (
    <nav className="w-56 shrink-0 space-y-0.5 text-sm">
      {items
        .filter((it) => it.show !== false)
        .map((it) => {
          const href = `${basePath}/${it.slug}`;
          const isActive = pathname === href || pathname.startsWith(`${href}/`);
          const Icon = ICONS[it.slug] ?? Info;
          return (
            <Link
              key={it.slug}
              href={href}
              className={cn(
                "flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 transition-colors",
                isActive
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <span className="flex items-center gap-2">
                <Icon
                  className={cn(
                    "size-4 shrink-0",
                    isActive ? "text-primary" : "text-muted-foreground",
                  )}
                />
                <span className="truncate">{it.label}</span>
              </span>
              {it.count !== undefined && it.count > 0 && (
                <span
                  className={cn(
                    "text-[10px] tabular-nums rounded-full px-1.5 py-0.5 min-w-[18px] text-center",
                    isActive
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {it.count}
                </span>
              )}
            </Link>
          );
        })}
    </nav>
  );
}
