/**
 * Minimalistyczne ikony flag PL / CN do użytku w UI nawigacyjnym.
 * Implementacja jako SVG z viewBox 24×24 — ten sam interfejs co Lucide
 * icons (className, ...svg props), więc można je podstawiać 1:1.
 */

import type { SVGProps } from "react";

export function FlagPL(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Polska"
      {...props}
    >
      <rect
        x="2"
        y="6"
        width="20"
        height="6"
        rx="0.5"
        fill="#ffffff"
        stroke="#cbd5e1"
        strokeWidth="0.5"
      />
      <rect
        x="2"
        y="12"
        width="20"
        height="6"
        rx="0.5"
        fill="#dc143c"
        stroke="#a30f29"
        strokeWidth="0.3"
      />
    </svg>
  );
}

export function FlagCN(props: SVGProps<SVGSVGElement>) {
  // Uproszczona flaga: czerwone tło + 1 duża gwiazda w lewym górnym rogu.
  // Cztery mniejsze gwiazdy pomijamy ze względu na czytelność przy size-4.
  return (
    <svg
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Chiny"
      {...props}
    >
      <rect
        x="2"
        y="6"
        width="20"
        height="12"
        rx="0.5"
        fill="#de2910"
        stroke="#a8200d"
        strokeWidth="0.3"
      />
      <path
        d="M7.5 9 L8.3 10.6 L10 10.85 L8.75 12 L9.05 13.7 L7.5 12.9 L5.95 13.7 L6.25 12 L5 10.85 L6.7 10.6 Z"
        fill="#ffde00"
      />
    </svg>
  );
}
