import {
  Anchor,
  Factory,
  Handshake,
  Lightbulb,
  PackageCheck,
  Ship,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

export const ORDER_STATUSES = [
  "PLANOWANE",
  "DOGADYWANE",
  "PRODUKOWANE",
  "WYPRODUKOWANE",
  "WYSLANE",
  "ODEBRANE",
  "W_MAGAZYNIE",
] as const;

export type OrderStatusT = (typeof ORDER_STATUSES)[number];

export const STATUS_LABEL: Record<OrderStatusT, string> = {
  PLANOWANE: "Planowane",
  DOGADYWANE: "Dogadywane",
  PRODUKOWANE: "Produkowane",
  WYPRODUKOWANE: "Wyprodukowane (QC)",
  WYSLANE: "Wysłane",
  ODEBRANE: "W porcie",
  W_MAGAZYNIE: "W magazynie — zamknięto",
};

export const STATUS_SHORT: Record<OrderStatusT, string> = {
  PLANOWANE: "Planowane",
  DOGADYWANE: "Dogadywane",
  PRODUKOWANE: "Produkowane",
  WYPRODUKOWANE: "QC",
  WYSLANE: "Wysłane",
  ODEBRANE: "W porcie",
  W_MAGAZYNIE: "W magazynie",
};

export const STATUS_ICON: Record<OrderStatusT, LucideIcon> = {
  PLANOWANE: Lightbulb,
  DOGADYWANE: Handshake,
  PRODUKOWANE: Factory,
  WYPRODUKOWANE: PackageCheck,
  WYSLANE: Ship,
  ODEBRANE: Anchor,
  W_MAGAZYNIE: Warehouse,
};

export const STATUS_ORDER = ORDER_STATUSES;

/** Statusy, w których zamówienie można jeszcze usunąć. */
export const DELETABLE_STATUSES: ReadonlyArray<OrderStatusT> = [
  "PLANOWANE",
  "DOGADYWANE",
];

export function canDeleteOrder(status: OrderStatusT): boolean {
  return (DELETABLE_STATUSES as readonly string[]).includes(status);
}

/**
 * Po wejściu „W magazynie" zamówienie jest historycznym snapshotem —
 * ceny zakupu (USD/CNY/kursy) są zamrażane i zasilają historię cen
 * produktu. Edycja blokowana po stronie UI i serwera.
 *
 * Jeśli user cofnie status (np. → ODEBRANE), edycja znów dostępna,
 * a kolejne przejście do W_MAGAZYNIE odświeży snapshot (upsert).
 */
export function isOrderLocked(status: OrderStatusT): boolean {
  return status === "W_MAGAZYNIE";
}

/** Czy można edytować ceny zakupu (USD/CNY/kursy + brutto/netto flag). */
export function canEditPurchasePrice(status: OrderStatusT): boolean {
  return !isOrderLocked(status);
}
