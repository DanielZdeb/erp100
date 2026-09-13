import Link from "next/link";
import { ArrowLeft, MapPin, Mail, Clock, AlertTriangle } from "lucide-react";

import {
  UI_TEXT,
  ZWROT,
  LANGS,
  LANG_LABEL,
  normalizeLang,
  type Lang,
} from "@/lib/publiczne-content";

import { LangPills } from "../_components/lang-pills";

export const revalidate = 3600;

export const metadata = {
  title: "Zwrot towaru — ACRO4F",
  description:
    "Procedura zwrotu towaru w sklepie ACRO4F. Prawo do zwrotu w 14 dni.",
};

export default async function ZwrotPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang: langParam } = await searchParams;
  const lang: Lang = normalizeLang(langParam);
  const t = UI_TEXT[lang];
  const z = ZWROT[lang];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
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
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
          {z.title}
        </h1>

        {/* Language pills */}
        <div className="mt-4">
          <LangPills
            langs={LANGS}
            currentLang={lang}
            labels={LANG_LABEL}
            basePath="/publiczne/zwrot"
          />
        </div>

        {/* Intro */}
        <p className="mt-6 text-base sm:text-lg text-slate-700 leading-relaxed">
          {z.intro}
        </p>

        {/* Termin — highlight box */}
        <div
          className="mt-6 flex items-start gap-3 rounded-xl p-4 sm:p-5"
          style={{
            background:
              "linear-gradient(135deg, rgba(130,182,253,0.15), rgba(17,240,170,0.15))",
          }}
        >
          <Clock className="size-6 text-blue-700 shrink-0 mt-0.5" />
          <div>
            <div className="text-[11px] uppercase tracking-widest text-slate-600 font-semibold">
              {z.timeLabel}
            </div>
            <div className="mt-1 text-lg font-bold text-slate-900">
              {z.timeValue}
            </div>
          </div>
        </div>

        {/* Kroki */}
        <section className="mt-10">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 mb-4">
            {z.stepsHeading}
          </h2>
          <ol className="space-y-3">
            {z.steps.map((s, i) => (
              <li
                key={i}
                className="rounded-xl bg-white ring-1 ring-slate-200 p-4 flex gap-4"
              >
                <div className="shrink-0 size-9 grid place-items-center rounded-full bg-slate-900 text-white text-sm font-bold">
                  {i + 1}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900">{s.title}</div>
                  <div className="mt-1 text-sm text-slate-600 leading-relaxed">
                    {s.body}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Adres + email — 2 kafle na desktop, stack na mobile */}
        <section className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl bg-pink-50 ring-1 ring-pink-100 p-5">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-pink-700 font-semibold">
              <MapPin className="size-4" />
              {z.addressHeading}
            </div>
            <div className="mt-2 text-slate-900 space-y-0.5">
              {z.addressLines.map((line, i) => (
                <div key={i} className={i === 0 ? "font-bold" : "text-sm"}>
                  {line}
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl bg-blue-50 ring-1 ring-blue-100 p-5">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-blue-700 font-semibold">
              <Mail className="size-4" />
              {z.emailHeading}
            </div>
            <div className="mt-2">
              <a
                href={`mailto:${z.emailValue}`}
                className="text-slate-900 font-bold text-lg hover:underline break-all"
              >
                {z.emailValue}
              </a>
            </div>
          </div>
        </section>

        {/* Notice */}
        <section className="mt-8 rounded-xl bg-amber-50 border-l-4 border-amber-400 p-4 sm:p-5 flex gap-3">
          <AlertTriangle className="size-5 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-amber-900">
              {z.noticeHeading}
            </div>
            <div className="mt-1 text-sm text-amber-900 leading-relaxed">
              {z.noticeBody}
            </div>
          </div>
        </section>

        <footer className="mt-14 text-center text-[11px] text-slate-400">
          {t.brandFooter}
        </footer>
      </main>
    </div>
  );
}
