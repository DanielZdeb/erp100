import Link from "next/link";
import { ArrowLeft, Scissors } from "lucide-react";

import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";

import { TemplateSectionsEditor } from "./template-sections-editor";
import { DefaultRatesForm } from "./default-rates-form";

export const dynamic = "force-dynamic";

export default async function SzablonyZamowienPage() {
  const companyId = await getCurrentCompanyId();
  const [sections, company] = await Promise.all([
    db.orderTemplateSection.findMany({
      where: { companyId, kind: "MATERIAL_SZARFY" },
      orderBy: { sortOrder: "asc" },
      include: { images: { orderBy: { sortOrder: "asc" } } },
    }),
    db.company.findUnique({
      where: { id: companyId },
      select: {
        defaultKrojeniePerSztPln: true,
        defaultSzwalniaPerSztPln: true,
      },
    }),
  ]);

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <Link
          href="/ustawienia"
          className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1"
        >
          <ArrowLeft className="size-3" />
          Ustawienia
        </Link>
        <h1 className="text-3xl font-heading font-bold tracking-tight mt-1 inline-flex items-center gap-2">
          <Scissors className="size-7 text-cyan-600" />
          Szablony wytycznych — Materiał na szarfy
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Te sekcje będą AUTOMATYCZNIE kopiowane do każdego nowego zamówienia
          „Materiał na szarfy" (rolety/szarfy z Polski). Edycja szablonu NIE
          zmienia już utworzonych zamówień — kopiujemy raz, przy tworzeniu.
        </p>
      </div>

      <DefaultRatesForm
        initialKrojenie={company?.defaultKrojeniePerSztPln ?? null}
        initialSzwalnia={company?.defaultSzwalniaPerSztPln ?? null}
      />

      <div className="space-y-4">
        <section>
          <h2 className="text-lg font-semibold mb-2 inline-flex items-center gap-2 px-2 py-1 rounded bg-amber-100 text-amber-900">
            Zamówienie Fabryka (sekcje)
          </h2>
          <TemplateSectionsEditor
            kind="MATERIAL_SZARFY"
            target="FABRYKA"
            initialSections={sections
              .filter((s) => s.target === "FABRYKA")
              .map((s) => ({
                id: s.id,
                title: s.title,
                content: s.content ?? null,
                sortOrder: s.sortOrder,
                images: s.images.map((i) => ({
                  id: i.id,
                  url: i.url,
                  alt: i.alt ?? null,
                  sortOrder: i.sortOrder,
                })),
              }))}
          />
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2 inline-flex items-center gap-2 px-2 py-1 rounded bg-indigo-100 text-indigo-900">
            Zamówienie Szwalnia (sekcje)
          </h2>
          <TemplateSectionsEditor
            kind="MATERIAL_SZARFY"
            target="KRAJALNIA"
            initialSections={sections
              .filter((s) => s.target === "KRAJALNIA")
              .map((s) => ({
                id: s.id,
                title: s.title,
                content: s.content ?? null,
                sortOrder: s.sortOrder,
                images: s.images.map((i) => ({
                  id: i.id,
                  url: i.url,
                  alt: i.alt ?? null,
                  sortOrder: i.sortOrder,
                })),
              }))}
          />
        </section>
      </div>
    </div>
  );
}
