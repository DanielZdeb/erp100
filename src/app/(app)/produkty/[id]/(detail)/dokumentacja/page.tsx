import { notFound } from "next/navigation";

import { getProductFull } from "../../_lib/fetchers";
import { FilesTab } from "../../files-tab";

export const dynamic = "force-dynamic";

export default async function DokumentacjaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await getProductFull(id);
  if (!product) notFound();

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-heading font-semibold">Dokumentacja</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Pliki dokumentacyjne: certyfikaty, specyfikacje techniczne, instrukcje
          fabryczne, inne dokumenty.
        </p>
      </div>
      <FilesTab
        productId={product.id}
        files={product.files.map((f) => ({
          id: f.id,
          url: f.url,
          filename: f.filename,
          contentType: f.contentType,
          sizeBytes: f.sizeBytes,
          kind: f.kind as "GUIDELINES" | "SPEC" | "CERTIFICATE" | "OTHER",
          createdAt: f.createdAt,
        }))}
      />
    </div>
  );
}
