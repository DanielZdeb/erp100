import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Wand2 } from "lucide-react";

import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";

import { TemplateEditor } from "./_components/template-editor";

export const dynamic = "force-dynamic";

export default async function TemplateEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const companyId = await getCurrentCompanyId();

  const template = await db.productPhotoTemplate.findFirst({
    where: { id, companyId },
    include: {
      shots: {
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!template) notFound();

  return (
    <div className="p-6 space-y-4">
      <Link
        href="/grafiki"
        className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1"
      >
        <ArrowLeft className="size-3" />
        Generator grafik
      </Link>
      <h1 className="text-2xl font-heading font-bold tracking-tight inline-flex items-center gap-2">
        <Wand2 className="size-6 text-violet-600" />
        {template.name}
      </h1>

      <TemplateEditor
        template={{
          id: template.id,
          name: template.name,
          globalPrompt: template.globalPrompt,
          logoPlacementRule: template.logoPlacementRule,
          referenceImages: template.referenceImages,
          aspectRatio: template.aspectRatio,
          defaultQuality: template.defaultQuality,
        }}
        shots={template.shots.map((s) => ({
          id: s.id,
          name: s.name,
          iconName: s.iconName,
          shotPrompt: s.shotPrompt,
          sortOrder: s.sortOrder,
          isPreset: s.isPreset,
        }))}
      />
    </div>
  );
}
