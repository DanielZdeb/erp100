import Link from "next/link";
import { BookOpen } from "lucide-react";

import { db } from "@/lib/db";

// ISR: strona cache'owana, odświeżana co 5 min
export const revalidate = 300;

// Firma ACRO4F — publikujemy tylko jej instrukcje
const ACRO4F_COMPANY_ID = "cmq2rfxri0000ywhj5yhn35fa";

export const metadata = {
  title: "Instrukcje produktów — ACRO4F",
  description: "Interaktywne instrukcje montażu i obsługi produktów ACRO4F",
};

export default async function InstrukcjeListPage() {
  const manuals = await db.productManual.findMany({
    where: {
      companyId: ACRO4F_COMPANY_ID,
      archived: false,
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      manualJson: true,
    },
  });

  // Ekstrahujemy activeLanguages z JSON żeby pokazać na karcie
  const items = manuals.map((m) => {
    const doc = (m.manualJson ?? {}) as { activeLanguages?: string[] };
    return {
      id: m.id,
      name: m.name,
      langs: doc.activeLanguages ?? [],
    };
  });

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <header className="mb-8 text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-slate-900 text-white px-3 py-1 text-[10px] font-bold uppercase tracking-widest">
          ACRO4F
        </div>
        <h1 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight">
          Instrukcje produktów
        </h1>
        <p className="mt-2 text-slate-600 text-sm sm:text-base">
          Wybierz produkt, dla którego chcesz zobaczyć instrukcję.
        </p>
      </header>

      {items.length === 0 && (
        <div className="rounded-xl bg-slate-100 p-8 text-center text-slate-500">
          Brak dostępnych instrukcji.
        </div>
      )}

      <ul className="space-y-3">
        {items.map((m) => (
          <li key={m.id}>
            <Link
              href={`/publiczne/instrukcje/${m.id}`}
              className="group flex items-start gap-4 rounded-xl bg-white ring-1 ring-slate-200 p-4 hover:ring-slate-900 hover:shadow-md transition-all"
            >
              <div className="size-10 shrink-0 grid place-items-center rounded-lg bg-slate-900 text-white">
                <BookOpen className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-slate-900 group-hover:underline">
                  {m.name}
                </div>
                {m.langs.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {m.langs.map((l) => (
                      <span
                        key={l}
                        className="text-[9px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded"
                      >
                        {l}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="shrink-0 text-slate-400 group-hover:text-slate-900 transition-colors">
                →
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <footer className="mt-12 text-center text-[11px] text-slate-400">
        ACRO4F Sp. z o.o. · Wszelkie prawa zastrzeżone
      </footer>
    </div>
  );
}
