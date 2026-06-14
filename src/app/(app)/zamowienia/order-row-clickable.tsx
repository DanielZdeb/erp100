"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Klikalny wiersz tabeli zamówień. Klik w dowolnym miejscu (poza przyciskami,
 * linkami i inputami) nawiguje do strony zamówienia. Hover podświetla wiersz.
 */
export function ClickableOrderRow({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  return (
    <tr
      data-slot="table-row"
      onClick={(e) => {
        const target = e.target as HTMLElement;
        // Pomijamy gdy klik trafił w interaktywny element wewnątrz wiersza.
        if (
          target.closest(
            "button, a, input, select, textarea, [role='button'], [role='link']",
          )
        ) {
          return;
        }
        router.push(href);
      }}
      className={cn(
        "border-b transition-colors hover:bg-muted/50 cursor-pointer",
        className,
      )}
    >
      {children}
    </tr>
  );
}

/**
 * Mała wizualizacja kontenera — SVG widok boczny z paskiem wypełnienia.
 * Pokazuje fillRate jako kolorowy słupek + procent w środku + badge ×N gdy
 * kontenerów jest więcej. Tooltip pokazuje pełne info.
 */
export function MiniContainerVisual({
  fillRate,
  containerCount,
  containerSize,
  usedCbm,
}: {
  fillRate: number;
  containerCount: number;
  containerSize: number;
  usedCbm: number;
}) {
  const safeFill = Math.max(0, Math.min(fillRate, 1));
  const overflow = fillRate > 1;
  const good = fillRate >= 0.85 && fillRate <= 1;
  const fillColor = overflow ? "#f59e0b" : good ? "#10b981" : "#6366f1";
  const lightFill = overflow ? "#fef3c7" : good ? "#d1fae5" : "#e0e7ff";

  const W = 64;
  const H = 38;
  const padX = 4;
  const padY = 5;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;
  const fillH = innerH * safeFill;
  const fillY = padY + innerH - fillH;
  const pctText = `${Math.round(fillRate * 100)}%`;

  return (
    <div
      className="relative shrink-0"
      style={{ width: W, height: H }}
      title={`${containerCount}× ${containerSize.toFixed(0)} m³ · ${usedCbm.toFixed(2)} m³ użyte · ${pctText} wypełnione${overflow ? " (przekroczenie!)" : ""}`}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full">
        {/* Cień */}
        <ellipse
          cx={W / 2}
          cy={H - 1}
          rx={W / 2 - padX}
          ry={1}
          fill="rgba(0,0,0,0.1)"
        />
        {/* Kontener — przód */}
        <rect
          x={padX}
          y={padY}
          width={innerW}
          height={innerH}
          fill={lightFill}
          opacity={0.4}
          stroke="#475569"
          strokeWidth={1}
          rx={1.5}
        />
        {/* Wypełnienie od dołu */}
        {fillH > 0 && (
          <rect
            x={padX + 0.5}
            y={fillY}
            width={innerW - 1}
            height={fillH}
            fill={fillColor}
            opacity={0.85}
            rx={1}
          />
        )}
        {/* Ridges (pionowe linie dachu) */}
        {Array.from({ length: 5 }).map((_, i) => (
          <line
            key={i}
            x1={padX + 4 + ((innerW - 8) / 5) * i}
            y1={padY + 1}
            x2={padX + 4 + ((innerW - 8) / 5) * i}
            y2={padY + innerH - 1}
            stroke="rgba(71,85,105,0.15)"
            strokeWidth={0.5}
          />
        ))}
        {/* Overflow indicator */}
        {overflow && (
          <line
            x1={padX - 1}
            y1={padY - 1}
            x2={W - padX + 1}
            y2={padY - 1}
            stroke="#dc2626"
            strokeWidth={1.5}
            strokeDasharray="2 1.5"
          />
        )}
        {/* % środek */}
        <text
          x={W / 2}
          y={padY + innerH / 2 + 3}
          textAnchor="middle"
          fontSize={9}
          fontWeight={800}
          fill={safeFill > 0.4 ? "white" : "#475569"}
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {pctText}
        </text>
      </svg>
      {/* Badge gdy >1 kontener */}
      {containerCount > 1 && (
        <span className="absolute -top-1 -right-1 bg-slate-700 text-white text-[8px] font-bold rounded-full px-1 py-0 leading-tight">
          ×{containerCount}
        </span>
      )}
    </div>
  );
}
