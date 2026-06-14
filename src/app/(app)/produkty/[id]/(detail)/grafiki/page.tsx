import { notFound } from "next/navigation";

import { getProductFull } from "../../_lib/fetchers";
import { ImagesTab } from "../../images-tab";
import { EditableTextarea } from "../../_components/editable-textarea";

export const dynamic = "force-dynamic";

export default async function GrafikiPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await getProductFull(id);
  if (!product) notFound();

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h2 className="text-lg font-heading font-semibold">
            Grafiki produktowe
          </h2>
          <span className="text-xs text-muted-foreground tabular-nums">
            {product.images.length} zdjęć
          </span>
        </div>
        <ImagesTab productId={product.id} images={product.images} />
      </section>

      <section className="space-y-3 pt-2 border-t">
        <h2 className="text-lg font-heading font-semibold">Opis sklepu</h2>
        <p className="text-xs text-muted-foreground">
          Treść wyświetlana w sklepie / na karcie produktu Allegro. Zmiany
          zapisują się automatycznie.
        </p>
        <EditableTextarea
          productId={product.id}
          field="shopDescription"
          initialValue={product.shopDescription}
          placeholder="Opis produktu (Markdown obsługiwany w wybranych kanałach)…"
          rows={10}
        />
      </section>

      <section className="space-y-3 pt-2 border-t">
        <h2 className="text-lg font-heading font-semibold">
          Notatki wewnętrzne
        </h2>
        <p className="text-xs text-muted-foreground">
          Tylko dla zespołu — nie wyświetlane na zewnątrz.
        </p>
        <EditableTextarea
          productId={product.id}
          field="internalNotes"
          initialValue={product.internalNotes}
          placeholder="Notatki wewnętrzne…"
          rows={4}
        />
      </section>
    </div>
  );
}
