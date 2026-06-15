/**
 * Lista szablonów opisu sprzedażowego.
 *
 * Każdy szablon to zestaw sekcji (2-kolumnowych) — używany do tworzenia
 * jednolitego opisu na karcie produktu w `/sprzedaz/produkty/[id]`.
 *
 * Edycja per szablon: `/sprzedaz/szablony-opisu/[id]`.
 */
import Link from "next/link";
import { FileText, Plus } from "lucide-react";

import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";
import { Card } from "@/components/ui/card";
import { NewDescriptionTemplateButton } from "./_components/new-template-button";

export const dynamic = "force-dynamic";

export default async function SzablonyOpisuPage() {
  const companyId = await getCurrentCompanyId();
  const templates = await db.descriptionTemplate.findMany({
    where: { companyId, archived: false },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      updatedAt: true,
      _count: {
        select: {
          sections: true,
          products: { where: { archived: false } },
        },
      },
    },
  });

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="text-[11px] uppercase tracking-wide font-bold text-emerald-700">
            Sprzedaż → Szablony opisu
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Szablony opisu</h1>
          <p className="text-sm text-slate-600 max-w-2xl">
            Definiują strukturę karty produktu sprzedażowej — sekcje z 2 slotami
            (lewy + prawy, tekst lub obraz). Wybierany przy produkcie, treści
            wypełniane per produkt.
          </p>
        </div>
        <NewDescriptionTemplateButton />
      </header>

      {templates.length === 0 ? (
        <Card className="p-10 text-center space-y-2">
          <FileText className="size-12 text-slate-300 mx-auto" />
          <h3 className="font-semibold text-sm">Brak szablonów</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Stwórz pierwszy szablon — np. „Standard szarfa 6m" — i dodaj do
            niego sekcje („Hero front", „Wymiary", „Galeria"...). Potem przy
            produkcie wybierzesz szablon i wypełnisz konkretne treści.
          </p>
          <div className="pt-2">
            <NewDescriptionTemplateButton />
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {templates.map((t) => (
            <Link
              key={t.id}
              href={`/sprzedaz/szablony-opisu/${t.id}`}
              className="block"
            >
              <Card className="p-4 hover:ring-2 hover:ring-emerald-300 transition-all cursor-pointer h-full">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <FileText className="size-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span className="text-[10px] text-slate-400">
                    {t.updatedAt.toLocaleDateString("pl-PL")}
                  </span>
                </div>
                <h3 className="font-semibold text-sm leading-tight mb-2">
                  {t.name}
                </h3>
                <div className="flex gap-2 text-[10px] text-slate-500">
                  <span>{t._count.sections} sekcji</span>
                  <span>·</span>
                  <span>{t._count.products} produktów</span>
                </div>
              </Card>
            </Link>
          ))}
          <Card className="p-4 border-dashed flex items-center justify-center min-h-[120px]">
            <NewDescriptionTemplateButton variant="minimal" />
          </Card>
        </div>
      )}
    </div>
  );
}
