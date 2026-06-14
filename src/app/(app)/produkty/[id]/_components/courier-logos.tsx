/**
 * Brand logos dla InPost i DHL — proste SVG odzwierciedlające
 * charakter brandu (InPost: żółty/zielony, DHL: żółty z czerwonym napisem).
 * Skalują się do dowolnego rozmiaru.
 */

export function InPostLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 40"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-label="InPost"
    >
      <rect width="120" height="40" rx="6" fill="#ffeb3b" />
      <rect x="4" y="4" width="32" height="32" rx="4" fill="#212121" />
      <text
        x="20"
        y="28"
        textAnchor="middle"
        fontSize="22"
        fontWeight="bold"
        fill="#ffeb3b"
        fontFamily="system-ui, sans-serif"
      >
        i
      </text>
      <text
        x="44"
        y="27"
        fontSize="18"
        fontWeight="800"
        fill="#212121"
        fontFamily="system-ui, sans-serif"
        letterSpacing="-0.5"
      >
        InPost
      </text>
    </svg>
  );
}

export function DhlLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 140 40"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-label="DHL"
    >
      <rect width="140" height="40" rx="6" fill="#ffcc00" />
      <text
        x="10"
        y="30"
        fontSize="26"
        fontWeight="900"
        fill="#d40511"
        fontFamily="system-ui, sans-serif"
        letterSpacing="-1"
      >
        DHL
      </text>
      <g fill="#d40511" opacity="0.85">
        {/* Trzy paski "speed lines" */}
        <rect x="62" y="14" width="68" height="3" rx="1.5" />
        <rect x="58" y="19" width="72" height="3" rx="1.5" />
        <rect x="64" y="24" width="66" height="3" rx="1.5" />
      </g>
    </svg>
  );
}

/** Pomocnicze: zwraca odpowiednie logo dla brandu. */
export function CourierLogo({
  brand,
  className,
}: {
  brand: "INPOST" | "DHL";
  className?: string;
}) {
  if (brand === "INPOST") return <InPostLogo className={className} />;
  if (brand === "DHL") return <DhlLogo className={className} />;
  return null;
}
