"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type Bundle = {
  id: string;
  productCode: string;
  name: string;
  defaultSalePriceSklepPln: number | null;
  defaultUnitPricePln: number | null;
  category: { id: string; name: string } | null;
};

const PRESETS = [0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6];

export function PrzeliczStolyForm({
  grouped,
  initialMargin,
}: {
  grouped: Array<[string, Bundle[]]>;
  initialMargin: number;
}) {
  const allIds = useMemo(
    () => grouped.flatMap(([, bs]) => bs.map((b) => b.id)),
    [grouped],
  );
  const [selected, setSelected] = useState<Set<string>>(new Set(allIds));
  const [margin, setMargin] = useState(initialMargin);
  const [marginCustom, setMarginCustom] = useState("");

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleCategory(ids: string[]) {
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = ids.every((id) => next.has(id));
      if (allSelected) {
        ids.forEach((id) => next.delete(id));
      } else {
        ids.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  const finalMargin = marginCustom
    ? parseFloat(marginCustom.replace(",", "."))
    : margin;
  const validMargin =
    Number.isFinite(finalMargin) && finalMargin > 0 && finalMargin < 1;

  const submitUrl =
    selected.size === 0 || !validMargin
      ? "#"
      : `/produkty/przelicz-stoly?go=1&margin=${finalMargin}&ids=${Array.from(selected).join(",")}`;

  return (
    <div className="p-8 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">Przelicz ceny zestawów stołowych</h1>
        <p className="text-sm text-slate-600 mt-2">
          Zaznacz zestawy + wybierz marżę. System przeliczy SKLEP brutto z
          zaokrągleniem do końcówki X9 (np. 2989, 4699).
        </p>
      </div>

      <div className="space-y-3 rounded-lg bg-emerald-50/40 ring-1 ring-emerald-200 p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
          Wybierz target marży
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-9 gap-2">
          {PRESETS.map((p) => (
            <button
              type="button"
              key={p}
              onClick={() => {
                setMargin(p);
                setMarginCustom("");
              }}
              className={`text-center rounded-md px-2 py-2 font-semibold transition-colors ring-1 text-sm ${
                Math.abs(margin - p) < 0.001 && !marginCustom
                  ? "bg-emerald-600 text-white ring-emerald-600"
                  : "bg-white ring-slate-200 hover:bg-emerald-100"
              }`}
            >
              {(p * 100).toFixed(0)}%
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-600">
          lub własna:
          <input
            type="number"
            value={marginCustom}
            onChange={(e) => setMarginCustom(e.target.value)}
            step="0.01"
            min="0.01"
            max="0.99"
            placeholder="np. 0.42"
            className="w-24 px-2 py-1 rounded ring-1 ring-slate-300 text-sm tabular-nums"
          />
          <span className="text-slate-500">
            ({validMargin ? `${(finalMargin * 100).toFixed(1)}%` : "podaj prawidłową"})
          </span>
        </div>
      </div>

      <div className="rounded-lg ring-1 ring-slate-200 bg-white">
        <div className="px-4 py-3 border-b bg-slate-50 flex items-center justify-between">
          <div className="text-sm font-semibold">
            Zestawy stołowe ({selected.size} z {allIds.length} zaznaczonych)
          </div>
          <div className="flex gap-2 text-xs">
            <button
              type="button"
              onClick={() => setSelected(new Set(allIds))}
              className="text-emerald-700 hover:underline"
            >
              Zaznacz wszystkie
            </button>
            <span className="text-slate-300">|</span>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-rose-700 hover:underline"
            >
              Odznacz wszystkie
            </button>
          </div>
        </div>
        <div className="divide-y">
          {grouped.map(([catName, bs]) => {
            const allInCatSelected = bs.every((b) => selected.has(b.id));
            const someInCatSelected = bs.some((b) => selected.has(b.id));
            return (
              <div key={catName}>
                <div className="px-4 py-2 bg-slate-50/60 flex items-center gap-2 text-xs font-semibold sticky top-0">
                  <input
                    type="checkbox"
                    checked={allInCatSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = !allInCatSelected && someInCatSelected;
                    }}
                    onChange={() => toggleCategory(bs.map((b) => b.id))}
                    className="size-4 accent-emerald-600"
                  />
                  <span className="text-violet-800">{catName}</span>
                  <span className="text-[10px] text-slate-500 ml-auto">
                    {bs.filter((b) => selected.has(b.id)).length}/{bs.length}
                  </span>
                </div>
                <ul>
                  {bs.map((b) => (
                    <li
                      key={b.id}
                      className="px-4 py-1.5 flex items-center gap-2 hover:bg-slate-50 text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(b.id)}
                        onChange={() => toggle(b.id)}
                        className="size-4 accent-emerald-600"
                      />
                      <span className="font-mono text-[10px] text-slate-500 w-24 shrink-0">
                        {b.productCode}
                      </span>
                      <span className="flex-1 min-w-0 truncate">{b.name}</span>
                      <span className="tabular-nums text-emerald-700 font-semibold shrink-0">
                        {b.defaultSalePriceSklepPln
                          ? `${(b.defaultSalePriceSklepPln * 1.23).toFixed(0)} zł`
                          : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Link
          href={submitUrl}
          className={`inline-flex items-center rounded-md px-5 py-2.5 font-semibold transition-colors ${
            selected.size > 0 && validMargin
              ? "bg-emerald-600 text-white hover:bg-emerald-700"
              : "bg-slate-200 text-slate-400 cursor-not-allowed"
          }`}
          aria-disabled={selected.size === 0 || !validMargin}
          onClick={(e) => {
            if (selected.size === 0 || !validMargin) e.preventDefault();
          }}
        >
          Przelicz {selected.size} zestawów ({(finalMargin * 100).toFixed(0)}%
          marży)
        </Link>
      </div>
    </div>
  );
}
