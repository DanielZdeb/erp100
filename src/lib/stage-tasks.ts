import type { OrderStatusT } from "@/lib/order-status";

export type StageTaskTemplate = {
  /** Stały klucz identyfikujący zadanie — używany do deduplikacji. */
  key: string;
  title: string;
};

/**
 * Sztywne zadania per etap. Każde zamówienie dostaje te zadania automatycznie
 * kiedy wchodzi w dany etap (poprzez `ensureStageTaskTemplates`).
 * User może dodać własne zadania obok tych sztywnych.
 */
export const STAGE_TASK_TEMPLATES: Record<OrderStatusT, StageTaskTemplate[]> = {
  PLANOWANE: [
    { key: "PLAN:select-products", title: "Wybierz produkty do zamówienia" },
    { key: "PLAN:set-quantities", title: "Ustal wstępne ilości i ceny" },
    { key: "PLAN:check-rates", title: "Sprawdź kurs USD / CNY" },
  ],
  DOGADYWANE: [
    { key: "TALK:send-rfq", title: "Wyślij zapytanie ofertowe do producenta" },
    { key: "TALK:receive-proforma", title: "Otrzymaj wstępną proformę" },
    { key: "TALK:negotiate", title: "Negocjuj cenę / minimum zamówienia" },
    { key: "TALK:accept-proforma", title: "Zaakceptuj ostateczną proformę" },
  ],
  PRODUKOWANE: [
    { key: "PROD:pay-tranche-1", title: "Wpłać transzę 1 (zaliczka ~30%)" },
    { key: "PROD:check-status", title: "Sprawdź status produkcji u producenta" },
    { key: "PROD:samples", title: "Otrzymaj zdjęcia / próbki z produkcji" },
  ],
  WYPRODUKOWANE: [
    { key: "QC:inspection", title: "Przeprowadź inspekcję QC u producenta" },
    { key: "QC:pay-tranche-2", title: "Wpłać transzę 2 (po produkcji ~40%)" },
    { key: "QC:report", title: "Otrzymaj raport QC" },
  ],
  WYSLANE: [
    { key: "SHIP:bol", title: "Otrzymaj Bill of Lading" },
    { key: "SHIP:packing-list", title: "Otrzymaj Packing List" },
    { key: "SHIP:invoice", title: "Otrzymaj Commercial Invoice" },
    { key: "SHIP:track", title: "Dodaj link śledzenia kontenera" },
  ],
  ODEBRANE: [
    { key: "PORT:pay-tranche-3", title: "Wpłać transzę 3 (po dostarczeniu ~30%)" },
    { key: "PORT:customs", title: "Załatw odprawę celną (broker)" },
    { key: "PORT:sad", title: "Otrzymaj dokument SAD" },
    { key: "PORT:ground-transport", title: "Zorganizuj transport lądowy do magazynu" },
  ],
  W_MAGAZYNIE: [
    { key: "WH:receive", title: "Sprawdź jakość po dostawie do magazynu" },
    { key: "WH:inventory", title: "Wprowadź na stan magazynowy" },
    { key: "WH:accounting", title: "Zamknij zamówienie księgowo" },
  ],
};

export function getStageTaskTemplates(
  status: OrderStatusT,
): StageTaskTemplate[] {
  return STAGE_TASK_TEMPLATES[status] ?? [];
}
