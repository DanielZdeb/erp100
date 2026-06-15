/**
 * Edytor pojedynczego szablonu opisu.
 *
 *  - Zmiana nazwy szablonu (inline)
 *  - Lista sekcji + ich preview layoutu
 *  - Dodawanie / edycja / usuwanie sekcji
 *  - Zmiana kolejności drag&drop (TODO — na razie buttonami)
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";
import { TemplateEditor } from "./_components/template-editor";

export const dynamic = "force-dynamic";

export default async function SzablonOpisuEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const companyId = await getCurrentCompanyId();
  const template = await db.descriptionTemplate.findFirst({
    where: { id, companyId },
    include: {
      sections: {
        orderBy: { sortOrder: "asc" },
      },
      _count: {
        select: { products: { where: { archived: false } } },
      },
    },
  });
  if (!template) notFound();

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-center gap-2 text-xs">
        <Link
          href="/sprzedaz/szablony-opisu"
          className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="size-3.5" />
          Wszystkie szablony
        </Link>
      </div>

      <TemplateEditor
        templateId={template.id}
        initialName={template.name}
        usedByCount={template._count.products}
        initialSections={template.sections.map((s) => ({
          id: s.id,
          name: s.name,
          layout: s.layout,
          sortOrder: s.sortOrder,
          leftHint: s.leftHint,
          rightHint: s.rightHint,
          leftImagePrompt: s.leftImagePrompt,
          rightImagePrompt: s.rightImagePrompt,
          leftTextPrompt: s.leftTextPrompt,
          rightTextPrompt: s.rightTextPrompt,
        }))}
      />
    </div>
  );
}
