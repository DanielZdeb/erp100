"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Box, FolderTree, Layers, Package, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { removeBoxFromProductAction } from "@/server/shipping-boxes";

import type {
  CategoryRule,
  ProductRule,
} from "./box-auto-assign-dialog";
import {
  AttachProductDialog,
  type AttachProduct,
} from "./attach-product-dialog";

type PinnedProduct = {
  /** ID encji ProductShippingBox — używane do detach-u. */
  linkId: string;
  id: string;
  name: string;
  productCode: string;
};

/**
 * Komórka „Przypisania" pokazuje:
 *  • Badge per reguła kategorii (z poziomem: główna / podkat. / typ)
 *  • Badge per reguła produktowa
 *  • Łączną liczbę pinniętych produktów
 * Hover otwiera popover z pełną listą kategorii + produktów.
 */
export function BoxAssignmentsPopover({
  boxId,
  boxName,
  boxIsCollective,
  boxOriginIsChina,
  categoryRules,
  productRules,
  pinnedProducts,
  allProducts,
}: {
  boxId: string;
  boxName: string;
  boxIsCollective: boolean;
  boxOriginIsChina: boolean;
  categoryRules: CategoryRule[];
  productRules: ProductRule[];
  pinnedProducts: PinnedProduct[];
  allProducts: AttachProduct[];
}) {
  const [attachOpen, setAttachOpen] = useState(false);
  const pinnedProductIds = new Set(pinnedProducts.map((p) => p.id));
  const hasRules = categoryRules.length + productRules.length > 0;
  // Łączny licznik UNIQUE produktów powiązanych z pudełkiem — łączymy pinniętych
  // (ProductShippingBox direct attach) i productRules (auto-przypisania) wg
  // ID, żeby ten sam produkt nie był liczony dwa razy. Wcześniej licznik
  // pokazywał tylko pinniętych — brakowało produktów dopinanych tylko regułą.
  const uniqueProductIds = new Set<string>([
    ...pinnedProducts.map((p) => p.id),
    ...productRules.map((r) => r.productId),
  ]);
  const totalProducts = uniqueProductIds.size;
  const totalPinned = pinnedProducts.length;

  // Brak reguł i pinów — pokaż „brak" + button „Przypnij" żeby user mógł od
  // razu dodać pierwsze produkty (skoro nie ma popovera do otwierania).
  if (!hasRules && totalPinned === 0) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="text-xs text-muted-foreground italic">brak</span>
        <button
          type="button"
          onClick={() => setAttachOpen(true)}
          className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-800 ring-1 ring-sky-200 hover:bg-sky-100 transition-colors"
          aria-label="Przypnij produkt do tego pudełka"
        >
          <Plus className="size-2.5" />
          przypnij
        </button>
        <AttachProductDialog
          open={attachOpen}
          onOpenChange={setAttachOpen}
          boxId={boxId}
          boxName={boxName}
          boxIsCollective={boxIsCollective}
          boxOriginIsChina={boxOriginIsChina}
          allProducts={allProducts}
          pinnedProductIds={pinnedProductIds}
        />
      </span>
    );
  }

  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger
        openOnHover
        delay={150}
        nativeButton={false}
        render={
          <span
            className="inline-flex items-center gap-1.5 cursor-help"
            tabIndex={0}
          >
            {/* Inline badges — kategorie (max 2) */}
            {categoryRules.slice(0, 2).map((r) => (
              <CategoryChip
                key={r.id}
                name={r.categoryName}
                level={r.categoryLevel}
              />
            ))}
            {categoryRules.length > 2 && (
              <span className="text-[10px] text-muted-foreground tabular-nums">
                +{categoryRules.length - 2}
              </span>
            )}
            {/* Łączny licznik UNIQUE produktów (pinnięte + auto przez reguły) */}
            {totalProducts > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-800 ring-1 ring-sky-200 underline decoration-dotted decoration-sky-400/40 underline-offset-2 tabular-nums">
                <Package className="size-2.5" />
                {totalProducts}{" "}
                {totalProducts === 1
                  ? "produkt"
                  : totalProducts < 5
                    ? "produkty"
                    : "produktów"}
              </span>
            )}
          </span>
        }
      />
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          align="start"
          side="bottom"
          sideOffset={6}
          className="isolate z-50"
        >
          <PopoverPrimitive.Popup className="rounded-lg bg-popover p-3 text-xs text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-hidden min-w-[320px] max-w-[440px]">
            {categoryRules.length > 0 && (
              <section className="space-y-1.5">
                <header className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
                  <FolderTree className="size-3" />
                  Kategorie ({categoryRules.length})
                </header>
                <ul className="space-y-1">
                  {categoryRules.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center gap-2 px-2 py-1 rounded-md bg-violet-50/60"
                    >
                      <CategoryChip
                        name={r.categoryName}
                        level={r.categoryLevel}
                      />
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {r.purpose === "SHIPPING" ? "Wysyłkowe" : "Z Chin"} ·{" "}
                        {r.unitsPerBox} szt./box
                        {r.isPrimary ? " · primary" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {productRules.length > 0 && (
              <section
                className={cn(
                  "space-y-1.5",
                  categoryRules.length > 0 && "mt-3 pt-3 border-t",
                )}
              >
                <header className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
                  <Package className="size-3" />
                  Reguły produktowe ({productRules.length})
                </header>
                <ul className="space-y-1">
                  {productRules.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center gap-2 px-2 py-1 rounded-md bg-sky-50/60"
                    >
                      <Link
                        href={`/produkty/${r.productId}`}
                        className="flex-1 min-w-0 hover:underline"
                      >
                        <div className="text-xs font-medium truncate">
                          {r.productName}
                        </div>
                        <div className="text-[10px] text-muted-foreground tabular-nums">
                          {r.productCode}
                        </div>
                      </Link>
                      <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                        {r.purpose === "SHIPPING" ? "Wysyłkowe" : "Z Chin"} ·{" "}
                        {r.unitsPerBox}
                        {r.isPrimary ? " · primary" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section
              className={cn(
                "space-y-1.5",
                (categoryRules.length > 0 || productRules.length > 0) &&
                  "mt-3 pt-3 border-t",
              )}
            >
              <header className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
                <Box className="size-3" />
                Aktualnie przypięte produkty ({pinnedProducts.length})
                <button
                  type="button"
                  onClick={() => setAttachOpen(true)}
                  className="ml-auto inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-sky-100 text-sky-800 ring-1 ring-sky-300 hover:bg-sky-200 transition-colors normal-case tracking-normal font-medium"
                >
                  <Plus className="size-2.5" />
                  Przypnij produkt
                </button>
              </header>
              {pinnedProducts.length === 0 ? (
                <p className="text-[10px] text-muted-foreground italic px-1">
                  Brak — żaden produkt nie ma jeszcze pinu na to pudełko.
                </p>
              ) : (
                <>
                  <p className="text-[9px] text-muted-foreground italic px-1 -mt-1">
                    Klik na ikonę „×" przy produkcie odpina pudełko od produktu.
                  </p>
                  <ul className="max-h-[200px] overflow-y-auto space-y-0.5">
                    {pinnedProducts.map((p) => (
                      <PinnedProductRow key={p.id} pinned={p} />
                    ))}
                  </ul>
                </>
              )}
            </section>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
      <AttachProductDialog
        open={attachOpen}
        onOpenChange={setAttachOpen}
        boxId={boxId}
        boxName={boxName}
        boxIsCollective={boxIsCollective}
        boxOriginIsChina={boxOriginIsChina}
        allProducts={allProducts}
        pinnedProductIds={pinnedProductIds}
      />
    </PopoverPrimitive.Root>
  );
}

function PinnedProductRow({ pinned }: { pinned: PinnedProduct }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function detach() {
    if (!confirm(`Odpiąć pudełko od produktu „${pinned.name}"?`)) return;
    startTransition(async () => {
      try {
        await removeBoxFromProductAction(pinned.linkId);
        toast.success("Odpięto produkt");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <li className="flex items-baseline justify-between gap-2 px-2 py-0.5 rounded hover:bg-muted/40">
      <Link
        href={`/produkty/${pinned.id}`}
        className="flex items-baseline gap-2 min-w-0 flex-1"
      >
        <span className="text-xs truncate">{pinned.name}</span>
        <code className="text-[9px] text-muted-foreground tabular-nums shrink-0">
          {pinned.productCode}
        </code>
      </Link>
      <button
        type="button"
        onClick={detach}
        disabled={pending}
        className="size-5 grid place-items-center rounded text-rose-600 hover:bg-rose-100 disabled:opacity-40"
        title="Odpnij pudełko od tego produktu"
        aria-label="Odpnij"
      >
        <X className="size-3" />
      </button>
    </li>
  );
}

function CategoryChip({
  name,
  level,
}: {
  name: string;
  level: number;
}) {
  const label = level === 1 ? "Główna" : level === 2 ? "Podkat." : "Typ";
  const Icon =
    level === 1 ? FolderTree : level === 2 ? FolderTree : Layers;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full ring-1 max-w-[180px]",
        level === 1
          ? "bg-violet-100 text-violet-900 ring-violet-300"
          : level === 2
            ? "bg-violet-50 text-violet-800 ring-violet-200"
            : "bg-indigo-50 text-indigo-800 ring-indigo-200",
      )}
      title={`${label}: ${name}`}
    >
      <Icon className="size-2.5 shrink-0" />
      <span className="truncate">{name}</span>
    </span>
  );
}
