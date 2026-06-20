"use client";

/**
 * Klient sterujacy widokiem listy produktow w sprzedazy:
 *  - toggle Parametry / Galeria
 *  - dropdown filtra kategorii
 *  - szukajka po nazwie/SKU/EAN
 *  - lightbox w widoku galerii (klik na zdjecie powieksza)
 *
 * Stan widoku/q/cat zapisany w URL searchParams - przeladowuje serwer,
 * pozwala udostepniac linki ze stanem.
 */

import { useState, useEffect, useCallback, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Package,
  Layers,
  LayoutGrid,
  Table as TableIcon,
  X,
  ArrowLeft,
  ArrowRight,
  Search,
  Puzzle,
  Archive,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface ImageItem {
  id: string;
  url: string;
  thumbnailWebpUrl: string | null;
  alt: string | null;
}

interface ProductRow {
  id: string;
  name: string;
  productCode: string;
  eanCode: string | null;
  color: string | null;
  colorCode: string | null;
  weightKg: number | null;
  compositionMode: string;
  isComponent: boolean;
  archived: boolean;
  categoryName: string | null;
  templateName: string | null;
  images: ImageItem[];
}

export function ProductsListClient({
  view,
  q,
  categoryNavSlot,
  shouldLoadProducts,
  totalProductCount,
  type,
  showArchived,
  counts,
  products,
}: {
  view: "params" | "gallery";
  q: string;
  categoryNavSlot: React.ReactNode;
  shouldLoadProducts: boolean;
  totalProductCount: number;
  type: "product" | "component" | "all";
  showArchived: boolean;
  counts: { product: number; component: number; archived: number };
  products: ProductRow[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [searchInput, setSearchInput] = useState(q);

  // Lightbox: ktory produkt + ktory index zdjecia
  const [lightbox, setLightbox] = useState<{
    productId: string;
    imageIndex: number;
  } | null>(null);

  const setQueryParam = useCallback(
    (key: string, value: string | null) => {
      const sp = new URLSearchParams(searchParams.toString());
      if (value == null || value === "") sp.delete(key);
      else sp.set(key, value);
      startTransition(() => {
        router.push(`?${sp.toString()}`);
      });
    },
    [router, searchParams],
  );

  const setView = (next: "params" | "gallery") => setQueryParam("view", next);
  const setType = (next: "product" | "component" | "all") =>
    setQueryParam("type", next === "product" ? null : next);
  const setArchived = (next: boolean) =>
    setQueryParam("archived", next ? "1" : null);
  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setQueryParam("q", searchInput);
  };

  const product = lightbox
    ? products.find((p) => p.id === lightbox.productId)
    : null;
  const currentImage = product?.images[lightbox?.imageIndex ?? 0] ?? null;

  const closeLightbox = useCallback(() => setLightbox(null), []);
  const nextImage = useCallback(() => {
    if (!product) return;
    setLightbox((lb) =>
      lb
        ? { productId: lb.productId, imageIndex: (lb.imageIndex + 1) % product.images.length }
        : null,
    );
  }, [product]);
  const prevImage = useCallback(() => {
    if (!product) return;
    setLightbox((lb) =>
      lb
        ? {
            productId: lb.productId,
            imageIndex:
              (lb.imageIndex - 1 + product.images.length) %
              product.images.length,
          }
        : null,
    );
  }, [product]);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
      else if (e.key === "ArrowRight") nextImage();
      else if (e.key === "ArrowLeft") prevImage();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, closeLightbox, nextImage, prevImage]);

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-4">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="text-[11px] uppercase tracking-wide font-bold text-emerald-700">
            Sprzedaż
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Produkty</h1>
          <p className="text-sm text-slate-600 max-w-2xl">
            Lista produktów i zestawów (bez cen). Przełącz na widok galerii żeby
            zobaczyć wszystkie zdjęcia każdego produktu.
          </p>
        </div>
      </header>

      {/* Typ produktu + archiwum */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="inline-flex p-0.5 rounded-md bg-slate-100 ring-1 ring-slate-200">
          <button
            type="button"
            onClick={() => setType("product")}
            disabled={pending}
            className={cn(
              "px-3 py-1.5 text-xs font-semibold rounded transition-colors flex items-center gap-1.5",
              type === "product"
                ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                : "text-slate-500 hover:text-slate-700",
            )}
          >
            <Package className="size-3.5" />
            Produkty
            <span className="text-[10px] font-mono text-slate-400">
              {counts.product}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setType("component")}
            disabled={pending}
            className={cn(
              "px-3 py-1.5 text-xs font-semibold rounded transition-colors flex items-center gap-1.5",
              type === "component"
                ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                : "text-slate-500 hover:text-slate-700",
            )}
          >
            <Puzzle className="size-3.5" />
            Komponenty
            <span className="text-[10px] font-mono text-slate-400">
              {counts.component}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setType("all")}
            disabled={pending}
            className={cn(
              "px-3 py-1.5 text-xs font-semibold rounded transition-colors flex items-center gap-1.5",
              type === "all"
                ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                : "text-slate-500 hover:text-slate-700",
            )}
          >
            Wszystkie
            <span className="text-[10px] font-mono text-slate-400">
              {counts.product + counts.component}
            </span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => setArchived(!showArchived)}
          disabled={pending}
          className={cn(
            "px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ring-1",
            showArchived
              ? "bg-amber-100 text-amber-900 ring-amber-300"
              : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50",
          )}
          title="Pokaż zarchiwizowane produkty"
        >
          <Archive className="size-3.5" />
          Archiwum
          {counts.archived > 0 && (
            <span className="text-[10px] font-mono opacity-70">
              {counts.archived}
            </span>
          )}
        </button>
      </div>

      {/* Pasek narzędzi: toggle widoku + kategoria + szukajka */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="inline-flex p-0.5 rounded-md bg-slate-100 ring-1 ring-slate-200">
          <button
            type="button"
            onClick={() => setView("params")}
            disabled={pending}
            className={cn(
              "px-3 py-1.5 text-xs font-semibold rounded transition-colors flex items-center gap-1.5",
              view === "params"
                ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                : "text-slate-500 hover:text-slate-700",
            )}
          >
            <TableIcon className="size-3.5" />
            Parametry
          </button>
          <button
            type="button"
            onClick={() => setView("gallery")}
            disabled={pending}
            className={cn(
              "px-3 py-1.5 text-xs font-semibold rounded transition-colors flex items-center gap-1.5",
              view === "gallery"
                ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                : "text-slate-500 hover:text-slate-700",
            )}
          >
            <LayoutGrid className="size-3.5" />
            Galeria
          </button>
        </div>

        <form onSubmit={submitSearch} className="flex gap-2 ml-auto">
          <div className="relative">
            <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Szukaj nazwa / SKU / EAN..."
              className="pl-8 pr-3 py-1.5 text-sm rounded-md ring-1 ring-slate-200 focus:ring-2 focus:ring-emerald-400 outline-none w-64"
            />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="px-3 py-1.5 text-sm rounded-md bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-50"
          >
            Szukaj
          </button>
        </form>
      </div>

      {categoryNavSlot}

      {!shouldLoadProducts ? (
        <div className="rounded-lg ring-1 ring-slate-200 bg-white p-10 text-center text-sm text-slate-500 space-y-2">
          <p className="font-medium text-slate-700">
            Lista nie ładuje się od razu, bo masz {totalProductCount} produktów.
          </p>
          <p className="text-xs">
            Wybierz kategorię w nawigatorze powyżej albo wpisz frazę w
            wyszukiwarce. Kategorie się prefetchują w tle, więc przełączanie
            powinno być natychmiastowe po pierwszym wczytaniu.
          </p>
        </div>
      ) : view === "params" ? (
        <ParamsView products={products} q={q} />
      ) : (
        <GalleryView
          products={products}
          q={q}
          onOpenImage={(productId, imageIndex) =>
            setLightbox({ productId, imageIndex })
          }
        />
      )}

      {shouldLoadProducts && (
        <div className="text-[11px] text-slate-500">
          Razem: <strong>{products.length}</strong> produktów
          {q ? ` pasujących do „${q}"` : ""}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && product && currentImage && (
        <div
          className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={closeLightbox}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              closeLightbox();
            }}
            className="absolute top-4 right-4 size-10 rounded-full bg-white/10 hover:bg-white/20 text-white grid place-items-center"
            title="Esc"
          >
            <X className="size-5" />
          </button>
          {product.images.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  prevImage();
                }}
                className="absolute left-4 top-1/2 -translate-y-1/2 size-12 rounded-full bg-white/10 hover:bg-white/20 text-white grid place-items-center"
              >
                <ArrowLeft className="size-5" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  nextImage();
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 size-12 rounded-full bg-white/10 hover:bg-white/20 text-white grid place-items-center"
              >
                <ArrowRight className="size-5" />
              </button>
            </>
          )}
          <div
            className="relative max-w-[92vw] max-h-[88vh] flex flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={currentImage.url}
              alt={currentImage.alt ?? ""}
              className="max-w-full max-h-[78vh] object-contain rounded ring-1 ring-white/10"
            />
            <div className="text-xs text-white/80 tabular-nums text-center">
              <div className="font-semibold">{product.name}</div>
              <div className="font-mono text-[10px] text-white/60">
                {product.productCode}
              </div>
              <div className="mt-1">
                {(lightbox.imageIndex ?? 0) + 1} / {product.images.length}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ParamsView({ products, q }: { products: ProductRow[]; q: string }) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-600 uppercase tracking-wide text-[10px]">
            <tr>
              <th className="text-left px-3 py-2 w-12">Grafika</th>
              <th className="text-left px-2 py-2">Nazwa</th>
              <th className="text-left px-2 py-2">Kategoria</th>
              <th className="text-left px-2 py-2 font-mono">SKU</th>
              <th className="text-left px-2 py-2 font-mono">EAN</th>
              <th className="text-left px-2 py-2">Kolor + Kod</th>
              <th className="text-right px-2 py-2">Waga</th>
              <th className="text-left px-2 py-2">Szablon opisu</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  Brak produktów {q ? "pasujących do wyszukiwania" : ""}.
                </td>
              </tr>
            ) : (
              products.map((p) => (
                <tr
                  key={p.id}
                  className="border-t border-slate-100 hover:bg-emerald-50/30 transition-colors"
                >
                  <td className="px-3 py-2 align-middle">
                    <Link
                      href={`/sprzedaz/produkty/${p.id}`}
                      className="block"
                    >
                      {p.images[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.images[0].thumbnailWebpUrl ?? p.images[0].url}
                          alt={p.images[0].alt ?? p.name}
                          width={36}
                          height={36}
                          loading="lazy"
                          className="size-9 rounded object-cover ring-1 ring-slate-200"
                        />
                      ) : (
                        <div className="size-9 rounded bg-muted ring-1 ring-slate-200 grid place-items-center">
                          <Package className="size-4 text-slate-300" />
                        </div>
                      )}
                    </Link>
                  </td>
                  <td className="px-2 py-2 align-middle">
                    <Link
                      href={`/sprzedaz/produkty/${p.id}`}
                      className="font-medium hover:underline"
                    >
                      {p.name}
                    </Link>
                    {p.compositionMode === "ZESTAW" && (
                      <span className="ml-1.5 inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded bg-violet-100 text-violet-700 font-semibold">
                        <Layers className="size-2.5" /> ZESTAW
                      </span>
                    )}
                    {p.isComponent && (
                      <span className="ml-1.5 inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded bg-cyan-100 text-cyan-700 font-semibold">
                        KOMPONENT
                      </span>
                    )}
                    {p.archived && (
                      <span className="ml-1.5 inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold">
                        ARCHIWUM
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 align-middle text-slate-600">
                    {p.categoryName ?? "—"}
                  </td>
                  <td className="px-2 py-2 align-middle font-mono text-slate-700">
                    {p.productCode}
                  </td>
                  <td className="px-2 py-2 align-middle font-mono text-slate-700">
                    {p.eanCode ?? "—"}
                  </td>
                  <td className="px-2 py-2 align-middle">
                    <div className="flex flex-col leading-tight">
                      <span className="text-slate-700">{p.color ?? "—"}</span>
                      {p.colorCode ? (
                        <span className="text-[9px] font-mono text-slate-500">
                          {p.colorCode}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-2 py-2 align-middle text-right tabular-nums">
                    {p.weightKg != null ? `${p.weightKg.toFixed(2)} kg` : "—"}
                  </td>
                  <td className="px-2 py-2 align-middle">
                    {p.templateName ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-semibold">
                        {p.templateName}
                      </span>
                    ) : (
                      <span className="text-slate-400 text-[10px]">brak</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function GalleryView({
  products,
  q,
  onOpenImage,
}: {
  products: ProductRow[];
  q: string;
  onOpenImage: (productId: string, imageIndex: number) => void;
}) {
  if (products.length === 0) {
    return (
      <Card className="p-10 text-center text-sm text-slate-500">
        Brak produktów {q ? "pasujących do wyszukiwania" : ""}.
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {products.map((p) => (
        <Card key={p.id} className="p-4 space-y-3">
          {/* Header: nazwa + SKU + kategoria + akcje */}
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Link
                  href={`/sprzedaz/produkty/${p.id}`}
                  className="font-semibold hover:underline text-base"
                >
                  {p.name}
                </Link>
                {p.compositionMode === "ZESTAW" && (
                  <span className="inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded bg-violet-100 text-violet-700 font-semibold">
                    <Layers className="size-2.5" /> ZESTAW
                  </span>
                )}
                {p.templateName && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-semibold">
                    {p.templateName}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-500 mt-0.5">
                <span className="font-mono">{p.productCode}</span>
                {p.eanCode && (
                  <>
                    <span>·</span>
                    <span className="font-mono">EAN {p.eanCode}</span>
                  </>
                )}
                {p.categoryName && (
                  <>
                    <span>·</span>
                    <span>{p.categoryName}</span>
                  </>
                )}
                {p.color && (
                  <>
                    <span>·</span>
                    <span>
                      {p.color}
                      {p.colorCode && (
                        <span className="font-mono ml-1">({p.colorCode})</span>
                      )}
                    </span>
                  </>
                )}
              </div>
            </div>
            <Link
              href={`/sprzedaz/produkty/${p.id}`}
              className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ring-1 ring-slate-200 hover:bg-slate-50 text-slate-700"
            >
              Otwórz kartę
            </Link>
          </div>

          {/* Galeria zdjęć */}
          {p.images.length === 0 ? (
            <div className="rounded-lg ring-1 ring-dashed ring-slate-300 p-6 text-center text-xs text-slate-500">
              Brak grafik — dodaj na karcie sprzedażowej.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {p.images.map((img, idx) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => onOpenImage(p.id, idx)}
                  className="group relative aspect-square rounded ring-1 ring-slate-200 overflow-hidden bg-slate-50 hover:ring-2 hover:ring-emerald-400 transition-all"
                  title="Klik = powiększ"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.thumbnailWebpUrl ?? img.url}
                    alt={img.alt ?? p.name}
                    className="size-full object-cover transition-transform group-hover:scale-105"
                  />
                </button>
              ))}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
