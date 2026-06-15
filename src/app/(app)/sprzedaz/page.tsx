import { Sparkles, FileText, Image as ImageIcon, Tag, Wand2, Package, LayoutTemplate } from "lucide-react";
import Link from "next/link";

export default function SprzedazPage() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">
      <header className="space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-pink-50 text-pink-700 text-[11px] font-bold uppercase tracking-wide">
          <Sparkles className="size-3.5" />
          Sprzedaż
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Moduł sprzedaży</h1>
        <p className="text-slate-600 max-w-2xl">
          Tutaj tworzysz oferty, opisy produktów, zdjęcia oraz grafiki marketingowe.
          Moduł jest w trakcie budowy — poniżej widzisz planowaną mapę funkcji.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <PlaceholderCard
          href="/sprzedaz/produkty"
          icon={Package}
          accent="bg-emerald-50 text-emerald-700"
          title="Produkty"
          description="Lista produktów i zestawów (bez cen) — klik wiersza otwiera kartę sprzedażową z grafikami i opisem."
        />
        <PlaceholderCard
          href="/sprzedaz/szablony-opisu"
          icon={LayoutTemplate}
          accent="bg-sky-50 text-sky-700"
          title="Szablony opisu"
          description="Definicja struktury opisu — sekcje 2-kolumnowe (Tekst+Tekst, Obraz+Tekst, Tekst+Obraz, Obraz+Obraz). Wybierane na karcie produktu."
        />
        <PlaceholderCard
          href="/sprzedaz/oferty"
          icon={Tag}
          accent="bg-pink-50 text-pink-700"
          title="Oferty"
          description="Tworzenie ofert pod konkretne marketplace'y (Allegro, Amazon, sklep własny)."
          disabled
        />
        <PlaceholderCard
          href="/sprzedaz/zdjecia"
          icon={ImageIcon}
          accent="bg-orange-50 text-orange-700"
          title="Zdjęcia"
          description="Biblioteka, foto produktów, packshoty, lifestyle."
          disabled
        />
        <PlaceholderCard
          href="/grafiki"
          icon={Wand2}
          accent="bg-violet-50 text-violet-700"
          title="Generator grafik"
          description="Auto-generowanie grafik aukcji i kart produktu."
        />
      </div>
    </div>
  );
}

function PlaceholderCard({
  href,
  icon: Icon,
  accent,
  title,
  description,
  disabled,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  title: string;
  description: string;
  disabled?: boolean;
}) {
  const inner = (
    <div
      className={`relative rounded-xl border bg-white p-5 transition-all ${
        disabled
          ? "opacity-60 cursor-not-allowed"
          : "hover:shadow-md hover:border-slate-300"
      }`}
    >
      <div className={`inline-flex p-2 rounded-lg ${accent} mb-3`}>
        <Icon className="size-5" />
      </div>
      <h3 className="font-semibold text-slate-900 mb-1 flex items-center gap-2">
        {title}
        {disabled && (
          <span className="text-[9px] uppercase tracking-wide bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
            wkrótce
          </span>
        )}
      </h3>
      <p className="text-sm text-slate-600 leading-relaxed">{description}</p>
    </div>
  );
  if (disabled) return inner;
  return (
    <Link href={href} className="block">
      {inner}
    </Link>
  );
}
