"use client";

/**
 * "Historia AI" — przycisk z licznikiem koszt USD/PLN otwiera dropdown z lista
 * wszystkich logow ProductAiCost dla danego produktu.
 *
 * Pobiera dane lazy (przy pierwszym otwarciu) — nie blokuje SSR/renderu karty.
 */

import { useState, useEffect } from "react";
import {
  Receipt,
  Loader2,
  Sparkles,
  Image as ImageIcon,
  FileText,
  Layers,
  Copy,
  Wand2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { formatPln, formatUsd } from "@/lib/usd-to-pln";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  listProductAiCostsAction,
  type AiCostEntry,
} from "@/server/product-ai-costs";

const ACTION_META: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; color: string }
> = {
  TEXT_GEN: { label: "Tekst", icon: FileText, color: "text-emerald-600" },
  IMAGE_GEN: { label: "Obraz", icon: ImageIcon, color: "text-violet-600" },
  IMAGE_EDIT: { label: "Edycja", icon: Sparkles, color: "text-fuchsia-600" },
  BULK_EDIT: { label: "Bulk", icon: Layers, color: "text-orange-600" },
  CUSTOM_GEN: { label: "Custom", icon: Sparkles, color: "text-pink-600" },
  COPY_IMAGES_AI: { label: "Z innego (AI)", icon: Copy, color: "text-cyan-600" },
  DRAFT_TEMPLATE: { label: "Szablon AI", icon: Wand2, color: "text-violet-700" },
  COPY_TEMPLATE_AI: { label: "Szablon kopia (AI)", icon: Copy, color: "text-violet-500" },
};

export function AiCostLog({ productId }: { productId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{
    entries: AiCostEntry[];
    totals: { total: number; byAction: Record<string, number>; count: number };
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const r = await listProductAiCostsAction(productId);
        if (cancelled) return;
        if (r.ok) {
          setData({ entries: r.entries, totals: r.totals });
        } else {
          toast.error(r.error);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, productId]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 h-7 text-xs text-slate-600 hover:text-slate-900"
            title="Historia kosztow AI dla tego produktu"
          />
        }
      >
        <Receipt className="size-3.5" />
        Historia AI
        {data && data.totals.total > 0 && (
          <span className="font-mono text-[10px] text-emerald-700 font-semibold">
            {formatPln(data.totals.total, 2)}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[420px] max-h-[70vh] flex flex-col p-0 overflow-hidden"
      >
        <div className="px-4 py-3 border-b">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <Receipt className="size-4 text-slate-600" />
              Historia AI dla produktu
            </h3>
            {data && (
              <span className="text-[10px] text-slate-500">
                {data.totals.count} operacji
              </span>
            )}
          </div>
          {data && data.totals.total > 0 && (
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className="text-slate-500">Razem wydano:</span>
              <span className="font-bold tabular-nums">
                {formatUsd(data.totals.total, 4)}
              </span>
              <span className="text-slate-400">·</span>
              <span className="font-bold text-emerald-700 tabular-nums">
                {formatPln(data.totals.total, 2)}
              </span>
            </div>
          )}
          {data && Object.keys(data.totals.byAction).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
              {Object.entries(data.totals.byAction)
                .sort(([, a], [, b]) => b - a)
                .map(([action, sum]) => {
                  const meta = ACTION_META[action];
                  return (
                    <span
                      key={action}
                      className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 tabular-nums"
                      title={action}
                    >
                      {meta?.label ?? action}: {formatPln(sum, 2)}
                    </span>
                  );
                })}
            </div>
          )}
        </div>

        <div className="overflow-y-auto flex-1 px-1 py-1">
          {loading && (
            <div className="grid place-items-center py-8 text-slate-400 text-xs">
              <Loader2 className="size-4 animate-spin mb-1" />
              Laduje...
            </div>
          )}
          {!loading && data && data.entries.length === 0 && (
            <div className="text-center py-8 text-xs text-slate-500">
              Brak kosztow AI dla tego produktu.
            </div>
          )}
          {!loading &&
            data?.entries.map((e) => {
              const meta = ACTION_META[e.action];
              const Icon = meta?.icon ?? Sparkles;
              const date = new Date(e.createdAt);
              return (
                <div
                  key={e.id}
                  className="flex items-start gap-2 px-3 py-1.5 hover:bg-slate-50 rounded text-xs"
                >
                  <Icon className={cn("size-3.5 mt-0.5 shrink-0", meta?.color)} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate" title={e.label}>
                      {e.label}
                    </div>
                    <div className="text-[10px] text-slate-500 tabular-nums">
                      {date.toLocaleDateString("pl-PL")}{" "}
                      {date.toLocaleTimeString("pl-PL", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                  <div className="text-right shrink-0 space-y-0.5">
                    <div className="font-mono tabular-nums text-[11px]">
                      {formatUsd(e.usd, 4)}
                    </div>
                    <div className="font-mono tabular-nums text-[10px] text-emerald-700 font-semibold">
                      {formatPln(e.usd, 2)}
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
