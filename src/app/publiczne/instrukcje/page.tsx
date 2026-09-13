import Link from "next/link";
import { BookOpen, ArrowLeft, ChevronRight } from "lucide-react";

import { db } from "@/lib/db";
import { UI_TEXT, normalizeLang } from "@/lib/publiczne-content";

export const revalidate = 300;

// Firma ACRO4F — publikujemy tylko jej instrukcje
const ACRO4F_COMPANY_ID = "cmq2rfxri0000ywhj5yhn35fa";

export const metadata = {
  title: "Instrukcje produktów — ACRO4F",
  description: "Interaktywne instrukcje montażu i obsługi produktów ACRO4F",
};

export default async function InstrukcjeListPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang: langParam } = await searchParams;
  const lang = normalizeLang(langParam);
  const t = UI_TEXT[lang];

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

  const items = manuals.map((m) => {
    const doc = (m.manualJson ?? {}) as { activeLanguages?: string[] };
    return {
      id: m.id,
      name: m.name,
      langs: doc.activeLanguages ?? [],
    };
  });

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            href={`/publiczne?lang=${lang}`}
            className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="size-4" />
            {t.back}
          </Link>
          <div className="flex-1" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/uploads/brand/acro4f-logo.svg"
            alt="ACRO4F"
            className="h-8 w-auto"
          />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          {t.tiles.manuals.title}
        </h1>
        <p className="mt-2 text-slate-600 text-sm sm:text-base">
          {t.tiles.manuals.desc}
        </p>

        {items.length === 0 && (
          <div className="mt-8 rounded-xl bg-slate-100 p-8 text-center text-slate-500">
            —
          </div>
        )}

        <ul className="mt-6 space-y-3">
          {items.map((m) => (
            <li key={m.id}>
              <Link
                href={`/publiczne/instrukcje/${m.id}?lang=${lang}`}
                className="group flex items-start gap-4 rounded-xl bg-white ring-1 ring-slate-200 p-4 hover:ring-slate-900 hover:shadow-md transition-all active:scale-[0.99]"
              >
                <div className="size-11 shrink-0 grid place-items-center rounded-xl bg-gradient-to-br from-pink-100 to-blue-100 text-slate-900">
                  <BookOpen className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-900 group-hover:underline leading-snug">
                    {m.name}
                  </div>
                  {m.langs.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
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
                <ChevronRight className="shrink-0 mt-1 text-slate-400 group-hover:text-slate-900 transition-colors" />
              </Link>
            </li>
          ))}
        </ul>

        <footer className="mt-14 text-center text-[11px] text-slate-400">
          {t.brandFooter}
        </footer>
      </main>
    </div>
  );
}
