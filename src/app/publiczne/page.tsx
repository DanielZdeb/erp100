import Link from "next/link";
import { BookOpen, PackageOpen, ChevronRight } from "lucide-react";

import {
  LANGS,
  LANG_FLAG,
  LANG_LABEL,
  UI_TEXT,
  normalizeLang,
} from "@/lib/publiczne-content";

export const metadata = {
  title: "ACRO4F — witamy",
  description: "Instrukcje produktów ACRO4F i procedura zwrotu towaru",
};

// ISR: strona ma tylko statyczny content (translacje) — cache OK.
export const revalidate = 3600;

export default async function PublicHomePage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang: langParam } = await searchParams;
  const lang = normalizeLang(langParam);
  const t = UI_TEXT[lang];

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Kolorowy blob w tle — subtelny, mobile-first (nie zabiera głównego focusu). */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -left-20 size-[420px] rounded-full blur-3xl opacity-40"
        style={{
          background:
            "radial-gradient(circle, rgba(255,159,199,0.9) 0%, rgba(255,159,199,0) 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-20 -right-24 size-[360px] rounded-full blur-3xl opacity-40"
        style={{
          background:
            "radial-gradient(circle, rgba(130,182,253,0.9) 0%, rgba(130,182,253,0) 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 left-1/3 size-[380px] rounded-full blur-3xl opacity-40"
        style={{
          background:
            "radial-gradient(circle, rgba(17,240,170,0.7) 0%, rgba(17,240,170,0) 70%)",
        }}
      />

      <main className="relative max-w-lg mx-auto px-5 pt-10 pb-16 sm:pt-14">
        {/* Logo ACRO4F */}
        <div className="flex justify-center mb-8 sm:mb-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/uploads/brand/acro4f-logo.svg"
            alt="ACRO4F"
            className="h-16 sm:h-20 w-auto"
          />
        </div>

        {/* Welcome heading */}
        <h1 className="text-center text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
          {t.welcome}
        </h1>

        {/* Wybór języka — mobile: 4 kolumny (bo dużo języków) */}
        <section className="mt-8">
          <div className="text-center text-[11px] uppercase tracking-widest text-slate-500 font-semibold mb-3">
            {t.chooseLang}
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
            {LANGS.map((l) => {
              const isActive = l === lang;
              return (
                <Link
                  key={l}
                  href={`/publiczne?lang=${l}`}
                  scroll={false}
                  className={
                    isActive
                      ? "flex flex-col items-center gap-1 rounded-xl bg-slate-900 text-white p-2 shadow-sm"
                      : "flex flex-col items-center gap-1 rounded-xl bg-white ring-1 ring-slate-200 p-2 hover:ring-slate-900 transition-all"
                  }
                  aria-label={LANG_LABEL[l]}
                >
                  <span className="text-2xl leading-none" aria-hidden>
                    {LANG_FLAG[l]}
                  </span>
                  <span className="text-[10px] font-bold tracking-wider">
                    {l}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Kafle — INSTRUKCJE + ZWROT */}
        <section className="mt-10 space-y-4">
          <TileLink
            href={`/publiczne/instrukcje?lang=${lang}`}
            icon={<BookOpen className="size-7" />}
            title={t.tiles.manuals.title}
            desc={t.tiles.manuals.desc}
            accent="pink"
          />
          <TileLink
            href={`/publiczne/zwrot?lang=${lang}`}
            icon={<PackageOpen className="size-7" />}
            title={t.tiles.returns.title}
            desc={t.tiles.returns.desc}
            accent="blue"
          />
        </section>

        <footer className="mt-14 text-center text-[11px] text-slate-400">
          {t.brandFooter}
        </footer>
      </main>
    </div>
  );
}

function TileLink({
  href,
  icon,
  title,
  desc,
  accent,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  accent: "pink" | "blue";
}) {
  // Gradient border-style kafla nawiązuje do 3 kropek loga.
  const bgClass =
    accent === "pink"
      ? "bg-gradient-to-br from-pink-50 via-white to-white"
      : "bg-gradient-to-br from-blue-50 via-white to-white";
  const iconBg =
    accent === "pink"
      ? "bg-pink-100 text-pink-700 group-hover:bg-pink-200"
      : "bg-blue-100 text-blue-700 group-hover:bg-blue-200";
  return (
    <Link
      href={href}
      className={`group block rounded-2xl ${bgClass} ring-1 ring-slate-200 hover:ring-slate-900 hover:shadow-lg transition-all p-5 active:scale-[0.99]`}
    >
      <div className="flex items-start gap-4">
        <div
          className={`shrink-0 size-14 grid place-items-center rounded-xl ${iconBg} transition-colors`}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-lg font-bold text-slate-900 leading-snug">
            {title}
          </div>
          <div className="mt-1 text-sm text-slate-600 leading-snug">{desc}</div>
        </div>
        <ChevronRight className="shrink-0 mt-1 text-slate-400 group-hover:text-slate-900 transition-colors" />
      </div>
    </Link>
  );
}
