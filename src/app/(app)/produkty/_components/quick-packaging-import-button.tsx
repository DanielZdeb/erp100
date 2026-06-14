"use client";

/**
 * Quick-edit button do edycji pakowania wysyłkowego + importu z Chin.
 *
 * Pokazany w liście produktów w kolumnie „Karton" gdy brakuje SHIPPING box-a.
 * Klik → uruchamia 2-krokowy flow:
 *  Krok 1: EditPackagingDialog (pakowanie wysyłkowe) — przycisk „Zapisz i dalej →"
 *  Krok 2: EditImportDialog    (import z Chin)        — przycisk „Zapisz"
 *
 * Anuluj w którymkolwiek kroku przerywa cały flow.
 */

import { useState } from "react";
import { PackageX } from "lucide-react";

import { EditPackagingDialog } from "../[id]/(detail)/pakowanie/_components/edit-packaging-dialog";
import {
  EditImportDialog,
  type EditImportInitial,
} from "../[id]/(detail)/import/_components/edit-import-dialog";
import type { BoxOption } from "../[id]/boxes-tab";

type PackagingMode = "BOX" | "FOLIOPAK" | "SAME_AS_IMPORT";

export function QuickPackagingImportButton({
  productId,
  productName,
  initialPackagingMode,
  initialShippingBoxId,
  initialImport,
  availableBoxes,
}: {
  productId: string;
  /** Nazwa produktu — auto-fill „Przeznaczenie" przy quick-add pudełka. */
  productName: string;
  initialPackagingMode: PackagingMode | null;
  initialShippingBoxId: string | null;
  initialImport: EditImportInitial;
  availableBoxes: BoxOption[];
}) {
  // null = closed, "packaging" = krok 1, "import" = krok 2
  const [step, setStep] = useState<null | "packaging" | "import">(null);

  return (
    <>
      <button
        type="button"
        onClick={() => setStep("packaging")}
        className="inline-flex items-center justify-center size-6 rounded text-rose-600 hover:bg-rose-100 transition-colors"
        title="Edytuj pakowanie + import (2 kroki)"
        aria-label="Edytuj pakowanie i import"
      >
        <PackageX className="size-4" />
      </button>

      {step === "packaging" && (
        <EditPackagingDialog
          productId={productId}
          productName={productName}
          initialMode={initialPackagingMode}
          initialShippingBoxId={initialShippingBoxId}
          availableBoxes={availableBoxes}
          stepLabel="Krok 1 z 2"
          saveLabel="Zapisz i dalej →"
          onSaved={() => setStep("import")}
          onClose={() => setStep(null)}
        />
      )}

      {step === "import" && (
        <EditImportDialog
          productId={productId}
          initial={initialImport}
          availableBoxes={availableBoxes}
          stepLabel="Krok 2 z 2"
          saveLabel="Zapisz"
          onClose={() => setStep(null)}
        />
      )}
    </>
  );
}
