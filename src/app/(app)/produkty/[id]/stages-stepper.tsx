import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PRODUCT_STAGES,
  STAGE_LABEL,
  STAGE_NUMBER,
  type ProductStageT,
} from "@/lib/product-stages";

export function StagesStepper({
  completedStages,
}: {
  completedStages: Set<ProductStageT>;
}) {
  const completedCount = PRODUCT_STAGES.filter((s) =>
    completedStages.has(s),
  ).length;
  const progress = (completedCount / PRODUCT_STAGES.length) * 100;

  return (
    <div className="rounded-lg ring-1 ring-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium">
          Etapy wdrożenia produktu
          <span className="text-muted-foreground font-normal ml-2">
            {completedCount} z {PRODUCT_STAGES.length}{" "}
            ({Math.round(progress)}%)
          </span>
        </div>
        <div className="hidden sm:block w-40 h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <ol className="flex flex-wrap gap-y-3 items-center">
        {PRODUCT_STAGES.map((stage, idx) => {
          const done = completedStages.has(stage);
          const isLast = idx === PRODUCT_STAGES.length - 1;
          return (
            <li
              key={stage}
              className={cn(
                "flex items-center gap-1 flex-1 min-w-[100px]",
              )}
            >
              <div className="flex flex-col items-center gap-1.5 shrink-0">
                <div
                  className={cn(
                    "size-9 rounded-full flex items-center justify-center text-sm font-semibold ring-2 transition-colors",
                    done
                      ? "bg-emerald-500 text-white ring-emerald-500"
                      : "bg-background text-muted-foreground ring-border",
                  )}
                >
                  {done ? (
                    <Check className="size-4" />
                  ) : (
                    STAGE_NUMBER[stage]
                  )}
                </div>
                <div
                  className={cn(
                    "text-[11px] leading-tight text-center",
                    done ? "text-foreground font-medium" : "text-muted-foreground",
                  )}
                >
                  {STAGE_LABEL[stage]}
                </div>
              </div>
              {!isLast && (
                <div
                  className={cn(
                    "flex-1 h-0.5 mt-[-18px] mx-1",
                    done ? "bg-emerald-500" : "bg-border",
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
