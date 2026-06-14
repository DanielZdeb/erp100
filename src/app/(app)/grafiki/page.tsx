import Link from "next/link";
import { Image as ImageIcon, Wand2 } from "lucide-react";

import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { NewTemplateButton } from "./_components/new-template-button";
import { NewBatchButton } from "./_components/new-batch-button";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Czeka", cls: "bg-slate-100 text-slate-700" },
  RUNNING: { label: "Generuje…", cls: "bg-indigo-100 text-indigo-700" },
  COMPLETED: { label: "Gotowe", cls: "bg-emerald-100 text-emerald-700" },
  PARTIAL: { label: "Częściowo", cls: "bg-amber-100 text-amber-700" },
  FAILED: { label: "Błąd", cls: "bg-rose-100 text-rose-700" },
};

export default async function GrafikiPage() {
  const companyId = await getCurrentCompanyId();

  const [templates, batches] = await Promise.all([
    db.productPhotoTemplate.findMany({
      where: { companyId, archived: false },
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        aspectRatio: true,
        defaultQuality: true,
        _count: { select: { shots: true, batches: true } },
      },
    }),
    db.productPhotoBatch.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        name: true,
        status: true,
        quality: true,
        totalImages: true,
        generatedImages: true,
        failedImages: true,
        estimatedCostUsd: true,
        createdAt: true,
        completedAt: true,
        template: { select: { name: true } },
      },
    }),
  ]);

  const apiKeySet = !!process.env.GEMINI_API_KEY;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold tracking-tight inline-flex items-center gap-2">
            <Wand2 className="size-7 text-violet-600" />
            Generator grafik produktowych
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Twórz spójne grafiki produktowe na białym tle, z postacią, w
            realnym użytkowaniu — masowo, jednym kliknięciem, przez Imagen
            (Nano Banana). Najpierw zdefiniuj{" "}
            <strong>Template</strong> (styl + zestaw rzutów), potem stwórz{" "}
            <strong>Batch</strong> (wybrane produkty × rzuty).
          </p>
          {!apiKeySet && (
            <p className="text-xs text-amber-700 bg-amber-50 ring-1 ring-amber-200 rounded px-2.5 py-1.5 mt-3 inline-flex items-center gap-1.5 max-w-xl">
              ⚠️ <strong>GEMINI_API_KEY</strong> nie ustawione. Generowanie
              działa w trybie <em>mock</em> (kolorowe placeholdery zamiast
              prawdziwych zdjęć). Klucz dostaniesz na{" "}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noopener"
                className="underline"
              >
                aistudio.google.com/apikey
              </a>{" "}
              i wklejasz do <code>.env</code>.
            </p>
          )}
        </div>
      </div>

      {/* TEMPLATE'Y */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-heading font-bold uppercase tracking-wider text-slate-700">
            Templates ({templates.length})
          </h2>
          <NewTemplateButton />
        </div>
        {templates.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Brak templates. Stwórz pierwszy — wybierz styl, zestaw rzutów i
              możesz generować.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {templates.map((t) => (
              <Link
                key={t.id}
                href={`/grafiki/template/${t.id}`}
                className="block"
              >
                <Card className="p-4 hover:ring-2 hover:ring-violet-300 transition-all">
                  <div className="font-medium text-sm flex items-center gap-2">
                    <ImageIcon className="size-3.5 text-violet-600" />
                    {t.name}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1.5 flex items-center gap-3">
                    <span>📐 {t.aspectRatio}</span>
                    <span>🎯 {t.defaultQuality}</span>
                    <span>🎬 {t._count.shots} rzutów</span>
                    <span>🚀 {t._count.batches} kampanii</span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* BATCHE */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-heading font-bold uppercase tracking-wider text-slate-700">
            Ostatnie kampanie ({batches.length})
          </h2>
          {templates.length > 0 && (
            <NewBatchButton
              templates={templates.map((t) => ({ id: t.id, name: t.name }))}
            />
          )}
        </div>
        {batches.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Brak kampanii. Najpierw stwórz template, potem kliknij „Nowa
              kampania".
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {batches.map((b) => {
              const st = STATUS_LABEL[b.status] ?? STATUS_LABEL.PENDING;
              const progress =
                b.totalImages > 0
                  ? Math.round(
                      ((b.generatedImages + b.failedImages) / b.totalImages) *
                        100,
                    )
                  : 0;
              return (
                <Link
                  key={b.id}
                  href={`/grafiki/batch/${b.id}`}
                  className="block"
                >
                  <Card className="p-3 hover:ring-2 hover:ring-violet-300 transition-all">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">
                          {b.name}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {b.template.name} · {b.quality} ·{" "}
                          {b.generatedImages}/{b.totalImages} obrazów
                          {b.failedImages > 0 && (
                            <span className="text-rose-600 ml-1">
                              ({b.failedImages} błędów)
                            </span>
                          )}
                          {b.estimatedCostUsd != null && (
                            <span className="ml-1">
                              · ${b.estimatedCostUsd.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>
                      {b.status === "RUNNING" && b.totalImages > 0 && (
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-indigo-500 transition-all"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-muted-foreground tabular-nums">
                            {progress}%
                          </span>
                        </div>
                      )}
                      <span
                        className={cn(
                          "text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded",
                          st.cls,
                        )}
                      >
                        {st.label}
                      </span>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </section>

    </div>
  );
}
