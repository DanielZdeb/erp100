/**
 * Proporcjonalny rzut izometryczny pudełka — SVG generowane z wymiarów.
 * Dla `BOX` (kabinetowy rzut 30°): widać przód, górę i prawą ścianę.
 * Dla `POLY_BAG` (foliopak): płaski miękki prostokąt z efektem cienia.
 */

export function BoxVisual({
  widthCm,
  heightCm,
  depthCm,
  packagingType,
  className,
}: {
  widthCm: number | null;
  heightCm: number | null;
  depthCm: number | null;
  packagingType: "BOX" | "POLY_BAG";
  className?: string;
}) {
  if (!widthCm || !heightCm) {
    return (
      <div
        className={`flex items-center justify-center text-[10px] text-muted-foreground/70 italic ${className ?? ""}`}
      >
        Brak wymiarów
      </div>
    );
  }

  if (packagingType === "POLY_BAG") {
    return (
      <PolyBagVisual
        widthCm={widthCm}
        heightCm={heightCm}
        className={className}
      />
    );
  }

  return (
    <BoxIsoVisual
      widthCm={widthCm}
      heightCm={heightCm}
      depthCm={depthCm ?? 0}
      className={className}
    />
  );
}

// ─── Pudełko 3D (rzut kabinetowy) ────────────────────────────────────

function BoxIsoVisual({
  widthCm,
  heightCm,
  depthCm,
  className,
}: {
  widthCm: number;
  heightCm: number;
  depthCm: number;
  className?: string;
}) {
  // Rzut kabinetowy: głębokość na 30° z 50% skalą (cabinet projection).
  const angle = (30 * Math.PI) / 180;
  const depthScale = 0.5;
  const dx = depthCm * Math.cos(angle) * depthScale;
  const dy = depthCm * Math.sin(angle) * depthScale;

  // Skala do viewBox 240x240 z 20px paddingiem
  const padding = 24;
  const targetSize = 240 - padding * 2;
  const naturalW = widthCm + dx;
  const naturalH = heightCm + dy;
  const scale = targetSize / Math.max(naturalW, naturalH);

  const w = widthCm * scale;
  const h = heightCm * scale;
  const sdx = dx * scale;
  const sdy = dy * scale;

  // Pozycjonowanie — front face zaczyna w (offsetX, offsetY+sdy)
  const offsetX = (240 - (w + sdx)) / 2;
  const offsetY = (240 - (h + sdy)) / 2 + sdy;

  // Punkty front face
  const fx1 = offsetX;
  const fy1 = offsetY;
  const fx2 = offsetX + w;
  const fy2 = offsetY + h;
  // Back face przesunięte o (sdx, -sdy)
  const bx1 = fx1 + sdx;
  const by1 = fy1 - sdy;
  const bx2 = fx2 + sdx;
  const by2 = fy2 - sdy;

  return (
    <svg
      viewBox="0 0 240 240"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-label={`Pudełko ${widthCm}×${heightCm}×${depthCm} cm`}
    >
      {/* Górna ściana */}
      <polygon
        points={`${fx1},${fy1} ${fx2},${fy1} ${bx2},${by1} ${bx1},${by1}`}
        fill="#fcd34d"
        stroke="#92400e"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Prawa ściana */}
      <polygon
        points={`${fx2},${fy1} ${fx2},${fy2} ${bx2},${by2} ${bx2},${by1}`}
        fill="#f59e0b"
        stroke="#92400e"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Front face */}
      <rect
        x={fx1}
        y={fy1}
        width={w}
        height={h}
        fill="#fef3c7"
        stroke="#92400e"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Linie taśmy w środku front face dla efektu kartonu */}
      <line
        x1={fx1 + w / 2}
        y1={fy1}
        x2={fx1 + w / 2}
        y2={fy2}
        stroke="#92400e"
        strokeWidth="0.5"
        strokeDasharray="2 2"
        opacity="0.4"
      />
      {/* Etykiety wymiarów */}
      <DimLabels
        widthCm={widthCm}
        heightCm={heightCm}
        depthCm={depthCm}
        fx1={fx1}
        fy1={fy1}
        fx2={fx2}
        fy2={fy2}
        bx1={bx1}
        by1={by1}
      />
    </svg>
  );
}

// ─── Foliopak (płaski) ──────────────────────────────────────────────

function PolyBagVisual({
  widthCm,
  heightCm,
  className,
}: {
  widthCm: number;
  heightCm: number;
  className?: string;
}) {
  const padding = 24;
  const targetSize = 240 - padding * 2;
  const scale = targetSize / Math.max(widthCm, heightCm);
  const w = widthCm * scale;
  const h = heightCm * scale;
  const offsetX = (240 - w) / 2;
  const offsetY = (240 - h) / 2;

  return (
    <svg
      viewBox="0 0 240 240"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-label={`Foliopak ${widthCm}×${heightCm} cm`}
    >
      <defs>
        <linearGradient id="poly-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#cffafe" />
          <stop offset="100%" stopColor="#a5f3fc" />
        </linearGradient>
      </defs>
      {/* Cień */}
      <rect
        x={offsetX + 4}
        y={offsetY + 4}
        width={w}
        height={h}
        rx="6"
        fill="#0e7490"
        opacity="0.15"
      />
      {/* Foliopak — zaokrąglone rogi + lekkie skosy u góry (zgrzew) */}
      <rect
        x={offsetX}
        y={offsetY}
        width={w}
        height={h}
        rx="8"
        fill="url(#poly-grad)"
        stroke="#0e7490"
        strokeWidth="1.5"
      />
      {/* Zgrzew górny */}
      <line
        x1={offsetX + 8}
        y1={offsetY + 6}
        x2={offsetX + w - 8}
        y2={offsetY + 6}
        stroke="#0e7490"
        strokeWidth="1"
        strokeDasharray="2 2"
        opacity="0.5"
      />
      {/* Perforacja klapy */}
      <line
        x1={offsetX + 6}
        y1={offsetY + h * 0.18}
        x2={offsetX + w - 6}
        y2={offsetY + h * 0.18}
        stroke="#0e7490"
        strokeWidth="0.8"
        strokeDasharray="1 3"
        opacity="0.6"
      />
      {/* Etykiety */}
      <text
        x={offsetX + w / 2}
        y={offsetY + h + 14}
        textAnchor="middle"
        fontSize="11"
        fill="#0e7490"
        fontWeight="500"
      >
        ↔ {widthCm} cm
      </text>
      <text
        x={offsetX + w + 12}
        y={offsetY + h / 2}
        textAnchor="start"
        fontSize="11"
        fill="#0e7490"
        fontWeight="500"
        dominantBaseline="middle"
      >
        ↕ {heightCm} cm
      </text>
    </svg>
  );
}

// ─── Etykiety wymiarów dla pudełka ───────────────────────────────────

function DimLabels({
  widthCm,
  heightCm,
  depthCm,
  fx1,
  fy1,
  fx2,
  fy2,
  bx1,
  by1,
}: {
  widthCm: number;
  heightCm: number;
  depthCm: number;
  fx1: number;
  fy1: number;
  fx2: number;
  fy2: number;
  bx1: number;
  by1: number;
}) {
  return (
    <g fontSize="10" fill="#78350f" fontWeight="500">
      {/* Szerokość — pod frontem */}
      <text x={(fx1 + fx2) / 2} y={fy2 + 14} textAnchor="middle">
        ↔ {widthCm} cm
      </text>
      {/* Wysokość — z prawej strony */}
      <text
        x={fx2 + 6}
        y={(fy1 + fy2) / 2}
        textAnchor="start"
        dominantBaseline="middle"
      >
        ↕ {heightCm} cm
      </text>
      {/* Głębokość — na górnej krawędzi back face */}
      <text
        x={(bx1 + fx1) / 2 - 4}
        y={(by1 + fy1) / 2}
        textAnchor="end"
        dominantBaseline="middle"
      >
        ⤢ {depthCm} cm
      </text>
    </g>
  );
}
