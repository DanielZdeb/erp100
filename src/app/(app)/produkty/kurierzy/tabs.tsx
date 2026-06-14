import Link from "next/link";
import { Calculator, Table2 } from "lucide-react";

import { cn } from "@/lib/utils";

export function KurierzyTabs({
  activeTab,
  kalkulator,
  cennik,
}: {
  activeTab: "kalkulator" | "cennik";
  kalkulator: React.ReactNode;
  cennik: React.ReactNode;
}) {
  const tabs = [
    {
      key: "kalkulator" as const,
      label: "Kalkulator",
      icon: Calculator,
      desc: "Policz wycenę przesyłki dla dowolnych wymiarów i wagi",
    },
    {
      key: "cennik" as const,
      label: "Cennik usług",
      icon: Table2,
      desc: "Pełna tabela cen z umów + opłaty dodatkowe",
    },
  ];

  return (
    <div className="space-y-4">
      <nav className="flex gap-1 border-b">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = t.key === activeTab;
          return (
            <Link
              key={t.key}
              href={`/produkty/kurierzy?tab=${t.key}`}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 -mb-px transition-colors",
                isActive
                  ? "border-amber-600 text-amber-900 font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted",
              )}
            >
              <Icon className="size-4" />
              {t.label}
            </Link>
          );
        })}
      </nav>

      <p className="text-xs text-muted-foreground">
        {tabs.find((t) => t.key === activeTab)?.desc}
      </p>

      {activeTab === "kalkulator" ? kalkulator : cennik}
    </div>
  );
}
