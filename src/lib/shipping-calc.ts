/**
 * Kalkulator wysyłki: kombinuje pudełko produktu z cennikiem kuriera.
 *
 * Dla każdej kombinacji (pudełko × usługa kuriera) sprawdza limity wymiarowe
 * i wagowe, oblicza ile pudełek potrzeba i finalny koszt wysyłki.
 */

export interface CalcProduct {
  weightKg: number | null;
}

export interface CalcBoxLink {
  box: {
    id: string;
    name: string;
    internalCode: string | null;
    widthCm: number;
    heightCm: number;
    depthCm: number;
    weightKg: number | null;
  };
  unitsPerBox: number;
  isPrimary: boolean;
}

export interface CalcRate {
  id: string;
  serviceType: string;
  maxWeightKg: number | null;
  maxLengthCm: number | null;
  maxWidthCm: number | null;
  maxHeightCm: number | null;
  maxSumDimsCm: number | null;
  isPaczkomat: boolean;
  pricePln: number;
  courier: {
    id: string;
    name: string;
  };
}

export interface CourierOption {
  rateId: string;
  courierId: string;
  courierName: string;
  serviceType: string;
  isPaczkomat: boolean;
  pricePerBox: number;
  totalPrice: number;
  fits: boolean;
  /** Lista naruszeń limitów (gdy fits=false). */
  reasons: string[];
}

export interface ShippingOption {
  boxId: string;
  boxName: string;
  internalCode: string | null;
  boxDims: { widthCm: number; heightCm: number; depthCm: number };
  unitsPerBox: number;
  boxesNeeded: number;
  /** Łączna waga jednego pudełka (pudło + produkty). */
  perBoxWeightKg: number;
  /** Suma trzech wymiarów (do limitów typu "obwód"/sumy 3 boków). */
  boxSumDimsCm: number;
  isPrimary: boolean;
  /** Posortowane od najtańszej (fits=true najpierw). */
  courierOptions: CourierOption[];
  /** Najtańsza realna opcja (gdy istnieje). */
  cheapest: CourierOption | null;
}

export function calculateShipping(
  product: CalcProduct,
  quantity: number,
  productBoxes: CalcBoxLink[],
  rates: CalcRate[],
): ShippingOption[] {
  const qty = Math.max(1, Math.trunc(quantity));
  const productWeight = product.weightKg ?? 0;

  const options: ShippingOption[] = productBoxes.map((pb) => {
    const box = pb.box;
    const upb = Math.max(1, pb.unitsPerBox);
    const boxesNeeded = Math.ceil(qty / upb);

    // Waga jednego pudełka: pełne pudło (upb produktów) lub niepełne (ostatnie)
    // Liczymy uśredniony scenariusz "pełnego pudła" — limity kurierów stosuje
    // się do pojedynczego pudełka.
    const perBoxWeight = (box.weightKg ?? 0) + productWeight * upb;
    const sumDims = box.widthCm + box.heightCm + box.depthCm;

    const courierOptions: CourierOption[] = rates.map((r) => {
      const reasons: string[] = [];
      if (r.maxWeightKg != null && perBoxWeight > r.maxWeightKg) {
        reasons.push(
          `waga ${perBoxWeight.toFixed(2)} kg > limit ${r.maxWeightKg} kg`,
        );
      }
      // Limity wymiarowe — sortujemy boki desc, dopasowujemy do limitów
      // ustawionych jako max length/width/height (przyjmujemy że są one
      // wymiarami od największego do najmniejszego).
      const boxSortedDesc = [box.widthCm, box.heightCm, box.depthCm].sort(
        (a, b) => b - a,
      );
      const limitsSortedDesc = [
        r.maxLengthCm ?? Infinity,
        r.maxWidthCm ?? Infinity,
        r.maxHeightCm ?? Infinity,
      ].sort((a, b) => b - a);
      const labels = ["dł.", "szer.", "wys."];
      for (let i = 0; i < 3; i++) {
        if (boxSortedDesc[i] > limitsSortedDesc[i]) {
          reasons.push(
            `${labels[i]} ${boxSortedDesc[i]} cm > limit ${
              limitsSortedDesc[i] === Infinity
                ? "—"
                : `${limitsSortedDesc[i]} cm`
            }`,
          );
        }
      }
      if (r.maxSumDimsCm != null && sumDims > r.maxSumDimsCm) {
        reasons.push(
          `suma boków ${sumDims} cm > limit ${r.maxSumDimsCm} cm`,
        );
      }

      const fits = reasons.length === 0;
      const total = r.pricePln * boxesNeeded;
      return {
        rateId: r.id,
        courierId: r.courier.id,
        courierName: r.courier.name,
        serviceType: r.serviceType,
        isPaczkomat: r.isPaczkomat,
        pricePerBox: r.pricePln,
        totalPrice: total,
        fits,
        reasons,
      };
    });

    // Sort: fitting first, then by cheapest total
    courierOptions.sort((a, b) => {
      if (a.fits !== b.fits) return a.fits ? -1 : 1;
      return a.totalPrice - b.totalPrice;
    });

    const cheapest = courierOptions.find((c) => c.fits) ?? null;

    return {
      boxId: box.id,
      boxName: box.name,
      internalCode: box.internalCode,
      boxDims: {
        widthCm: box.widthCm,
        heightCm: box.heightCm,
        depthCm: box.depthCm,
      },
      unitsPerBox: upb,
      boxesNeeded,
      perBoxWeightKg: perBoxWeight,
      boxSumDimsCm: sumDims,
      isPrimary: pb.isPrimary,
      courierOptions,
      cheapest,
    };
  });

  // Primary first, then by cheapest option's total price
  options.sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    const ap = a.cheapest?.totalPrice ?? Infinity;
    const bp = b.cheapest?.totalPrice ?? Infinity;
    return ap - bp;
  });

  return options;
}
