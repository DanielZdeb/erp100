import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { db } from "@/lib/db";
import { splitDocIntoSections } from "@/lib/tiptap-render";

import { LangSwitcher } from "./_components/lang-switcher";
import { ManualPager } from "./_components/manual-pager";

// Strona jest dynamiczna (odczytujemy searchParams.lang), więc revalidate nie ma sensu.

const ACRO4F_COMPANY_ID = "cmq2rfxri0000ywhj5yhn35fa";

const LANG_LABEL: Record<string, string> = {
  PL: "Polski",
  EN: "English",
  DE: "Deutsch",
  UA: "Українська",
  HU: "Magyar",
  SK: "Slovenčina",
  CS: "Čeština",
};

type ManualDoc = {
  activeLanguages?: string[];
  pages?: Array<{
    id?: string;
    lang?: string;
    content?: unknown;
  }>;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const m = await db.productManual.findFirst({
    where: { id, companyId: ACRO4F_COMPANY_ID, archived: false },
    select: { name: true },
  });
  return {
    title: m ? `${m.name} — ACRO4F` : "Instrukcja — ACRO4F",
  };
}

export default async function InstrukcjaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { id } = await params;
  const { lang: langParam } = await searchParams;

  const manual = await db.productManual.findFirst({
    where: { id, companyId: ACRO4F_COMPANY_ID, archived: false },
    select: {
      id: true,
      name: true,
      manualJson: true,
    },
  });
  if (!manual) notFound();

  const doc = (manual.manualJson ?? {}) as ManualDoc;
  const activeLangs = doc.activeLanguages ?? [];
  const pages = doc.pages ?? [];

  // Wybór języka: query param → pierwszy dostępny
  const chosenLang =
    (langParam && activeLangs.includes(langParam.toUpperCase())
      ? langParam.toUpperCase()
      : null) ??
    activeLangs[0] ??
    "PL";

  // Strony w wybranym języku (zazwyczaj 1 na język w schemacie ProductManual).
  const pagesInLang = pages.filter((p) => (p.lang ?? "PL") === chosenLang);

  // Każdą stronę TipTap dzielimy na sekcje po nagłówkach H1/H2 i sklejamy
  // w jedną, wspólną listę sekcji dla pagera.
  const sections = pagesInLang.flatMap((p) => splitDocIntoSections(p.content));

  return (
    <div className="min-h-screen">
      {/* Sticky header z powrotem + językami */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
          <Link
            href="/publiczne/instrukcje"
            className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="size-4" />
            Wszystkie instrukcje
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-sm sm:text-base font-semibold truncate">
              {manual.name}
            </h1>
          </div>
          <LangSwitcher
            manualId={id}
            available={activeLangs}
            current={chosenLang}
            labels={LANG_LABEL}
          />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {sections.length === 0 ? (
          <div className="rounded-xl bg-slate-100 p-8 text-center text-slate-500">
            Brak treści w języku {LANG_LABEL[chosenLang] ?? chosenLang}.
          </div>
        ) : (
          <ManualPager sections={sections} />
        )}
      </main>

      <footer className="max-w-3xl mx-auto px-4 py-8 mt-8 border-t border-slate-200 text-center text-[11px] text-slate-400">
        ACRO4F Sp. z o.o. · Wszelkie prawa zastrzeżone
      </footer>
    </div>
  );
}
