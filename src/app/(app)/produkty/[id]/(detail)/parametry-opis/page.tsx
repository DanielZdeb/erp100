import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  ExternalLink,
  Factory,
  Image as ImageIcon,
  Pencil,
  Ruler,
  Settings2,
  Store,
  Tag,
  Warehouse as WarehouseIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { getProductFull } from "../../_lib/fetchers";
import { LabelTab } from "../../label-tab";

export const dynamic = "force-dynamic";

export default async function ParametryOpisPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await getProductFull(id);
  if (!product) notFound();

  const primaryImage =
    product.images.find((i) => i.isPrimary) ?? product.images[0] ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-heading font-semibold">
          Parametry i opis
        </h2>
        <Link
          href={`/produkty/${product.id}/edytuj`}
          className="inline-flex items-center gap-1.5 text-xs border rounded-md px-2.5 py-1.5 hover:bg-muted"
        >
          <Pencil className="size-3.5" />
          Edytuj
        </Link>
      </div>

      {/* Wymiary produktu + Zdjęcie główne (side by side) */}
      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4">
        <Card className="overflow-hidden">
          <CardHeader className="py-2 border-b">
            <CardTitle className="text-xs flex items-center gap-2 text-muted-foreground uppercase tracking-wide">
              <ImageIcon className="size-3.5" />
              Zdjęcie główne
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {primaryImage ? (
              <div className="relative aspect-square bg-muted">
                <Image
                  src={primaryImage.url}
                  alt={primaryImage.alt ?? product.name}
                  fill
                  sizes="260px"
                  className="object-cover"
                  unoptimized
                />
              </div>
            ) : (
              <div className="aspect-square bg-muted flex items-center justify-center text-xs text-muted-foreground">
                Brak zdjęcia
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-l-4 border-l-slate-400">
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <div className="size-7 rounded-md bg-slate-100 text-slate-700 flex items-center justify-center">
                <Ruler className="size-3.5" />
              </div>
              Wymiary produktu
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Definitions
              items={[
                ["Szerokość", fmt(product.widthCm, "cm")],
                ["Wysokość", fmt(product.heightCm, "cm")],
                ["Głębokość", fmt(product.depthCm, "cm")],
                ["EAN", product.eanCode ?? "—"],
                ["Kolor", product.color ?? "—"],
              ]}
            />
          </CardContent>
        </Card>
      </div>

      {/* Parametry techniczne — pokazujemy tylko gdy ktoś coś wpisał */}
      {(product.loadCapacityKg != null ||
        product.profileSize ||
        product.shape ||
        product.baseShape ||
        product.purposeText) && (
        <Card className="overflow-hidden border-l-4 border-l-cyan-400">
          <CardHeader className="py-3 border-b">
            <CardTitle className="text-sm flex items-center gap-2">
              <div className="size-7 rounded-md bg-cyan-100 text-cyan-700 flex items-center justify-center">
                <Settings2 className="size-3.5" />
              </div>
              Parametry produktu
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <Definitions
              items={[
                ["Udźwig", fmt(product.loadCapacityKg ?? null, "kg")],
                ["Profil", product.profileSize ?? "—"],
                ["Kształt", product.shape ?? "—"],
                ["Podstawa", product.baseShape ?? "—"],
                ["Przeznaczenie", product.purposeText ?? "—"],
              ]}
            />
          </CardContent>
        </Card>
      )}

      {/* Sklep i integracja */}
      {(product.producer ||
        product.unit ||
        product.warrantyName ||
        product.storeUrl ||
        product.iaiId) && (
        <Card className="overflow-hidden border-l-4 border-l-rose-400">
          <CardHeader className="py-3 border-b">
            <CardTitle className="text-sm flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <div className="size-7 rounded-md bg-rose-100 text-rose-700 flex items-center justify-center">
                  <Store className="size-3.5" />
                </div>
                Sklep i integracja
              </span>
              {product.storeUrl && (
                <a
                  href={product.storeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline shrink-0"
                >
                  Otwórz w sklepie
                  <ExternalLink className="size-3" />
                </a>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <Definitions
              items={[
                ["Producent", product.producer ?? "—"],
                ["Jednostka", product.unit ?? "szt"],
                [
                  "Stawka VAT",
                  product.vatRatePct != null
                    ? `${product.vatRatePct.toFixed(1)} %`
                    : "—",
                ],
                ["Gwarancja", product.warrantyName ?? "—"],
                [
                  "Okres gwarancji",
                  product.warrantyMonths != null
                    ? `${product.warrantyMonths} mies.`
                    : "—",
                ],
                [
                  "Typ gwarancji",
                  product.warrantyType === "producer"
                    ? "Producent"
                    : product.warrantyType === "seller"
                      ? "Sprzedawca"
                      : product.warrantyType ?? "—",
                ],
                ["IAI Shop ID", product.iaiId ?? "—"],
                ["IAI grupa wariantów", product.iaiGroupId ?? "—"],
              ]}
            />
            {product.shortDescription && (
              <div className="mt-4 pt-3 border-t">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                  Krótki opis
                </div>
                <p className="text-sm leading-snug">
                  {product.shortDescription}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stany magazynowe */}
      {product.stocks && product.stocks.length > 0 && (
        <Card className="overflow-hidden border-l-4 border-l-teal-400">
          <CardHeader className="py-3 border-b">
            <CardTitle className="text-sm flex items-center gap-2">
              <div className="size-7 rounded-md bg-teal-100 text-teal-700 flex items-center justify-center">
                <WarehouseIcon className="size-3.5" />
              </div>
              Stany magazynowe
              <span className="text-xs text-muted-foreground tabular-nums font-normal">
                ({product.stocks.length}{" "}
                {product.stocks.length === 1
                  ? "magazyn"
                  : product.stocks.length < 5
                    ? "magazyny"
                    : "magazynów"}
                )
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-wide text-muted-foreground border-b">
                <tr>
                  <th className="text-left py-1.5 pr-2">Magazyn</th>
                  <th className="text-right py-1.5 px-2">Ewidencja</th>
                  <th className="text-right py-1.5 px-2">Dostępne</th>
                  <th className="text-right py-1.5 pl-2 w-[1%]">Aktualizacja</th>
                </tr>
              </thead>
              <tbody>
                {[...product.stocks]
                  .sort(
                    (a, b) =>
                      (a.warehouse.sortOrder ?? 0) -
                        (b.warehouse.sortOrder ?? 0) ||
                      a.warehouse.name.localeCompare(b.warehouse.name),
                  )
                  .map((s) => (
                    <tr key={s.id} className="border-b last:border-b-0">
                      <td className="py-1.5 pr-2">
                        <div className="flex items-center gap-2">
                          <Factory className="size-3 text-muted-foreground" />
                          <span className="font-medium">
                            {s.warehouse.name}
                          </span>
                          {s.warehouse.externalId && (
                            <code className="text-[9px] text-muted-foreground">
                              #{s.warehouse.externalId}
                            </code>
                          )}
                        </div>
                      </td>
                      <td className="text-right tabular-nums py-1.5 px-2">
                        {s.quantity.toLocaleString("pl-PL", {
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td
                        className={cn(
                          "text-right tabular-nums py-1.5 px-2 font-medium",
                          s.availableQuantity > 0
                            ? "text-emerald-700"
                            : "text-muted-foreground",
                        )}
                      >
                        {s.availableQuantity.toLocaleString("pl-PL", {
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="text-right tabular-nums py-1.5 pl-2 text-[10px] text-muted-foreground whitespace-nowrap">
                        {new Date(s.updatedAt).toLocaleDateString("pl-PL")}
                      </td>
                    </tr>
                  ))}
              </tbody>
              <tfoot className="border-t-2">
                <tr className="text-xs font-semibold">
                  <td className="py-1.5 pr-2">Razem</td>
                  <td className="text-right tabular-nums py-1.5 px-2">
                    {product.stocks
                      .reduce((acc, s) => acc + s.quantity, 0)
                      .toLocaleString("pl-PL", { maximumFractionDigits: 2 })}
                  </td>
                  <td className="text-right tabular-nums py-1.5 px-2 text-emerald-700">
                    {product.stocks
                      .reduce((acc, s) => acc + s.availableQuantity, 0)
                      .toLocaleString("pl-PL", { maximumFractionDigits: 2 })}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Etykieta / barcode */}
      <Card className="overflow-hidden border-l-4 border-l-violet-400">
        <CardHeader className="py-3 border-b">
          <CardTitle className="text-sm flex items-center gap-2">
            <div className="size-7 rounded-md bg-violet-100 text-violet-700 flex items-center justify-center">
              <Tag className="size-3.5" />
            </div>
            Etykieta / barcode
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <LabelTab
            name={product.name}
            productCode={product.productCode}
            eanCode={product.eanCode}
            code128={product.code128}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function Definitions({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="tabular-nums truncate">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function fmt(n: number | null | undefined, unit: string): string {
  if (n == null) return "—";
  return `${n} ${unit}`;
}
