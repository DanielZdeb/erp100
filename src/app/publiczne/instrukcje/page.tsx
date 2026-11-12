import Link from "next/link";
import { BookOpen, ArrowLeft, FileUp } from "lucide-react";

import { db } from "@/lib/db";
import { UI_TEXT, normalizeLang } from "@/lib/publiczne-content";

export const revalidate = 300;

// Firma ACRO4F — publikujemy tylko jej instrukcje
const ACRO4F_COMPANY_ID = "cmq2rfxri0000ywhj5yhn35fa";

// Mapowanie nazwy instrukcji → cover image w /uploads/manual-covers/.
// Klucz = dokładna nazwa z ProductManual.name (zachowaj spacje/case).
// Dla instrukcji bez mapowania pokazujemy ikonowy fallback.
const MANUAL_COVERS: Record<string, string> = {
  "Hamak do jogi": "/uploads/manual-covers/hamak-do-jogi.webp",
  "Hamaki dla dzieci, huśtawki sensoryczne":
    "/uploads/manual-covers/hustawka-sensoryczna.webp",
  "Koła cyrkowe aerial hoop": "/uploads/manual-covers/kolo-cyrkowe.webp",
  "Mocowanie sufitowe 1 ucho": "/uploads/manual-covers/mocowanie-sufitowe.jpg",
  "Mocowanie sufitowe 2 ucha  300 kg":
    "/uploads/manual-covers/mocowanie-sufitowe.jpg",
  "Rury pole dance": "/uploads/manual-covers/rura-pole-dance.webp",
  "Szarfa akrobatyczna AERIAL SILK":
    "/uploads/manual-covers/szarfa-akrobatyczna.webp",
};

// Hierarchia wyświetlania kafelków — im wcześniej na liście, tym wyżej.
// Instrukcje spoza listy trafiają na koniec, alfabetycznie.
const MANUAL_ORDER: string[] = [
  "Hamaki dla dzieci, huśtawki sensoryczne",
  "Szarfa akrobatyczna AERIAL SILK",
  "Hamak do jogi",
  "Rury pole dance",
  "Koła cyrkowe aerial hoop",
  "Mocowanie sufitowe 1 ucho",
];

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
      kind: true,
      manualJson: true,
    },
  });

  const items = manuals
    .map((m) => {
      const doc = (m.manualJson ?? {}) as { activeLanguages?: string[] };
      return {
        id: m.id,
        name: m.name,
        isPdf: m.kind === "PDF_ATTACHMENT",
        langs: doc.activeLanguages ?? [],
        cover: MANUAL_COVERS[m.name] ?? null,
      };
    })
    .sort((a, b) => {
      const ai = MANUAL_ORDER.indexOf(a.name);
      const bi = MANUAL_ORDER.indexOf(b.name);
      if (ai === -1 && bi === -1) return a.name.localeCompare(b.name, "pl");
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
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

      <main className="max-w-4xl mx-auto px-4 py-6 sm:py-8">
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

        <ul className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
          {items.map((m) => (
            <li key={m.id}>
              <Link
                href={`/publiczne/instrukcje/${m.id}?lang=${lang}`}
                className="group block relative aspect-[3/4] overflow-hidden rounded-2xl ring-1 ring-slate-200 bg-slate-100 shadow-sm hover:shadow-xl hover:ring-slate-900 transition-all active:scale-[0.98]"
              >
                {m.cover ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={m.cover}
                    alt={m.name}
                    loading="lazy"
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-pink-100 via-white to-blue-100 text-slate-400">
                    {m.isPdf ? (
                      <FileUp className="size-12" />
                    ) : (
                      <BookOpen className="size-12" />
                    )}
                  </div>
                )}

                {/* Gradient czytelności tekstu */}
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent"
                />

                {/* Badge PDF lub języki w prawym górnym rogu */}
                <div className="absolute top-2 right-2 flex flex-wrap gap-1 justify-end max-w-[70%]">
                  {m.isPdf ? (
                    <span className="text-[9px] font-bold uppercase tracking-wider bg-rose-500/95 text-white px-1.5 py-0.5 rounded shadow-sm">
                      PDF
                    </span>
                  ) : (
                    m.langs.slice(0, 3).map((l) => (
                      <span
                        key={l}
                        className="text-[9px] font-bold uppercase tracking-wider bg-white/90 text-slate-900 px-1.5 py-0.5 rounded shadow-sm"
                      >
                        {l}
                      </span>
                    ))
                  )}
                </div>

                {/* Napis na zdjęciu */}
                <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4">
                  <div className="text-white font-bold text-sm sm:text-base leading-tight drop-shadow-md line-clamp-3">
                    {m.name}
                  </div>
                </div>
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
