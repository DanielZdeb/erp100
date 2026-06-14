import Link from "next/link";
import { Calculator, List, Table2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { StandaloneCourierCalculator } from "../produkty/kurierzy/standalone-calculator";
import { ServicesTariffTable } from "../produkty/kurierzy/services-tariff-table";

export const dynamic = "force-dynamic";

type TabKey = "cennik" | "kalkulator";

const TABS: { key: TabKey; label: string; icon: typeof List; desc: string }[] =
  [
    {
      key: "cennik",
      label: "Cennik usług",
      icon: Table2,
      desc: "Pełna tabela cen z umów + opłaty dodatkowe.",
    },
    {
      key: "kalkulator",
      label: "Kalkulator",
      icon: Calculator,
      desc: "Policz wycenę przesyłki dla dowolnych wymiarów i wagi.",
    },
  ];

function parseTab(v: string | undefined): TabKey {
  if (v === "kalkulator") return "kalkulator";
  return "cennik";
}

export default async function KurierzyPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const activeTab = parseTab(sp.tab);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-heading font-bold tracking-tight">
          Kurierzy
        </h1>
        <p className="text-sm text-muted-foreground">
          Cennik usług kurierskich i kalkulator wysyłki.
        </p>
      </div>

      {/* Zakładki: Cennik usług (domyślne) + Kalkulator */}
      <div>
        <nav className="flex gap-1 border-b">
          {TABS.map((t) => {
            const Icon = t.icon;
            const isActive = t.key === activeTab;
            return (
              <Link
                key={t.key}
                href={`/kurierzy?tab=${t.key}`}
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
        <p className="text-xs text-muted-foreground mt-2 mb-4">
          {TABS.find((t) => t.key === activeTab)?.desc}
        </p>

        {activeTab === "cennik" && <ServicesTariffTable />}
        {activeTab === "kalkulator" && <StandaloneCourierCalculator />}
      </div>
    </div>
  );
}
