/**
 * Domyślne wartości dla kanałów sprzedaży (Allegro, Sklep) — używane
 * jako fallback w tabeli produktów gdy produkt nie ma własnego override-u.
 *
 * Pola domyślne:
 *  - prowizja % (commission rate as fraction, np. 0,13 = 13%)
 *  - wysyłka pokrywana przez klienta (PLN, dodawana do przychodu)
 *  - koszt pozyskania klienta (PLN, marketing / ad cost odejmowany od zysku)
 *
 * Wartości w PLN przechowywane jako NETTO (zgodnie z konwencją systemową).
 */

export type SaleChannelDefaults = {
  /** Allegro — prowizja jako ułamek (np. 0,13 = 13%). */
  allegroCommissionPct: number | null;
  /** Allegro — wysyłka pokrywana przez klienta (zł netto, +przychód). */
  allegroCustomerShippingPln: number | null;
  /** Allegro — koszt pozyskania klienta (zł netto, –zysk). */
  allegroAdCostPln: number | null;
  /** Sklep — prowizja jako ułamek. */
  sklepCommissionPct: number | null;
  /** Sklep — wysyłka pokrywana przez klienta. */
  sklepCustomerShippingPln: number | null;
  /** Sklep — koszt pozyskania klienta. */
  sklepAdCostPln: number | null;
};

export type SaleChannelDefaultsInput = {
  allegroCommissionPct?: number | string | null;
  allegroCustomerShippingPln?: number | string | null;
  allegroAdCostPln?: number | string | null;
  sklepCommissionPct?: number | string | null;
  sklepCustomerShippingPln?: number | string | null;
  sklepAdCostPln?: number | string | null;
};
