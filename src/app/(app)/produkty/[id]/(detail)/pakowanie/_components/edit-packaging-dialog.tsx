"use client";

/**
 * Dialog edycji pakowania wysyłkowego — wybór trybu (Pudełko PL / Foliopak PL /
 * Ten sam co importowy) + picker konkretnego pudełka z biblioteki.
 *
 * Submit:
 *  - BOX / FOLIOPAK → setAuditShippingBoxAction(boxId)  (pinuje SHIPPING primary)
 *  - SAME_AS_IMPORT → setAuditShippingBoxAction(null)   (usuwa SHIPPING pin)
 */

import { useEffect, useState, useTransition } from "react";
import { Mail, Package, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  setAuditShippingBoxAction,
  setAuditFactoryBoxAction,
  setAuditShippingUnitsAction,
} from "@/server/product-audit";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineBoxPicker } from "../../../../new-product-wizard";
import type { BoxOption } from "../../../boxes-tab";

type Mode = "BOX" | "FOLIOPAK" | "SAME_AS_IMPORT";

export function EditPackagingButton({
  productId,
  productName,
  initialMode,
  initialShippingBoxId,
  initialFactoryBoxId,
  initialUnitsPerBox,
  availableBoxes,
}: {
  productId: string;
  /** Nazwa produktu — auto-fill „Przeznaczenie" przy quick-add pudełka. */
  productName: string;
  initialMode: Mode | null;
  initialShippingBoxId: string | null;
  /** ID kartonu fabrycznego (FACTORY pin) — preselect w trybie SAME_AS_IMPORT. */
  initialFactoryBoxId?: string | null;
  /** Sztuk produktu w pudełku (z ProductShippingBox.unitsPerBox). */
  initialUnitsPerBox?: number | null;
  availableBoxes: BoxOption[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-6"
      >
        <Pencil className="size-4" />
        Edytuj pakowanie
      </Button>
      {open && (
        <EditPackagingDialog
          productId={productId}
          productName={productName}
          initialMode={initialMode}
          initialShippingBoxId={initialShippingBoxId}
          initialFactoryBoxId={initialFactoryBoxId ?? null}
          initialUnitsPerBox={initialUnitsPerBox ?? null}
          availableBoxes={availableBoxes}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

export function EditPackagingDialog({
  productId,
  productName,
  initialMode,
  initialShippingBoxId,
  initialFactoryBoxId,
  initialUnitsPerBox,
  availableBoxes,
  onClose,
  onSaved,
  saveLabel = "Zapisz",
  stepLabel,
}: {
  productId: string;
  /** Nazwa produktu — auto-fill „Przeznaczenie" przy quick-add pudełka. */
  productName: string;
  initialMode: Mode | null;
  initialShippingBoxId: string | null;
  /** Pre-select FACTORY pin gdy tryb SAME_AS_IMPORT. */
  initialFactoryBoxId?: string | null;
  /** Sztuk produktu w pudełku — preselect. */
  initialUnitsPerBox?: number | null;
  availableBoxes: BoxOption[];
  onClose: () => void;
  /** Wywoływane po udanym zapisie zamiast onClose — pozwala chainować kroki
   *  (np. po zapisaniu pakowania otworzyć dialog importu). Domyślnie zwykły onClose. */
  onSaved?: () => void;
  /** Tekst przycisku zapisu — np. „Zapisz i dalej →" gdy w 2-krokowym flow. */
  saveLabel?: string;
  /** Mały badge w nagłówku — np. „Krok 1 z 2" gdy dialog jest częścią flow. */
  stepLabel?: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode ?? "BOX");
  const [boxId, setBoxId] = useState<string | null>(initialShippingBoxId);
  // FACTORY box (chiński karton) wybierany w trybie SAME_AS_IMPORT.
  const [factoryBoxId, setFactoryBoxId] = useState<string | null>(
    initialFactoryBoxId ?? null,
  );
  // Sztuk produktu w 1 kartonie wysyłkowym — używane do liczenia ile paczek
  // potrzeba na N sztuk (i przy ZESTAW INDIVIDUAL_PACKAGING przy komponentach).
  const [unitsPerBox, setUnitsPerBox] = useState<string>(
    initialUnitsPerBox != null && initialUnitsPerBox > 0
      ? String(initialUnitsPerBox)
      : "1",
  );
  const [pending, startTransition] = useTransition();

  // Gdy zmienia się tryb, czyść wybór jeśli nie pasuje
  useEffect(() => {
    if (mode === "SAME_AS_IMPORT") {
      setBoxId(null);
      return;
    }
    // Sprawdź czy bieżący box pasuje do nowego trybu
    if (boxId) {
      const b = availableBoxes.find((x) => x.id === boxId);
      if (!b) {
        setBoxId(null);
      } else if (mode === "BOX" && b.packagingType !== "BOX") {
        setBoxId(null);
      } else if (mode === "FOLIOPAK" && b.packagingType !== "POLY_BAG") {
        setBoxId(null);
      }
    }
  }, [mode, boxId, availableBoxes]);

  function handleSave() {
    startTransition(async () => {
      try {
        if (mode === "SAME_AS_IMPORT") {
          // Tryb „ten sam co importowy" — wymaga wyboru chińskiego kartonu jeśli
          // jeszcze nie ma FACTORY pinu. Z wyboru tworzymy FACTORY pin i kasujemy
          // SHIPPING. inferredMode wykryje SAME_AS_IMPORT po obecności FACTORY.
          if (!factoryBoxId) {
            toast.error("Wybierz karton z Chin (FACTORY) z biblioteki");
            return;
          }
          await setAuditFactoryBoxAction(productId, { boxId: factoryBoxId });
        } else {
          if (!boxId) {
            toast.error("Wybierz pudełko z biblioteki");
            return;
          }
          await setAuditShippingBoxAction(productId, { boxId });
          // Zapisz „sztuk w kartonie" — osobny action, bo SHIPPING box action
          // domyślnie nie nadpisuje tej wartości.
          const upbNum = parseInt(unitsPerBox, 10);
          if (Number.isFinite(upbNum) && upbNum >= 1) {
            await setAuditShippingUnitsAction(productId, {
              unitsPerBox: upbNum,
            });
          }
        }
        toast.success("Zapisano pakowanie");
        router.refresh();
        (onSaved ?? onClose)();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Błąd zapisu");
      }
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="!max-w-[min(96vw,720px)] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            {stepLabel && (
              <span className="text-[10px] uppercase tracking-wide font-bold bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300 px-1.5 py-0.5 rounded">
                {stepLabel}
              </span>
            )}
            Edytuj pakowanie wysyłkowe
          </DialogTitle>
        </DialogHeader>

        {/* Wybór trybu — 3 karty */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <ModeCard
            active={mode === "BOX"}
            onClick={() => setMode("BOX")}
            icon={<Package className="size-4" />}
            title="Pudełko (PL)"
            description="Karton z PL — produkt przepakowywany"
            theme="indigo"
          />
          <ModeCard
            active={mode === "FOLIOPAK"}
            onClick={() => setMode("FOLIOPAK")}
            icon={<Mail className="size-4" />}
            title="Foliopak (PL)"
            description="Woreczek pocztowy z PL"
            theme="rose"
          />
          <ModeCard
            active={mode === "SAME_AS_IMPORT"}
            onClick={() => setMode("SAME_AS_IMPORT")}
            icon={<Package className="size-4" />}
            title="Ten sam co importowy"
            description="Karton z Chin — bez przepakowania"
            theme="amber"
          />
        </div>

        {/* Picker pudełka — tylko dla BOX i FOLIOPAK. Pokazuje BOTH PL i CHIN
         *  origin — user może przypiąć karton z Chin jako wysyłkowy
         *  bezpośrednio (bez konieczności konfigurowania go przez Import tab).
         *  Picker pokazuje origin badge per karton. */}
        {mode !== "SAME_AS_IMPORT" && (
          <div className="rounded-md ring-1 ring-slate-200 bg-slate-50/40 p-3 space-y-3">
            <div className="text-xs uppercase tracking-wide font-semibold text-slate-600">
              {mode === "BOX" ? "Karton wysyłkowy (PL lub Chin)" : "Foliopak"}
            </div>
            <InlineBoxPicker
              boxes={availableBoxes}
              selectedId={boxId}
              onSelect={setBoxId}
              theme={mode === "BOX" ? "indigo" : "rose"}
              packagingFilter={mode === "BOX" ? "BOX" : "POLY_BAG"}
              collectiveFilter={false}
              quickAddType={mode === "BOX" ? "BOX" : "POLY_BAG"}
              quickAddLabel={
                mode === "BOX"
                  ? "Dodaj nowy karton wysyłkowy"
                  : "Dodaj nowy foliopak"
              }
              quickAddDefaultOrigin="POLAND"
              quickAddDefaultPurposeText={productName}
            />
            {/* Sztuk w kartonie — ile sztuk PRODUKTU mieści się w 1 takim
             *  pudełku. Używane do:
             *  - liczenia ile paczek przy zamówieniu N szt
             *  - w ZESTAW INDIVIDUAL_PACKAGING dla wyliczenia paczek per komp. */}
            <div className="flex items-end gap-3 pt-2 border-t border-slate-200">
              <div className="flex-1 space-y-1">
                <Label htmlFor="unitsPerBox" className="text-xs font-semibold">
                  Sztuk w 1 kartonie
                </Label>
                <p className="text-[10px] text-muted-foreground leading-snug">
                  Ile sztuk tego produktu mieści się w wybranym pudełku.
                  Domyślnie 1 (osobny karton na każdy produkt). Np. krzesło
                  dwupakowane: 2.
                </p>
              </div>
              <Input
                id="unitsPerBox"
                type="number"
                min="1"
                step="1"
                value={unitsPerBox}
                onChange={(e) => setUnitsPerBox(e.target.value)}
                className="w-24 h-9 text-center tabular-nums font-semibold"
              />
            </div>
          </div>
        )}

        {mode === "SAME_AS_IMPORT" && (
          <div className="space-y-2.5">
            <div className="rounded-md ring-1 ring-amber-200 bg-amber-50/40 p-3 text-xs text-amber-900">
              Wysyłka w tym samym kartonie co importowy (z Chin) — bez
              przepakowywania. Wybierz karton z Chin z biblioteki — będzie
              używany jako importowy + wysyłkowy jednocześnie.
            </div>
            <div className="rounded-md ring-1 ring-slate-200 bg-slate-50/40 p-3 space-y-2">
              <div className="text-xs uppercase tracking-wide font-semibold text-slate-600">
                Karton z Chin (FACTORY)
              </div>
              <InlineBoxPicker
                boxes={availableBoxes}
                selectedId={factoryBoxId}
                onSelect={setFactoryBoxId}
                theme="amber"
                packagingFilter="BOX"
                originFilter="CHINA_STANDARD"
                collectiveFilter={false}
                quickAddType="BOX"
                quickAddLabel="Dodaj nowy karton z Chin"
                quickAddDefaultOrigin="CHINA_STANDARD"
                quickAddDefaultPurposeText={productName}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={pending}
          >
            Anuluj
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={pending}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {pending ? "Zapisuję…" : saveLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ModeCard({
  active,
  onClick,
  icon,
  title,
  description,
  theme,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
  theme: "indigo" | "rose" | "amber";
}) {
  const themeRing = {
    indigo: "ring-indigo-400 bg-indigo-50",
    rose: "ring-rose-400 bg-rose-50",
    amber: "ring-amber-400 bg-amber-50",
  }[theme];
  const themeIcon = {
    indigo: "bg-indigo-100 text-indigo-700",
    rose: "bg-rose-100 text-rose-700",
    amber: "bg-amber-100 text-amber-700",
  }[theme];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-left rounded-md ring-1 p-2.5 transition-all hover:shadow-sm",
        active
          ? `ring-2 ${themeRing}`
          : "ring-slate-200 bg-white hover:ring-slate-300",
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <div
          className={cn("size-7 rounded grid place-items-center", themeIcon)}
        >
          {icon}
        </div>
        <div className="text-xs font-semibold flex-1">{title}</div>
      </div>
      <p className="text-[10px] text-muted-foreground leading-snug">
        {description}
      </p>
    </button>
  );
}
