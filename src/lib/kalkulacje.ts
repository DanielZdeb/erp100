/**
 * Logika kalkulacji zamówienia importowego — 1:1 z Excelem firmy.
 *
 * Skrót modelu:
 * - Koszty kontenera (QC, odprawa, transport, cło, prowizja) rozkładane
 *   są na produkty proporcjonalnie do ich kubatury (CBM) w kontenerze.
 * - Każdy produkt ma cenę zakupu (USD lub CNY) → przeliczaną na PLN brutto.
 * - Każda pozycja może być sprzedawana wieloma kanałami (Allegro/Sklep/…),
 *   każdy z własną ceną, prowizją (kwotowo lub %) i kosztami dostawy/fulfillmentu.
 */

export type Currency = "PLN" | "USD" | "CNY";

export interface ExchangeRates {
  usdToPln: number;
  cnyToPln: number;
  vatRate: number; // np. 0.23
}

export interface ContainerCostInput {
  amountPln: number;
  /** Typ kosztu — używany do separacji CLO od shared logistyki.
   *  CLO nie wpływa na costPerM3 — jest alokowane per-item proporcjonalnie do
   *  customsDutyPct × goodsValue (każdy produkt płaci swoje cło). */
  type?:
    | "KONTROLA_JAKOSCI"
    | "ODPRAWA"
    | "KOSZTY_TERMINALOWE"
    | "TRANSPORT_LADOWY"
    | "TRANSPORT_MORSKI"
    | "CLO"
    | "PROWIZJA_POSREDNIKA"
    | "VAT"
    | "CIECIE"
    | "KROJENIE"
    | "SZWALNIA"
    | "INNE"
    | null;
}

export interface ItemSaleChannelInput {
  channel: string;
  salePricePln: number; // brutto za sztukę
  commissionPct?: number | null; // 0..1
  commissionFlat?: number | null;
  shippingCostPln?: number | null;
  fulfillmentPln?: number | null;
  packagingCostPln?: number | null; // koszt kartonu wysyłkowego na sztukę
  adCostPln?: number | null; // koszt reklamy na sztukę
  otherCostPln?: number | null; // inne koszty per sztuka
  customerShippingPln?: number | null; // REVENUE: wysyłka opłacona przez klienta
  shareOfQty?: number | null; // 0..1
}

export interface ItemInput {
  quantity: number;
  cbmPerUnit: number;
  unitPriceUsd?: number | null;
  unitPriceCny?: number | null;
  /** Cena PLN/szt — używana dla zamówień PL (bez kursu waluty). */
  unitPricePln?: number | null;
  /** Per-item kurs CNY → PLN (gdy null, używamy z `rates`). */
  cnyToPlnRate?: number | null;
  /** Per-item kurs USD → PLN (gdy null, używamy z `rates`). */
  usdToPlnRate?: number | null;
  /** Czy `unitPriceUsd`/`unitPriceCny` to już brutto. Default false (= netto). */
  unitPriceIsBrutto?: boolean;
  /** opcjonalnie: cena PLN netto z pominięciem przeliczeń */
  unitPriceNettoPlnOverride?: number | null;
  expectedMonthlySales?: number | null;
  /**
   * Stawka cła importowego (0..1, np. 0.085 = 8.5%). Z produktu lub z kategorii.
   * Auto-doliczana do kosztów kontenera proporcjonalnie do wartości towaru pozycji.
   */
  customsDutyPct?: number | null;
  saleChannels: ItemSaleChannelInput[];
}

export interface GoodsTrancheInput {
  paidCurrency?: "PLN" | "USD" | "EUR" | "CNY" | null;
  paidExchangeRate?: number | null;
  paidAmountOriginal?: number | null;
}

export interface KalkulacjaInput {
  rates: ExchangeRates;
  containerSizeM3: number;
  costs: ContainerCostInput[];
  items: ItemInput[];
  /**
   * Transze opłaty za towar. Z opłaconych transz w USD/CNY liczymy
   * efektywny kurs (weighted avg) który nadpisuje wstępny kurs per pozycja.
   */
  goodsTranches?: GoodsTrancheInput[];
  /**
   * Tryb alokacji kosztów shared logistyki:
   *  - "CBM" (default) — zamówienia z Chin: dzielone po objętości (qty × cbmPerUnit).
   *  - "QTY" — zamówienia z PL: dzielone po liczbie sztuk (qty). Używane gdy
   *    nie ma sensownego CBM (produkcja z materiału) — koszty cięcia/krojenia
   *    dzielą się po sztukach zamówienia.
   */
  allocationMode?: "CBM" | "QTY";
}

/**
 * Z opłaconych transz w danej walucie liczy weighted-average kurs PLN.
 * Zwraca null gdy brak danych.
 */
export function effectiveRateFromTranches(
  tranches: GoodsTrancheInput[] | undefined,
  currency: "USD" | "CNY",
): number | null {
  if (!tranches || tranches.length === 0) return null;
  let totalAmount = 0;
  let totalPln = 0;
  for (const t of tranches) {
    if (t.paidCurrency !== currency) continue;
    if (t.paidAmountOriginal == null || t.paidExchangeRate == null) continue;
    if (t.paidAmountOriginal <= 0 || t.paidExchangeRate <= 0) continue;
    totalAmount += t.paidAmountOriginal;
    totalPln += t.paidAmountOriginal * t.paidExchangeRate;
  }
  return totalAmount > 0 ? totalPln / totalAmount : null;
}

// ─── Wyniki ──────────────────────────────────────────────────────────

export interface ChannelResult {
  channel: string;
  unitsForChannel: number;
  salePricePln: number;
  commissionPln: number;
  shippingCostPln: number;
  fulfillmentPln: number;
  packagingCostPln: number;
  adCostPln: number;
  otherCostPln: number;
  /** zysk per sztuka */
  unitProfit: number;
  /** marża % (0..100) */
  marginPct: number;
  /** zysk * unitsForChannel */
  channelProfit: number;
  /** salePrice * unitsForChannel */
  channelRevenue: number;
}

export interface ItemResult {
  quantity: number;
  cbmPerUnit: number;
  totalCbm: number;
  /** Per-value koszty (PROWIZJA_POSREDNIKA, VAT) alokowane proporcjonalnie do
   *  goodsValuePln. Trzymane OSOBNO od logistyki — UI pokazuje w oddzielnej
   *  kolumnie żeby user widział sprawiedliwy podział wg wartości pozycji. */
  allocatedBrokerCommissionPln: number;
  /** cena za sztukę w PLN netto */
  unitPriceNettoPln: number;
  /** wartość towaru netto bez logistyki */
  goodsValuePln: number;
  /** koszty kontenera przypisane do tej pozycji (po CBM) — netto */
  allocatedLogisticsPln: number;
  /** cło importowe (goodsValue × customsDutyPct), netto */
  customsDutyPln: number;
  /** wartość towaru + przypisana logistyka + cło (wszystko netto) */
  landedTotalPln: number;
  /** landedTotalPln / quantity — pełen koszt jednej sztuki */
  landedCostPerUnitPln: number;
  /** suma sprzedaży miesięcznej ze wszystkich kanałów */
  monthlyUnitsSold: number;
  /** miesiące do wyprzedania całej ilości */
  estimatedSalesMonths: number | null;
  monthlyRevenue: number;
  monthlyProfit: number;
  channels: ChannelResult[];
  /** zysk i przychód dla całej ilości pozycji */
  itemTotalProfit: number;
  itemTotalRevenue: number;
}

export interface ContainerResult {
  totalCostsPln: number;
  costPerM3: number;
  containerSizeM3: number;
  /** liczba kontenerów potrzebnych do zmieszczenia używanego CBM */
  containerCount: number;
  /** sumaryczna pojemność wszystkich kontenerów (containerCount × containerSizeM3) */
  totalContainerVolume: number;
  usedCbm: number;
  fillRate: number; // 0..1 (vs. totalContainerVolume)
  totalGoodsValuePln: number;
  /** suma cła ze wszystkich pozycji */
  totalCustomsDutyPln: number;
  totalLandedPln: number;
  totalRevenuePln: number;
  totalProfitPln: number;
  marginPct: number;
  items: ItemResult[];
}

// ─── Przeliczenia walut ──────────────────────────────────────────────

export function unitPriceNettoPln(
  item: ItemInput,
  rates: ExchangeRates,
  effectiveRates?: { USD?: number | null; CNY?: number | null },
): number {
  if (item.unitPriceNettoPlnOverride != null) {
    return item.unitPriceNettoPlnOverride;
  }
  // PL: cena bezpośrednio w PLN, bez kursu walut. Priorytet nad USD/CNY,
  // bo zamówienia PL nie używają walut obcych.
  if (item.unitPricePln != null) {
    const netto = item.unitPriceIsBrutto
      ? item.unitPricePln / (1 + rates.vatRate)
      : item.unitPricePln;
    return round2(netto);
  }
  // Priorytet kursu: efektywny z transz (jeśli ustawiony) > kurs per pozycja >
  // kurs z nagłówka zamówienia.
  const effUsdRate =
    effectiveRates?.USD ?? item.usdToPlnRate ?? rates.usdToPln;
  const effCnyRate =
    effectiveRates?.CNY ?? item.cnyToPlnRate ?? rates.cnyToPln;
  const inPln =
    item.unitPriceUsd != null
      ? item.unitPriceUsd * effUsdRate
      : item.unitPriceCny != null
        ? item.unitPriceCny * effCnyRate
        : 0;
  // Konwencja: wszystko trzymamy w NETTO. Gdy cena fabryczna jest podana jako
  // brutto, wyciągamy netto dzieląc przez (1 + vat). W przeciwnym razie
  // wartość już jest netto.
  const netto = item.unitPriceIsBrutto ? inPln / (1 + rates.vatRate) : inPln;
  return round2(netto);
}

/**
 * Redystrybuuje koszty per-value (prowizja pośrednika, VAT) na pozycje
 * proporcjonalnie do goodsValuePln. Pole `allocatedBrokerCommissionPln`
 * jest osobne od logistyki — UI pokazuje w oddzielnej kolumnie.
 */
function redistributePerValue(
  items: ItemResult[],
  totalPerValuePln: number,
): ItemResult[] {
  const goodsSum = sum(items.map((i) => i.goodsValuePln));
  if (goodsSum <= 0) return items;
  return items.map((it) => {
    const share = it.goodsValuePln / goodsSum;
    const brokerAlloc = round2(totalPerValuePln * share);
    const newLandedTotal = round2(
      it.goodsValuePln +
        it.allocatedLogisticsPln +
        brokerAlloc +
        it.customsDutyPln,
    );
    const newLandedPerUnit =
      it.quantity > 0 ? round2(newLandedTotal / it.quantity) : 0;
    return {
      ...it,
      allocatedBrokerCommissionPln: brokerAlloc,
      landedTotalPln: newLandedTotal,
      landedCostPerUnitPln: newLandedPerUnit,
    };
  });
}

/**
 * Redystrybuuje zewnętrzny totalCustomsPln (z order.costs typu CLO) na
 * pozycje proporcjonalnie do:
 *  - auto-customsDuty (gdy są — proporcje z customsDutyPct), albo
 *  - goodsValuePln (fallback gdy żadna pozycja nie ma customsDutyPct).
 *
 * Po redystrybucji aktualizujemy też landedTotalPln i landedCostPerUnitPln
 * żeby spójnie pokazać użytkownikowi.
 *
 * Konsekwencja: produkt bez customsDutyPct NIE płaci cła (zachowuje 0),
 * produkty z wyższym pct dostają proporcjonalnie więcej. Każdy pracuje
 * na siebie.
 */
function redistributeCustoms(
  items: ItemResult[],
  totalExternalCustomsPln: number,
): ItemResult[] {
  // Suma auto-customsDuty (proporcje wynikające z customsDutyPct × goodsValue)
  const autoSum = sum(items.map((i) => i.customsDutyPln));
  if (autoSum > 0) {
    // Skalujemy proporcjonalnie żeby suma = totalExternalCustomsPln
    const scale = totalExternalCustomsPln / autoSum;
    return items.map((it) => {
      const newCustoms = round2(it.customsDutyPln * scale);
      const newLandedTotal = round2(
        it.goodsValuePln +
          it.allocatedLogisticsPln +
          it.allocatedBrokerCommissionPln +
          newCustoms,
      );
      const newLandedPerUnit =
        it.quantity > 0 ? round2(newLandedTotal / it.quantity) : 0;
      return {
        ...it,
        customsDutyPln: newCustoms,
        landedTotalPln: newLandedTotal,
        landedCostPerUnitPln: newLandedPerUnit,
      };
    });
  }
  // Brak customsDutyPct nigdzie — fallback: dystrybucja po goodsValue.
  const goodsSum = sum(items.map((i) => i.goodsValuePln));
  if (goodsSum <= 0) return items;
  return items.map((it) => {
    const share = it.goodsValuePln / goodsSum;
    const newCustoms = round2(totalExternalCustomsPln * share);
    const newLandedTotal = round2(
      it.goodsValuePln + it.allocatedLogisticsPln + newCustoms,
    );
    const newLandedPerUnit =
      it.quantity > 0 ? round2(newLandedTotal / it.quantity) : 0;
    return {
      ...it,
      customsDutyPln: newCustoms,
      landedTotalPln: newLandedTotal,
      landedCostPerUnitPln: newLandedPerUnit,
    };
  });
}

// ─── Główna funkcja kalkulacji ───────────────────────────────────────

export function kalkulujKontener(input: KalkulacjaInput): ContainerResult {
  // Separujemy koszty na 3 grupy alokowane różnie:
  //  - SHARED (transport, terminalowe, kontrola, odprawa, inne) — dzielone
  //    proporcjonalnie do CBM (= zajętej przestrzeni w kontenerze).
  //  - PER-VALUE (prowizja pośrednika, VAT) — dzielone proporcjonalnie do
  //    GOODS VALUE pozycji. Logiczne, bo prowizja jest % od wartości
  //    towaru, nie od objętości. Mała wartościowo paczka nie płaci tyle
  //    samo prowizji co duża z punktu widzenia objętości.
  //  - CLO — dzielone wg customsDutyPct × goodsValue per item. Produkt
  //    bez customsDutyPct → 0 zł cła. Każdy płaci swoje cło.
  //
  // Bez tej separacji: produkt zwolniony z cła płacił dodatkowy „udział"
  // przez costPerM3, a paczka małej wartości płaciła sporo prowizji.
  const PER_VALUE_TYPES = new Set([
    "PROWIZJA_POSREDNIKA",
    "VAT",
  ]);
  // PL — KROJENIE i SZWALNIA. CIECIE było legacy oznaczeniem z poprzedniej
  // wersji modelu (gdy nie było jeszcze KROJENIE) — w nowych zamówieniach
  // nie występuje, ale w DB starych może siedzieć. Jest ignorowane — żeby
  // nie liczyło się 2× (jako krojenie). Można je usunąć przez scripts/.
  const KROJENIE_TYPES = new Set(["KROJENIE"]);
  const SZWALNIA_TYPES = new Set(["SZWALNIA"]);
  const LEGACY_PL_TYPES = new Set(["CIECIE"]);
  // PL (QTY mode): jedynymi kosztami logistyki są KROJENIE i SZWALNIA.
  // Wszystkie pozostałe typy (KONTROLA_JAKOSCI, TRANSPORT_LADOWY,
  // ODPRAWA, KOSZTY_TERMINALOWE, TRANSPORT_MORSKI, INNE) są pomijane
  // żeby kalkulator nie wlewał „ukrytych" wartości do logistyki —
  // zostawiamy je w DB (user może wpisać do innych celów) ale nie liczymy.
  const isPolandQtyMode = (input.allocationMode ?? "CBM") === "QTY";
  const sharedLogisticsCosts = input.costs
    .filter(
      (c) =>
        c.type !== "CLO" &&
        !PER_VALUE_TYPES.has(c.type ?? "") &&
        !KROJENIE_TYPES.has(c.type ?? "") &&
        !SZWALNIA_TYPES.has(c.type ?? "") &&
        !LEGACY_PL_TYPES.has(c.type ?? "") &&
        !isPolandQtyMode, // PL: wykluczamy WSZYSTKO z shared logistyki
    )
    .map((c) => c.amountPln);
  const perValueCosts = input.costs
    .filter((c) => PER_VALUE_TYPES.has(c.type ?? ""))
    .map((c) => c.amountPln);
  const externalCustomsCosts = input.costs
    .filter((c) => c.type === "CLO")
    .map((c) => c.amountPln);
  const krojenieCosts = input.costs
    .filter((c) => KROJENIE_TYPES.has(c.type ?? ""))
    .map((c) => c.amountPln);
  const szwalniaCosts = input.costs
    .filter((c) => SZWALNIA_TYPES.has(c.type ?? ""))
    .map((c) => c.amountPln);
  const totalSharedLogisticsPln = sum(sharedLogisticsCosts);
  const totalPerValuePln = sum(perValueCosts);
  const totalExternalCustomsPln = sum(externalCustomsCosts);
  const totalKrojeniePln = sum(krojenieCosts);
  const totalSzwalniaPln = sum(szwalniaCosts);

  const totalCostsPln =
    totalSharedLogisticsPln +
    totalPerValuePln +
    totalExternalCustomsPln +
    totalKrojeniePln +
    totalSzwalniaPln;

  // Liczymy używane CBM przed kosztem-per-m³ — żeby uwzględnić liczbę
  // kontenerów (gdy zamówienie nie mieści się w jednym, koszty rozkładają
  // się na sumaryczną pojemność wszystkich potrzebnych kontenerów).
  const usedCbmRaw = sum(
    input.items.map((i) => i.quantity * i.cbmPerUnit),
  );
  // Tolerancja przy ceil — gdy usedCbm tylko o trochę przekracza wielokrotność
  // containerSize (np. 136.046 ≈ 136 = 2×68), traktujemy jako mieszczące się.
  // Bez tego 0.046 m³ over zwracało count=3 zamiast 2 → wszystkie kalkulacje
  // sztucznie zaniżone.
  const containerCount =
    input.containerSizeM3 > 0
      ? Math.max(
          1,
          Math.ceil(usedCbmRaw / input.containerSizeM3 - 0.01),
        )
      : 1;
  // Tryb alokacji shared logistyki — CBM (default, import z Chin) lub QTY (PL).
  const allocationMode = input.allocationMode ?? "CBM";
  const totalQtyRaw = sum(input.items.map((i) => i.quantity));
  const allocBase =
    allocationMode === "QTY" ? totalQtyRaw : usedCbmRaw;
  // W trybie QTY parametr nazywa się dalej `costPerM3` żeby nie psuć
  // sygnatury kalkulujPozycje — semantycznie staje się „kosztem per szt".
  const costPerM3 =
    allocBase > 0 ? totalSharedLogisticsPln / allocBase : 0;
  // totalContainerVolume zachowujemy do display (fillRate), nie do alokacji.
  const totalContainerVolume = containerCount * input.containerSizeM3;

  // Efektywne kursy z opłaconych transz (gdy są) — nadpisują kurs per pozycja.
  const effectiveRates = {
    USD: effectiveRateFromTranches(input.goodsTranches, "USD"),
    CNY: effectiveRateFromTranches(input.goodsTranches, "CNY"),
  };

  const itemsTemp = input.items.map((item) =>
    kalkulujPozycje(item, input.rates, costPerM3, effectiveRates, allocationMode),
  );

  // PL (QTY mode): pomijamy redystrybucje per-value (PROWIZJA/VAT) i CLO —
  // te koszty są CN-specyficzne i ich dystrybucja zatruwałaby kolumny
  // Krojenie / Szwalnia w UI. Dla PL `allocatedBrokerCommissionPln` musi
  // pochodzić wyłącznie z kosztu KROJENIE, a `customsDutyPln` z SZWALNIA.
  const skipCnDistribution = allocationMode === "QTY";

  // Jeśli user wpisał PROWIZJĘ/VAT (per-value) jako koszt → dolicz do
  // allocatedLogisticsPln per item proporcjonalnie do goodsValuePln (nie po CBM).
  // Drobny ale ważny przepływ: koszt zostaje w „logistyka" (bo to nadal
  // koszt zamówienia), ale alokacja jest sprawiedliwa dla wartości pozycji.
  const itemsAfterPerValue =
    totalPerValuePln > 0 && !skipCnDistribution
      ? redistributePerValue(itemsTemp, totalPerValuePln)
      : itemsTemp;

  // Jeśli user wpisał CLO jako koszt (externalCustomsPln > 0), nadpisujemy
  // auto-policzone customsDuty (z customsDutyPct) tą realną kwotą.
  // Alokujemy proporcjonalnie do auto-customsDuty per item (zachowując
  // proporcje wynikające z customsDutyPct), albo jeśli żaden item nie ma
  // customsDutyPct → proporcjonalnie do goodsValue.
  const itemsAfterCustomsRaw =
    totalExternalCustomsPln > 0 && !skipCnDistribution
      ? redistributeCustoms(itemsAfterPerValue, totalExternalCustomsPln)
      : itemsAfterPerValue;

  // KROJENIE i SZWALNIA — wlewamy do logistyki. Dla PL (QTY mode) suma
  // (krojeniePerSzt + szwalniaPerSzt) × qty trafia do `allocatedLogisticsPln`.
  // Dla CN (CBM mode) zachowanie jak wcześniej — koszt dodaje się do logistyki
  // per qty (gdyby ktoś wpisał krojenie/szwalnię w CN, dla bezpieczeństwa).
  // Kolumny „Cło" i „Prowizja" w UI zostają standardowo CN-style — w PL będą
  // 0 (auto-cło z customsDutyPct = 0 dla QTY mode, brak per-value kosztów).
  const krojeniePerSztPln =
    totalQtyRaw > 0 ? totalKrojeniePln / totalQtyRaw : 0;
  const szwalniaPerSztPln =
    totalQtyRaw > 0 ? totalSzwalniaPln / totalQtyRaw : 0;
  const itemsAfterCustoms =
    totalKrojeniePln > 0 || totalSzwalniaPln > 0
      ? itemsAfterCustomsRaw.map((it) => {
          const krojSzwPerSzt = krojeniePerSztPln + szwalniaPerSztPln;
          const krojSzwPln = round2(krojSzwPerSzt * it.quantity);
          const newLogistics = round2(
            it.allocatedLogisticsPln + krojSzwPln,
          );
          const newLandedTotal = round2(
            it.goodsValuePln +
              newLogistics +
              it.allocatedBrokerCommissionPln +
              it.customsDutyPln,
          );
          const newLandedPerUnit =
            it.quantity > 0 ? round2(newLandedTotal / it.quantity) : 0;
          return {
            ...it,
            allocatedLogisticsPln: newLogistics,
            landedTotalPln: newLandedTotal,
            landedCostPerUnitPln: newLandedPerUnit,
          };
        })
      : itemsAfterCustomsRaw;

  // Po redystrybucji prowizji/cła `landedCostPerUnitPln` na elemencie wzrósł,
  // ale `channels` (z `kalkulujPozycje`) liczyły zysk z PIERWOTNEGO landed.
  // Przeliczamy kanały żeby tooltip „Zysk" zgadzał się z resztą.
  const items = itemsAfterCustoms.map((it, idx) => {
    const saleChannels = input.items[idx]?.saleChannels ?? [];
    if (saleChannels.length === 0) return it;
    const rebuilt = buildChannelsForItem(
      saleChannels,
      it.quantity,
      it.landedCostPerUnitPln,
    );
    return {
      ...it,
      channels: rebuilt.channels,
      itemTotalRevenue: round2(rebuilt.itemTotalRevenue),
      itemTotalProfit: round2(rebuilt.itemTotalProfit),
    };
  });

  const usedCbm = sum(items.map((i) => i.totalCbm));
  const totalGoodsValuePln = sum(items.map((i) => i.goodsValuePln));
  const totalCustomsDutyPln = sum(items.map((i) => i.customsDutyPln));
  const totalLandedPln = sum(items.map((i) => i.landedTotalPln));
  const totalRevenuePln = sum(items.map((i) => i.itemTotalRevenue));
  const totalProfitPln = sum(items.map((i) => i.itemTotalProfit));

  return {
    totalCostsPln: round2(totalCostsPln),
    costPerM3: round2(costPerM3),
    containerSizeM3: input.containerSizeM3,
    containerCount,
    totalContainerVolume: round4(totalContainerVolume),
    usedCbm: round4(usedCbm),
    fillRate:
      totalContainerVolume > 0 ? usedCbm / totalContainerVolume : 0,
    totalGoodsValuePln: round2(totalGoodsValuePln),
    totalCustomsDutyPln: round2(totalCustomsDutyPln),
    totalLandedPln: round2(totalLandedPln),
    totalRevenuePln: round2(totalRevenuePln),
    totalProfitPln: round2(totalProfitPln),
    marginPct:
      totalRevenuePln > 0 ? round2((totalProfitPln / totalRevenuePln) * 100) : 0,
    items,
  };
}

/**
 * Buduje listę ChannelResult dla danego elementu + landedCostPerUnit.
 * Wydzielone z `kalkulujPozycje` żeby móc PRZELICZYĆ kanały PO redystrybucji
 * prowizji / cła (które zmieniają landedCostPerUnit).
 *
 * Bez tego przeliczenia kanał miał `unitProfit` obliczany ze STAREGO
 * (mniejszego) landed, podczas gdy `landedCostPerUnitPln` pokazywany w UI
 * był po redystrybucji — i tooltip „Zysk" nie zgadzał się z sumą wierszy.
 */
function buildChannelsForItem(
  saleChannels: ItemSaleChannelInput[],
  quantity: number,
  landedCostPerUnit: number,
): {
  channels: ChannelResult[];
  itemTotalRevenue: number;
  itemTotalProfit: number;
} {
  const channelsWithPrice = saleChannels.filter(
    (c) => (c.salePricePln ?? 0) > 0,
  );
  const explicitShare = saleChannels
    .map((c) => c.shareOfQty)
    .filter((s): s is number => s != null && s > 0);
  const explicitSum = explicitShare.reduce((a, b) => a + b, 0);
  const numUnassignedActive =
    channelsWithPrice.length -
    channelsWithPrice.filter((c) => c.shareOfQty != null && c.shareOfQty > 0)
      .length;
  const remainingShare = Math.max(0, 1 - explicitSum);
  const autoSharePerNull =
    numUnassignedActive > 0 && remainingShare > 0
      ? remainingShare / numUnassignedActive
      : channelsWithPrice.length > 1
        ? 1 / channelsWithPrice.length
        : 1;
  const normalizedShares = saleChannels.map((ch) => {
    const hasPrice = (ch.salePricePln ?? 0) > 0;
    if (!hasPrice) return 0;
    if (ch.shareOfQty != null && ch.shareOfQty > 0) {
      return clamp01(ch.shareOfQty);
    }
    return autoSharePerNull;
  });
  const totalShare = normalizedShares.reduce((a, b) => a + b, 0);
  const finalShares =
    totalShare > 1
      ? normalizedShares.map((s) => s / totalShare)
      : normalizedShares;
  const channels = saleChannels.map((ch, idx) =>
    kalkulujKanal(
      { ...ch, shareOfQty: finalShares[idx] },
      quantity,
      landedCostPerUnit,
    ),
  );
  const itemTotalRevenue = sum(channels.map((c) => c.channelRevenue));
  const itemTotalProfit = sum(channels.map((c) => c.channelProfit));
  return { channels, itemTotalRevenue, itemTotalProfit };
}

function kalkulujPozycje(
  item: ItemInput,
  rates: ExchangeRates,
  costPerAllocUnit: number,
  effectiveRates?: { USD?: number | null; CNY?: number | null },
  allocationMode: "CBM" | "QTY" = "CBM",
): ItemResult {
  const unitPrice = unitPriceNettoPln(item, rates, effectiveRates);
  const totalCbm = item.quantity * item.cbmPerUnit;
  const goodsValue = item.quantity * unitPrice;
  // Alokacja shared logistyki: per CBM (qty × cbm) lub per QTY (qty).
  const allocatedLogistics =
    allocationMode === "QTY"
      ? item.quantity * costPerAllocUnit
      : totalCbm * costPerAllocUnit;
  // Cło — % od wartości towaru. Stawka z produktu/kategorii. Dla PL (QTY mode)
  // cło jest nieaplikalne — kolumna „Szwalnia" w UI rezerwowana jest wyłącznie
  // dla kosztu SZWALNIA z Płatności. Zerujemy auto-cło żeby nie psuł alokacji.
  const customsDutyPct =
    allocationMode === "QTY" ? 0 : (item.customsDutyPct ?? 0);
  const customsDuty = goodsValue * customsDutyPct;
  const landedTotal = goodsValue + allocatedLogistics + customsDuty;
  const landedCostPerUnit = item.quantity > 0 ? landedTotal / item.quantity : 0;

  const { channels, itemTotalRevenue, itemTotalProfit } = buildChannelsForItem(
    item.saleChannels,
    item.quantity,
    landedCostPerUnit,
  );

  const monthlyUnitsSold = item.expectedMonthlySales ?? 0;
  const estimatedSalesMonths =
    monthlyUnitsSold > 0 ? item.quantity / monthlyUnitsSold : null;

  // sprzedaż miesięczna ważona udziałem kanału w sprzedaży
  const monthlyRevenue = sum(
    channels.map((c) => c.salePricePln * monthlyUnitsSold * channelShare(c, item.quantity)),
  );
  const monthlyProfit = sum(
    channels.map((c) => c.unitProfit * monthlyUnitsSold * channelShare(c, item.quantity)),
  );

  return {
    quantity: item.quantity,
    cbmPerUnit: item.cbmPerUnit,
    totalCbm: round4(totalCbm),
    unitPriceNettoPln: round2(unitPrice),
    goodsValuePln: round2(goodsValue),
    allocatedLogisticsPln: round2(allocatedLogistics),
    // Prowizja per-value dolicza się POŹNIEJ w redistributePerValue; tutaj 0.
    allocatedBrokerCommissionPln: 0,
    customsDutyPln: round2(customsDuty),
    landedTotalPln: round2(landedTotal),
    landedCostPerUnitPln: round2(landedCostPerUnit),
    monthlyUnitsSold,
    estimatedSalesMonths:
      estimatedSalesMonths != null ? round2(estimatedSalesMonths) : null,
    monthlyRevenue: round2(monthlyRevenue),
    monthlyProfit: round2(monthlyProfit),
    channels,
    itemTotalProfit: round2(itemTotalProfit),
    itemTotalRevenue: round2(itemTotalRevenue),
  };
}

function kalkulujKanal(
  ch: ItemSaleChannelInput,
  totalQty: number,
  landedCostPerUnit: number,
): ChannelResult {
  const shareOfQty = clamp01(ch.shareOfQty ?? 1);
  const unitsForChannel = Math.round(totalQty * shareOfQty);

  const commissionPln =
    ch.commissionFlat != null
      ? ch.commissionFlat
      : ch.commissionPct != null
        ? ch.salePricePln * ch.commissionPct
        : 0;

  const shipping = ch.shippingCostPln ?? 0;
  const fulfillment = ch.fulfillmentPln ?? 0;
  const packaging = ch.packagingCostPln ?? 0;
  const adCost = ch.adCostPln ?? 0;
  const otherCost = ch.otherCostPln ?? 0;
  const customerShipping = ch.customerShippingPln ?? 0;

  const unitProfit =
    ch.salePricePln +
    customerShipping -
    landedCostPerUnit -
    shipping -
    fulfillment -
    packaging -
    commissionPln -
    adCost -
    otherCost;

  const marginPct =
    ch.salePricePln > 0 ? (unitProfit / ch.salePricePln) * 100 : 0;

  const channelProfit = unitProfit * unitsForChannel;
  const channelRevenue = ch.salePricePln * unitsForChannel;

  return {
    channel: ch.channel,
    unitsForChannel,
    salePricePln: round2(ch.salePricePln),
    commissionPln: round2(commissionPln),
    shippingCostPln: round2(shipping),
    fulfillmentPln: round2(fulfillment),
    packagingCostPln: round2(packaging),
    adCostPln: round2(adCost),
    otherCostPln: round2(otherCost),
    unitProfit: round2(unitProfit),
    marginPct: round2(marginPct),
    channelProfit: round2(channelProfit),
    channelRevenue: round2(channelRevenue),
  };
}

/** Liczy miesięczny koszt magazynowania na sztukę.
 *  storage_per_unit = pallet_cost_per_month / units_per_pallet
 */
export function monthlyStorageCostPerUnit(
  palletCostPerMonth: number,
  unitsPerPallet: number | null | undefined,
): number {
  if (!unitsPerPallet || unitsPerPallet <= 0 || palletCostPerMonth <= 0) {
    return 0;
  }
  return round2(palletCostPerMonth / unitsPerPallet);
}

// ─── Pomocnicze ──────────────────────────────────────────────────────

function channelShare(c: ChannelResult, totalQty: number): number {
  return totalQty > 0 ? c.unitsForChannel / totalQty : 0;
}

function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// ─── Pomocnicze API: CBM z wymiarów pudełka ─────────────────────────

/** Liczy CBM (m3) na sztukę na podstawie wymiarów kartonu w cm i liczby sztuk w kartonie. */
export function cbmFromBox(
  boxWidthCm: number | null | undefined,
  boxHeightCm: number | null | undefined,
  boxDepthCm: number | null | undefined,
  unitsPerBox: number | null | undefined,
): number | null {
  if (!boxWidthCm || !boxHeightCm || !boxDepthCm || !unitsPerBox) return null;
  const boxCbm = (boxWidthCm * boxHeightCm * boxDepthCm) / 1_000_000;
  return round4(boxCbm / unitsPerBox);
}

/**
 * Liczy CBM (m³) na sztukę z hierarchii master karton → inner karton → produkt.
 * Master karton zawiera `innerBoxesPerMaster` inner kartonów, każdy z
 * `unitsPerInnerBox` sztuk. CBM/szt = master_volume / (innerBoxesPerMaster × unitsPerInnerBox).
 *
 * Zwraca null gdy brakuje któregokolwiek z pól master lub inner.
 */
export function cbmFromMasterBox(
  masterW: number | null | undefined,
  masterH: number | null | undefined,
  masterD: number | null | undefined,
  innerBoxesPerMaster: number | null | undefined,
  unitsPerInnerBox: number | null | undefined,
): number | null {
  if (
    !masterW ||
    !masterH ||
    !masterD ||
    !innerBoxesPerMaster ||
    !unitsPerInnerBox
  )
    return null;
  const masterCbm = (masterW * masterH * masterD) / 1_000_000;
  const totalUnits = innerBoxesPerMaster * unitsPerInnerBox;
  return round4(masterCbm / totalUnits);
}

/**
 * Liczy CBM (m³) na sztukę dla trybu LUZEM:
 * podzielenie pojemności referencyjnego kontenera przez liczbę sztuk.
 */
export function cbmFromBulk(
  referenceContainerM3: number | null | undefined,
  unitsPerContainer: number | null | undefined,
): number | null {
  if (!referenceContainerM3 || !unitsPerContainer) return null;
  return round4(referenceContainerM3 / unitsPerContainer);
}

/**
 * Liczy **całkowity** CBM (m³) zajmowany w kontenerze przez `quantity` sztuk
 * produktu, w hierarchii pakowania — **ułamkowo**, bez zaokrąglania w górę
 * do pełnych kartonów. W kontenerze rzeczy z różnych zamówień są dzielone
 * proporcjonalnie wg objętości, więc partial-karton też kosztuje partial CBM.
 *
 *  Hierarchia priorytetów:
 *  1. Master karton (jeśli pełen komplet danych) → qty × (masterVolume / (innerBoxes × unitsPerBox))
 *     — efektywna gęstość pakowania zbiorczego, rozłożona równo na każdą szt.
 *  2. Inner karton (jeśli wymiary + unitsPerBox) → qty × (innerVolume / unitsPerBox)
 *     — gęstość pakowania pojedynczego kartonu.
 *  3. Fallback → qty × cbmPerUnit (LUZEM / bez znanej hierarchii pakowania).
 *
 * Zwraca też pomocnicze pola dla tooltipów i kart awizacji.
 */
export interface EffectiveCbmInput {
  quantity: number;
  cbmPerUnit: number;
  boxWidthCm?: number | null;
  boxHeightCm?: number | null;
  boxDepthCm?: number | null;
  unitsPerBox?: number | null;
  masterBoxWidthCm?: number | null;
  masterBoxHeightCm?: number | null;
  masterBoxDepthCm?: number | null;
  innerBoxesPerMaster?: number | null;
}

export interface EffectiveCbmResult {
  /** Całkowity CBM rzeczywiście zajmowany w kontenerze (m³). */
  totalCbm: number;
  /** Efektywny CBM/szt (totalCbm / quantity). */
  effectiveCbmPerUnit: number;
  /** Źródło wyliczenia: "MASTER" / "INNER" / "RAW". */
  source: "MASTER" | "INNER" | "RAW";
  /** Ułamkowa liczba zbiorczych kartonów (qty / unitsPerMaster). */
  mastersTotal: number | null;
  /** Ułamkowa liczba prod./inner kartonów (qty / unitsPerBox). */
  innerKartonsTotal: number | null;
}

export function effectiveContainerCbm(
  input: EffectiveCbmInput,
): EffectiveCbmResult {
  const qty = input.quantity;
  if (qty <= 0) {
    return {
      totalCbm: 0,
      effectiveCbmPerUnit: 0,
      source: "RAW",
      mastersTotal: null,
      innerKartonsTotal: null,
    };
  }

  const upb = input.unitsPerBox ?? null;
  const hasMaster =
    upb != null &&
    upb > 0 &&
    input.masterBoxWidthCm != null &&
    input.masterBoxHeightCm != null &&
    input.masterBoxDepthCm != null &&
    input.innerBoxesPerMaster != null &&
    input.innerBoxesPerMaster > 0;

  const hasInner =
    upb != null &&
    upb > 0 &&
    input.boxWidthCm != null &&
    input.boxHeightCm != null &&
    input.boxDepthCm != null;

  if (hasMaster) {
    const masterVol =
      (input.masterBoxWidthCm! *
        input.masterBoxHeightCm! *
        input.masterBoxDepthCm!) /
      1_000_000;
    const unitsPerMaster = input.innerBoxesPerMaster! * upb!;
    const mastersTotal = qty / unitsPerMaster;
    const innerKartonsTotal = qty / upb!;
    const effectiveCbmPerUnit = masterVol / unitsPerMaster;
    const totalCbm = qty * effectiveCbmPerUnit;
    return {
      totalCbm: round4(totalCbm),
      effectiveCbmPerUnit: round4(effectiveCbmPerUnit),
      source: "MASTER",
      mastersTotal,
      innerKartonsTotal,
    };
  }

  if (hasInner) {
    const innerVol =
      (input.boxWidthCm! * input.boxHeightCm! * input.boxDepthCm!) / 1_000_000;
    const innerKartonsTotal = qty / upb!;
    const effectiveCbmPerUnit = innerVol / upb!;
    const totalCbm = qty * effectiveCbmPerUnit;
    return {
      totalCbm: round4(totalCbm),
      effectiveCbmPerUnit: round4(effectiveCbmPerUnit),
      source: "INNER",
      mastersTotal: null,
      innerKartonsTotal,
    };
  }

  const totalCbm = qty * input.cbmPerUnit;
  return {
    totalCbm: round4(totalCbm),
    effectiveCbmPerUnit: input.cbmPerUnit,
    source: "RAW",
    mastersTotal: null,
    innerKartonsTotal: null,
  };
}

// ─── Bundle (compositionMode=KOMPONENTOWY) ───────────────────────────

export interface BundleSlotInput {
  /** Ile sztuk komponentu na 1 sztukę bundla (np. krzesło ×4). */
  quantity: number;
  /** CBM/szt domyślnego komponentu w slocie. */
  defaultCbmPerUnit: number;
  /**
   * Wybrane warianty — gdy puste, wszystkie sztuki bundla używają defaultu.
   * Gdy podane, suma `units` powinna równać się `bundleQuantity`.
   */
  splits?: { variantCbmPerUnit: number; units: number }[];
}

/**
 * Liczy efektywne CBM/szt bundla na podstawie konfiguracji slotów + ewentualnych
 * wariantów wybranych na zamówieniu.
 *
 * Wzór:
 *   totalLineCbm = Σ slotów: Σ (variantCbm × slot.quantity × units), albo gdy
 *                  brak splitów: defaultCbm × slot.quantity × bundleQuantity
 *   bundleCbmPerUnit = totalLineCbm / bundleQuantity
 *
 * Zwraca null gdy `bundleQuantity <= 0` lub brak slotów.
 */
export function bundleCbmPerUnit(
  slots: BundleSlotInput[],
  bundleQuantity: number,
): number | null {
  if (bundleQuantity <= 0 || slots.length === 0) return null;
  let totalCbm = 0;
  for (const slot of slots) {
    if (slot.splits && slot.splits.length > 0) {
      for (const sp of slot.splits) {
        totalCbm += sp.variantCbmPerUnit * slot.quantity * sp.units;
      }
    } else {
      totalCbm += slot.defaultCbmPerUnit * slot.quantity * bundleQuantity;
    }
  }
  return round4(totalCbm / bundleQuantity);
}

/** Ile sztuk produktu zmieści się w kontenerze o danej pojemności. */
export function maxQtyInContainer(
  cbmPerUnit: number,
  containerSizeM3: number,
): number {
  if (cbmPerUnit <= 0) return 0;
  return Math.floor(containerSizeM3 / cbmPerUnit);
}

// ─── Paletyzacja ─────────────────────────────────────────────────────

/** Wymiar euro-palety (120×80 cm). */
export const EURO_PALLET_LENGTH_CM = 120;
export const EURO_PALLET_WIDTH_CM = 80;
/** Maksymalna wysokość stosu (cm) — ustawowo 200 cm dla transportu drogowego. */
export const EURO_PALLET_MAX_HEIGHT_CM = 200;
/** Dopuszczalny zwis poza krawędź palety per strona (cm). */
export const EURO_PALLET_OVERHANG_PER_SIDE_CM = 7;

export interface PalletFitResult {
  /** Ile pudełek mieści się w jednej warstwie (footprint). */
  perLayer: number;
  /** Ile warstw zmieści się na wysokość. */
  layers: number;
  /** Łączna liczba pudełek na palecie. */
  total: number;
  /** Rzeczywiste wymiary effektywnej powierzchni (z zwisem). */
  effectiveLengthCm: number;
  effectiveWidthCm: number;
}

/**
 * Liczy ile pudełek o wymiarach W×H×D (cm) zmieści się na euro-palecie
 * (120×80, max 200 cm wysokość) z 7 cm zwisem na stronę.
 *
 * Założenie: orientacja pudełka jest stała — szerokość pudełka idzie
 * wzdłuż długości palety (120 cm), głębokość pudełka wzdłuż szerokości
 * palety (80 cm). Pudełka NIE są obracane.
 */
export function boxesPerEuroPallet(
  widthCm: number | null | undefined,
  heightCm: number | null | undefined,
  depthCm: number | null | undefined,
): PalletFitResult {
  const empty: PalletFitResult = {
    perLayer: 0,
    layers: 0,
    total: 0,
    effectiveLengthCm:
      EURO_PALLET_LENGTH_CM + 2 * EURO_PALLET_OVERHANG_PER_SIDE_CM,
    effectiveWidthCm:
      EURO_PALLET_WIDTH_CM + 2 * EURO_PALLET_OVERHANG_PER_SIDE_CM,
  };
  if (!widthCm || !heightCm || !depthCm) return empty;
  if (widthCm <= 0 || heightCm <= 0 || depthCm <= 0) return empty;

  const effLen = empty.effectiveLengthCm; // 134
  const effWid = empty.effectiveWidthCm; // 94

  const perRow = Math.floor(effLen / widthCm);
  const perCol = Math.floor(effWid / depthCm);
  const perLayer = perRow * perCol;
  const layers = Math.floor(EURO_PALLET_MAX_HEIGHT_CM / heightCm);
  const total = perLayer * layers;

  return {
    perLayer,
    layers,
    total,
    effectiveLengthCm: effLen,
    effectiveWidthCm: effWid,
  };
}
