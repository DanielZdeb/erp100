/**
 * Auto-detekcja paczki niestandardowej (NST) — per kurier.
 *
 * Każdy kurier ma swoje reguły. Z umów / regulaminów:
 *
 * InPost Kurier Standard:
 *   - Standardowa paczka: każdy bok ≤ 100 cm, obwód (girth = 2×szer+2×wys) ≤ 150 cm
 *   - Dłużycowa: jeden bok > 120 cm (opłata 100 zł)
 *   - NST: girth > 150 cm OR jeden bok > 100 cm
 *
 * DHL Parcel Polska / Premium / 9 / 12:
 *   - Standardowa paczka: 1.20 × 0.60 × 0.60 m (= 120 × 60 × 60 cm) — to LIMIT standardowy
 *   - Wszystkie dwa krótsze boki muszą być ≤ 60 cm
 *   - Dłużycowa: > 120 cm dla najdłuższego boku
 *   - NST: jeden z dwóch krótszych boków > 60 cm
 *
 * Funkcja zwraca powód NST + flagi do wyjaśnienia userowi.
 */

import type { PackageInput } from "./types";

export type NstDetection = {
  isNonStandard: boolean;
  isDluzycowy: boolean;
  reasons: string[];
};

function sortedDims(p: PackageInput): {
  shortest: number;
  middle: number;
  longest: number;
} {
  const s = [p.widthCm, p.heightCm, p.depthCm].sort((a, b) => a - b);
  return { shortest: s[0], middle: s[1], longest: s[2] };
}

/**
 * InPost Kurier Standard — kryteria niestandardowości.
 *
 * Kalibracja na realnych fakturach InPost:
 *  - 76×73×14 cm / 10 kg → NIE naliczono NST (girth = 2×73+2×14 = 174 < 200)
 *  - 110×42×12 cm / 18 kg → NIE naliczono NST (girth = 2×42+2×12 = 108 < 200)
 *  - 45×54×58 cm / 5 kg → NIE naliczono NST (girth = 2×45+2×54 = 198 < 200)
 *  - 77×52×53 cm / 5 kg → NALICZONO NST (girth = 2×52+2×53 = 210 > 200) ★
 *
 * Aktualne reguły (zgodne z realnymi rachunkami):
 *  - Dłużycowy: longest > 120 cm → opłata dłużycowy (100 zł)
 *  - NST: girth (obwód = 2×szer + 2×wys, bez najdłuższego boku) > 200 cm
 *    → opłata niestandardowa (22 zł)
 *
 * Dlaczego GIRTH a nie SUM:
 *  - InPost kontraktowo używa „girth + długość" jako limit
 *  - SUM = L+W+H pominął przypadki gdzie paczka jest „pulchna" (52×53 cm strona),
 *    ale niezbyt długa (77 cm) — to klasyczna NST, sum dawał 182 < 200
 *  - GIRTH wykrywa pudełkowy kształt poprawnie
 *
 * Usunięte progi (zbyt aggressive — false-positives):
 *  - longest > 100 cm (paczka 110 cm nie jest NST, dłużycowy zaczyna się >120)
 *  - SUM > 200 — zastąpione przez GIRTH
 *  - asymetria longest/shortest > 4
 */
export function detectNstInpost(p: PackageInput): NstDetection {
  const { shortest, middle, longest } = sortedDims(p);
  // Girth (obwód) liczymy z 2 KRÓTSZYCH boków: 2×szer + 2×wys.
  // Najdłuższy bok to "długość" przesyłki, pozostałe dwa to obwód.
  const girth = 2 * shortest + 2 * middle;
  const reasons: string[] = [];
  let nst = false;
  let dluzycowy = false;

  if (longest > 120) {
    dluzycowy = true;
    reasons.push(`Dłużycowy: najdłuższy bok ${longest} cm > 120 cm`);
    nst = true;
  }
  if (girth > 200) {
    nst = true;
    reasons.push(
      `Niestandardowa: obwód (2×${shortest} + 2×${middle}) = ${girth} cm > 200 cm`,
    );
  }

  return { isNonStandard: nst, isDluzycowy: dluzycowy, reasons };
}

/** DHL Standard Parcel — tolerancja kontraktu z deklaracją 500/mc:
 *  Dłużycowy fires dopiero przy >150 cm (nie 120). NST tylko gdy najkrótszy
 *  bok > 60 cm — pozostałe triggery (middle > 60, asymetria) usunięte,
 *  bo Aneta nie dolicza NST do paczek typu 125×82×10 czy 132×76×12,5. */
const DHL_DLUZYCOWY_THRESHOLD_CM = 150;

export function detectNstDhl(p: PackageInput): NstDetection {
  const { shortest, middle: _middle, longest } = sortedDims(p);
  const reasons: string[] = [];
  let nst = false;
  let dluzycowy = false;

  if (longest > DHL_DLUZYCOWY_THRESHOLD_CM) {
    dluzycowy = true;
    reasons.push(
      `Dłużycowy: najdłuższy bok ${longest} cm > ${DHL_DLUZYCOWY_THRESHOLD_CM} cm`,
    );
    nst = true;
  }
  if (shortest > 60) {
    nst = true;
    reasons.push(
      `Krótki bok ${shortest} cm > 60 cm (DHL standard 120×60×60)`,
    );
  }

  return { isNonStandard: nst, isDluzycowy: dluzycowy, reasons };
}

/** @deprecated użyj detectNstInpost lub detectNstDhl */
export function detectNst(p: PackageInput): NstDetection {
  return detectNstDhl(p);
}
