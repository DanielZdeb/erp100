/**
 * 6 typów pudełek wynikających z kombinacji 3 atrybutów:
 *   - packagingType (BOX / POLY_BAG)
 *   - origin (POLAND / CHINA_STANDARD)
 *   - isCollective (false = pojedyncze wysyłkowe, true = master/zbiorczy)
 *
 * Współdzielone między biblioteką pudełek (`/produkty/pudelka`) a pickerami
 * w wizardzie produktu — żeby wszędzie był ten sam label, ikona i kolor.
 */

import type { LucideIcon } from "lucide-react";
import { Boxes, Mail, Package, ShoppingBag } from "lucide-react";

export type BoxKind =
  | "PL_WYSYLKOWE"
  | "PL_ZBIORCZE"
  | "PL_FOLIOPAK"
  | "CN_WYSYLKOWE"
  | "CN_ZBIORCZE"
  | "CN_FOLIOPAK";

export type BoxKindMeta = {
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  /** Tailwind classy: bg-* text-* dla badge'u w tabeli/picker'ze. */
  badgeClass: string;
  /** Akcent solid (dla aktywnej zakładki, button). */
  solidClass: string;
};

export const BOX_KIND_META: Record<BoxKind, BoxKindMeta> = {
  PL_WYSYLKOWE: {
    label: "pl Wysyłkowe",
    shortLabel: "pl Wysyłkowe",
    icon: ShoppingBag,
    badgeClass: "bg-indigo-100 text-indigo-800 ring-indigo-200",
    solidClass: "bg-indigo-600 text-white",
  },
  PL_ZBIORCZE: {
    label: "pl Zbiorcze",
    shortLabel: "pl Zbiorcze",
    icon: Boxes,
    badgeClass: "bg-orange-100 text-orange-800 ring-orange-200",
    solidClass: "bg-orange-600 text-white",
  },
  PL_FOLIOPAK: {
    label: "pl Foliopak",
    shortLabel: "pl Foliopak",
    icon: Mail,
    badgeClass: "bg-rose-100 text-rose-800 ring-rose-200",
    solidClass: "bg-rose-600 text-white",
  },
  CN_WYSYLKOWE: {
    label: "cn Wysyłkowe",
    shortLabel: "cn Wysyłkowe",
    icon: Package,
    badgeClass: "bg-amber-100 text-amber-800 ring-amber-200",
    solidClass: "bg-amber-600 text-white",
  },
  CN_ZBIORCZE: {
    label: "cn Zbiorcze",
    shortLabel: "cn Zbiorcze",
    icon: Boxes,
    badgeClass: "bg-lime-100 text-lime-800 ring-lime-200",
    solidClass: "bg-lime-600 text-white",
  },
  CN_FOLIOPAK: {
    label: "cn Foliopak",
    shortLabel: "cn Foliopak",
    icon: Mail,
    badgeClass: "bg-pink-100 text-pink-800 ring-pink-200",
    solidClass: "bg-pink-600 text-white",
  },
};

export function getBoxKind(box: {
  packagingType: "BOX" | "POLY_BAG";
  origin: "POLAND" | "CHINA_STANDARD" | null | undefined;
  isCollective: boolean | null | undefined;
}): BoxKind {
  const isFoliopak = box.packagingType === "POLY_BAG";
  const isCN = box.origin === "CHINA_STANDARD";
  if (isFoliopak) {
    return isCN ? "CN_FOLIOPAK" : "PL_FOLIOPAK";
  }
  if (box.isCollective) {
    return isCN ? "CN_ZBIORCZE" : "PL_ZBIORCZE";
  }
  return isCN ? "CN_WYSYLKOWE" : "PL_WYSYLKOWE";
}

/** Wszystkie kindy w kolejności wyświetlania (do tabs, list filtrów). */
export const ALL_BOX_KINDS: BoxKind[] = [
  "PL_WYSYLKOWE",
  "PL_ZBIORCZE",
  "PL_FOLIOPAK",
  "CN_WYSYLKOWE",
  "CN_ZBIORCZE",
  "CN_FOLIOPAK",
];
