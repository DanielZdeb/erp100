"use client";

import * as React from "react";
import { Copy } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import { ProductForm } from "./product-form";
import type { ComponentProps } from "react";
import type { CategoryNode as ComponentCategoryNode } from "./component-category-picker";
import type { CategoryTreeNode } from "./category-tree-select";
import type { BoxOption, ProductBoxRow } from "./[id]/boxes-tab";

type ProductFormProps = ComponentProps<typeof ProductForm>;

type ProductFormInitial = NonNullable<ProductFormProps["initial"]>;

export function NewProductDialog({
  categories,
  componentCategoryOptions,
  defaultContainerM3,
  defaultIsComponent = false,
  triggerClassName,
  children,
}: {
  categories: CategoryTreeNode[];
  componentCategoryOptions?: ComponentCategoryNode[];
  defaultContainerM3?: number;
  defaultIsComponent?: boolean;
  triggerClassName?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button
        type="button"
        variant="default"
        onClick={() => setOpen(true)}
        className={cn(buttonVariants(), "gap-2", triggerClassName)}
      >
        {children}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="!max-w-[min(98vw,1280px)] sm:!max-w-[min(98vw,1280px)] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {defaultIsComponent ? "Nowy komponent" : "Nowy produkt"}
            </DialogTitle>
          </DialogHeader>
          <ProductForm
            categories={categories}
            componentCategoryOptions={componentCategoryOptions}
            defaultContainerM3={defaultContainerM3}
            defaultIsComponent={defaultIsComponent}
            hideCancel
            onSuccess={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Przycisk "Dodaj podobny" — otwiera dialog tworzenia produktu z polami
 * wstępnie wypełnionymi danymi źródłowego wiersza. Kod produktu zostaje
 * przesufiksowany "_kopia" żeby uniknąć kolizji unique, a user musi go
 * zmienić ręcznie przed zapisem (lub zostawić jeśli unikalne).
 */
export function DuplicateProductButton({
  categories,
  componentCategoryOptions,
  defaultContainerM3,
  initial,
  triggerClassName,
  iconOnly = false,
}: {
  categories: CategoryTreeNode[];
  componentCategoryOptions?: ComponentCategoryNode[];
  defaultContainerM3?: number;
  initial: ProductFormInitial;
  triggerClassName?: string;
  iconOnly?: boolean;
}) {
  const [open, setOpen] = React.useState(false);

  // Przygotuj initial dla duplikatu: pre-suffix kodu, name z dopiskiem
  const duplicateInitial = React.useMemo<ProductFormInitial>(
    () => ({
      ...initial,
      name: `${initial.name ?? ""} (kopia)`.trim(),
      productCode: initial.productCode
        ? `${initial.productCode}_kopia`
        : initial.productCode,
      // eanCode unique — wyczyść (user może nadać nowy lub zostawić puste)
      eanCode: null,
    }),
    [initial],
  );

  return (
    <>
      {iconOnly ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            "size-7 rounded grid place-items-center hover:bg-primary/10 text-primary transition-colors",
            triggerClassName,
          )}
          title="Dodaj podobny"
          aria-label="Dodaj podobny"
        >
          <Copy className="size-3.5" />
        </button>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen(true)}
          className={cn("gap-1 h-7 px-2 text-xs", triggerClassName)}
          title="Dodaj podobny — utwórz nowy z wypełnionymi polami tego"
        >
          <Copy className="size-3" />
          Dodaj podobny
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="!max-w-[min(98vw,1280px)] sm:!max-w-[min(98vw,1280px)] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Dodaj podobny {initial.isComponent ? "komponent" : "produkt"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-1">
            Pola wypełnione danymi z oryginału. Sprawdź <strong>nazwę</strong>{" "}
            i <strong>kod produktu</strong> — kod ma sufiks „_kopia” — przed
            zapisem.
          </p>
          <ProductForm
            categories={categories}
            componentCategoryOptions={componentCategoryOptions}
            defaultContainerM3={defaultContainerM3}
            initial={duplicateInitial}
            hideCancel
            onSuccess={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

export function EditProductDialog({
  productId,
  categories,
  componentCategoryOptions,
  initialAssignedCategoryIds,
  defaultContainerM3,
  productBoxes,
  availableBoxes,
  initial,
  triggerClassName,
  children,
  variant = "default",
}: {
  productId: string;
  categories: CategoryTreeNode[];
  componentCategoryOptions?: ComponentCategoryNode[];
  initialAssignedCategoryIds?: string[];
  defaultContainerM3?: number;
  productBoxes?: ProductBoxRow[];
  availableBoxes?: BoxOption[];
  initial: ProductFormInitial;
  triggerClassName?: string;
  children: React.ReactNode;
  variant?: "default" | "outline" | "ghost";
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button
        type="button"
        variant={variant}
        onClick={() => setOpen(true)}
        className={cn(triggerClassName)}
      >
        {children}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="!max-w-[min(98vw,1280px)] sm:!max-w-[min(98vw,1280px)] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Edytuj {initial?.isComponent ? "komponent" : "produkt"}
            </DialogTitle>
          </DialogHeader>
          <ProductForm
            productId={productId}
            categories={categories}
            componentCategoryOptions={componentCategoryOptions}
            initialAssignedCategoryIds={initialAssignedCategoryIds}
            defaultContainerM3={defaultContainerM3}
            productBoxes={productBoxes}
            availableBoxes={availableBoxes}
            initial={initial}
            hideCancel
            onSuccess={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
