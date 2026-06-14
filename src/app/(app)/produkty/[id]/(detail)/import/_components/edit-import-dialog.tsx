"use client";

/**
 * Dialog edycji importu — waga, cło, tryb importu (KARTON/LUZEM) + wymiary
 * kartonu importowego i opcjonalnego master kartonu.
 *
 * Submit przez updateProductAuditFieldAction (auto-recalc cbmPerUnit).
 */

import { useState, useTransition } from "react";
import { Boxes, Check, Layers, Package, Pencil, Ship } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { updateProductAuditFieldAction } from "@/server/product-audit";
import { InlineBoxPicker } from "../../../../new-product-wizard";
import type { BoxOption } from "../../../boxes-tab";

type ImportMode = "KARTON" | "LUZEM";

export type EditImportInitial = {
  weightKg: number | null;
  customsDutyPct: number | null; // 0..1
  importMode: ImportMode;
  boxWidthCm: number | null;
  boxHeightCm: number | null;
  boxDepthCm: number | null;
  boxWeightKg: number | null;
  unitsPerBox: number | null;
  masterBoxWidthCm: number | null;
  masterBoxHeightCm: number | null;
  masterBoxDepthCm: number | null;
  masterBoxWeightKg: number | null;
  innerBoxesPerMaster: number | null;
  unitsPerContainer: number | null;
  referenceContainerM3: number | null;
};

export function EditImportButton({
  productId,
  initial,
  availableBoxes,
  label = "Edytuj import",
}: {
  productId: string;
  initial: EditImportInitial;
  availableBoxes: BoxOption[];
  /** Tekst na przycisku — domyślnie „Edytuj import", można nadpisać np. na
   *  „Zmień import" gdy button jest zagnieżdżony w karcie wybranego trybu. */
  label?: string;
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
        {label}
      </Button>
      {open && (
        <EditImportDialog
          productId={productId}
          initial={initial}
          availableBoxes={availableBoxes}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function n(v: number | null): string {
  return v != null ? String(v) : "";
}

export function EditImportDialog({
  productId,
  initial,
  availableBoxes,
  onClose,
  onSaved,
  saveLabel = "Zapisz",
  stepLabel,
}: {
  productId: string;
  initial: EditImportInitial;
  availableBoxes: BoxOption[];
  onClose: () => void;
  /** Wywoływane po udanym zapisie zamiast onClose — pozwala chainować kroki. */
  onSaved?: () => void;
  saveLabel?: string;
  stepLabel?: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<ImportMode>(initial.importMode);
  // Wybrany karton zbiorczy z biblioteki — tylko UI ref, w bazie zapisujemy
  // wymiary do masterBox*Cm. Próbujemy zmatchować wstępnie po wymiarach
  // jeżeli pasują do jakiegoś z dostępnych pudełek.
  const initialMasterBoxId = (() => {
    if (initial.masterBoxWidthCm == null) return null;
    const match = availableBoxes.find(
      (b) =>
        b.isCollective &&
        b.widthCm === initial.masterBoxWidthCm &&
        b.heightCm === initial.masterBoxHeightCm &&
        b.depthCm === initial.masterBoxDepthCm,
    );
    return match?.id ?? null;
  })();
  const [masterBoxId, setMasterBoxId] = useState<string | null>(
    initialMasterBoxId,
  );
  // Pojedynczy karton z Chin (factory box, non-collective). Match po wymiarach
  // produktu jeśli pasują do jakiegoś z biblioteki — wtedy picker pokaże już
  // wybrany karton zamiast pustego stanu „wybierz".
  const initialFactoryBoxId = (() => {
    if (initial.boxWidthCm == null) return null;
    const match = availableBoxes.find(
      (b) =>
        !b.isCollective &&
        b.widthCm === initial.boxWidthCm &&
        b.heightCm === initial.boxHeightCm &&
        b.depthCm === initial.boxDepthCm,
    );
    return match?.id ?? null;
  })();
  const [factoryBoxId, setFactoryBoxId] = useState<string | null>(
    initialFactoryBoxId,
  );
  // SubMode dla KARTON: SINGLE = pojedyncze kartony, MASTER = w zbiorczym
  // Auto-detect z istniejących danych — jeśli masterBox* są wypełnione → MASTER
  const initialSubMode: "SINGLE" | "MASTER" =
    initial.masterBoxWidthCm != null &&
    initial.masterBoxWidthCm > 0 &&
    initial.innerBoxesPerMaster != null &&
    initial.innerBoxesPerMaster > 0
      ? "MASTER"
      : "SINGLE";
  const [subMode, setSubMode] = useState<"SINGLE" | "MASTER">(initialSubMode);

  // KARTON fields
  const [boxWidthCm, setBoxWidthCm] = useState(n(initial.boxWidthCm));
  const [boxHeightCm, setBoxHeightCm] = useState(n(initial.boxHeightCm));
  const [boxDepthCm, setBoxDepthCm] = useState(n(initial.boxDepthCm));
  const [boxWeightKg, setBoxWeightKg] = useState(n(initial.boxWeightKg));
  const [unitsPerBox, setUnitsPerBox] = useState(n(initial.unitsPerBox));

  // MASTER fields
  const [masterBoxWidthCm, setMasterBoxWidthCm] = useState(
    n(initial.masterBoxWidthCm),
  );
  const [masterBoxHeightCm, setMasterBoxHeightCm] = useState(
    n(initial.masterBoxHeightCm),
  );
  const [masterBoxDepthCm, setMasterBoxDepthCm] = useState(
    n(initial.masterBoxDepthCm),
  );
  const [masterBoxWeightKg, setMasterBoxWeightKg] = useState(
    n(initial.masterBoxWeightKg),
  );
  const [innerBoxesPerMaster, setInnerBoxesPerMaster] = useState(
    n(initial.innerBoxesPerMaster),
  );

  // LUZEM fields
  const [unitsPerContainer, setUnitsPerContainer] = useState(
    n(initial.unitsPerContainer),
  );
  const [referenceContainerM3, setReferenceContainerM3] = useState(
    n(initial.referenceContainerM3),
  );

  const [pending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      try {
        // Bulk patch — wszystkie pola w jednym wywołaniu.
        // weightKg + customsDutyPct nie są edytowane w tym dialogu (są w „Podstawowe").
        await updateProductAuditFieldAction(productId, {
          importMode: mode,
          boxWidthCm: mode === "KARTON" && boxWidthCm !== "" ? Number(boxWidthCm) : null,
          boxHeightCm:
            mode === "KARTON" && boxHeightCm !== "" ? Number(boxHeightCm) : null,
          boxDepthCm:
            mode === "KARTON" && boxDepthCm !== "" ? Number(boxDepthCm) : null,
          boxWeightKg:
            mode === "KARTON" && boxWeightKg !== "" ? Number(boxWeightKg) : null,
          unitsPerBox:
            mode === "KARTON" && unitsPerBox !== "" ? Number(unitsPerBox) : null,
          // Master fields tylko gdy KARTON + subMode=MASTER. W trybie SINGLE
          // wszystkie master* zerujemy do null (czysty state).
          masterBoxWidthCm:
            mode === "KARTON" && subMode === "MASTER" && masterBoxWidthCm !== ""
              ? Number(masterBoxWidthCm)
              : null,
          masterBoxHeightCm:
            mode === "KARTON" &&
            subMode === "MASTER" &&
            masterBoxHeightCm !== ""
              ? Number(masterBoxHeightCm)
              : null,
          masterBoxDepthCm:
            mode === "KARTON" && subMode === "MASTER" && masterBoxDepthCm !== ""
              ? Number(masterBoxDepthCm)
              : null,
          masterBoxWeightKg:
            mode === "KARTON" &&
            subMode === "MASTER" &&
            masterBoxWeightKg !== ""
              ? Number(masterBoxWeightKg)
              : null,
          innerBoxesPerMaster:
            mode === "KARTON" &&
            subMode === "MASTER" &&
            innerBoxesPerMaster !== ""
              ? Number(innerBoxesPerMaster)
              : null,
          unitsPerContainer:
            mode === "LUZEM" && unitsPerContainer !== ""
              ? Number(unitsPerContainer)
              : null,
          referenceContainerM3:
            mode === "LUZEM" && referenceContainerM3 !== ""
              ? Number(referenceContainerM3)
              : null,
        });
        toast.success("Zapisano import");
        router.refresh();
        (onSaved ?? onClose)();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Błąd zapisu");
      }
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="!max-w-[min(96vw,820px)] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            {stepLabel && (
              <span className="text-[10px] uppercase tracking-wide font-bold bg-amber-100 text-amber-800 ring-1 ring-amber-300 px-1.5 py-0.5 rounded">
                {stepLabel}
              </span>
            )}
            <Ship className="size-4 text-amber-600" />
            Edytuj import z Chin
          </DialogTitle>
        </DialogHeader>

        {/* Waga sztuki + cło importowe podawane są w zakładce „Podstawowe" —
            tutaj skupiamy się tylko na trybie importu i wymiarach kartonu. */}

        {/* Tryb */}
        <div className="grid grid-cols-2 gap-2">
          <ModeCard
            active={mode === "KARTON"}
            onClick={() => setMode("KARTON")}
            icon={<Package className="size-4" />}
            title="W kartonie z Chin"
            description="Wymiary kartonu + szt./karton"
            theme="emerald"
          />
          <ModeCard
            active={mode === "LUZEM"}
            onClick={() => setMode("LUZEM")}
            icon={<Layers className="size-4" />}
            title="Luzem w kontenerze"
            description="m³ kontenera + szt./kontener"
            theme="violet"
          />
        </div>

        {/* KARTON: sub-tryb Pojedyncze / Master */}
        {mode === "KARTON" && (
          <>
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-wide font-semibold text-slate-600">
                Jak importowane z Chin?
              </div>
              <div className="grid grid-cols-2 gap-2">
                <SubModeCard
                  active={subMode === "SINGLE"}
                  onClick={() => setSubMode("SINGLE")}
                  title="Pojedyncze kartony"
                  description="Każdy karton z N sztukami produktu przyjeżdża osobno (kontener wypełniony pojedynczymi kartonami)"
                />
                <SubModeCard
                  active={subMode === "MASTER"}
                  onClick={() => setSubMode("MASTER")}
                  title="W zbiorczym kartonie"
                  description="N pojedynczych kartonów spakowanych w jeszcze większe pudło dla transportu"
                />
              </div>
            </div>

            <div className="rounded-md ring-1 ring-emerald-200 bg-emerald-50/40 p-3 space-y-3">
              <div className="text-xs uppercase tracking-wide font-semibold text-emerald-800 flex items-center gap-1">
                <Package className="size-3.5" />
                {subMode === "MASTER"
                  ? "Prod. karton (mieści się w zbiorczym)"
                  : "Karton importowy"}
              </div>
              <p className="text-[10px] text-emerald-700/80 italic">
                Wybierz karton z biblioteki (pojedyncze pudełka z Chin) — wymiary
                i waga uzupełnią się automatycznie. Możesz też wpisać ręcznie
                poniżej jeśli karton nie jest w bibliotece.
              </p>
              <InlineBoxPicker
                boxes={availableBoxes}
                originFilter="CHINA_STANDARD"
                collectiveFilter={false}
                selectedId={factoryBoxId}
                onSelect={(id) => {
                  setFactoryBoxId(id);
                  const picked = availableBoxes.find((b) => b.id === id);
                  if (picked) {
                    // Auto-fill wymiarów pudełka. Waga + szt./karton zostają
                    // bez zmian — to per-product settings, nie property pudełka.
                    setBoxWidthCm(String(picked.widthCm));
                    setBoxHeightCm(String(picked.heightCm));
                    setBoxDepthCm(String(picked.depthCm));
                  }
                }}
                theme="indigo"
                quickAddType="BOX"
                quickAddLabel="Dodaj nowy karton z Chin"
                quickAddDefaultOrigin="CHINA_STANDARD"
                quickAddDefaultIsCollective={false}
              />
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <Field
                  label="Szer. cm"
                  value={boxWidthCm}
                  onChange={setBoxWidthCm}
                  type="number"
                  step="0.1"
                />
                <Field
                  label="Wys. cm"
                  value={boxHeightCm}
                  onChange={setBoxHeightCm}
                  type="number"
                  step="0.1"
                />
                <Field
                  label="Głęb. cm"
                  value={boxDepthCm}
                  onChange={setBoxDepthCm}
                  type="number"
                  step="0.1"
                />
                <Field
                  label="Waga kg"
                  value={boxWeightKg}
                  onChange={setBoxWeightKg}
                  type="number"
                  step="0.01"
                />
                <Field
                  label="Szt./karton"
                  value={unitsPerBox}
                  onChange={setUnitsPerBox}
                  type="number"
                  step="1"
                />
              </div>
            </div>

            {subMode === "MASTER" && (
              <div className="rounded-md ring-1 ring-orange-200 bg-orange-50/40 p-3 space-y-3">
                <div className="text-xs uppercase tracking-wide font-semibold text-orange-800 flex items-center gap-1">
                  <Boxes className="size-3.5" />
                  Karton zbiorczy
                </div>
                <p className="text-[10px] text-orange-700/80 italic">
                  Wybierz karton zbiorczy z biblioteki (kartony z Chin oznaczone
                  jako zbiorcze) i podaj ile prod. kartonów się w nim mieści.
                </p>
                <InlineBoxPicker
                  boxes={availableBoxes}
                  originFilter="CHINA_STANDARD"
                  collectiveFilter={true}
                  selectedId={masterBoxId}
                  onSelect={(id) => {
                    setMasterBoxId(id);
                    const picked = availableBoxes.find((b) => b.id === id);
                    if (picked) {
                      // Auto-kopiuj wymiary do form state
                      setMasterBoxWidthCm(String(picked.widthCm));
                      setMasterBoxHeightCm(String(picked.heightCm));
                      setMasterBoxDepthCm(String(picked.depthCm));
                      // Auto-fill prod./zbiorczy z konfiguracji pudełka jeśli
                      // user jeszcze nie ustawił własnej wartości.
                      if (
                        picked.innerBoxesPerMaster != null &&
                        picked.innerBoxesPerMaster > 0 &&
                        !innerBoxesPerMaster
                      ) {
                        setInnerBoxesPerMaster(
                          String(picked.innerBoxesPerMaster),
                        );
                      }
                    }
                  }}
                  theme="amber"
                  quickAddType="BOX"
                  quickAddLabel="Dodaj nowy karton zbiorczy z Chin"
                  quickAddDefaultOrigin="CHINA_STANDARD"
                  quickAddDefaultIsCollective={true}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Field
                    label="Waga kartonu (kg)"
                    value={masterBoxWeightKg}
                    onChange={setMasterBoxWeightKg}
                    type="number"
                    step="0.01"
                  />
                  <Field
                    label="Prod./zbiorczy *"
                    value={innerBoxesPerMaster}
                    onChange={setInnerBoxesPerMaster}
                    type="number"
                    step="1"
                    hint={
                      Number(innerBoxesPerMaster) > 0 &&
                      Number(unitsPerBox) > 0
                        ? `→ ${Number(innerBoxesPerMaster) * Number(unitsPerBox)} szt produktu / zbiorczy`
                        : undefined
                    }
                  />
                </div>
              </div>
            )}
          </>
        )}

        {/* LUZEM */}
        {mode === "LUZEM" && (
          <div className="rounded-md ring-1 ring-violet-200 bg-violet-50/40 p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs uppercase tracking-wide font-semibold text-violet-800 flex items-center gap-1">
                <Layers className="size-3.5" />
                Luzem w kontenerze
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setReferenceContainerM3("28")}
                  className={cn(
                    "text-[10px] font-semibold px-2 py-0.5 rounded ring-1 transition-colors",
                    referenceContainerM3 === "28"
                      ? "bg-violet-600 text-white ring-violet-600"
                      : "bg-white text-violet-700 ring-violet-300 hover:bg-violet-100",
                  )}
                >
                  20&apos; (28 m³)
                </button>
                <button
                  type="button"
                  onClick={() => setReferenceContainerM3("68")}
                  className={cn(
                    "text-[10px] font-semibold px-2 py-0.5 rounded ring-1 transition-colors",
                    referenceContainerM3 === "68"
                      ? "bg-violet-600 text-white ring-violet-600"
                      : "bg-white text-violet-700 ring-violet-300 hover:bg-violet-100",
                  )}
                >
                  40&apos; (68 m³)
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field
                label="CBM referencyjny (m³)"
                value={referenceContainerM3}
                onChange={setReferenceContainerM3}
                type="number"
                step="0.01"
                hint="40' = 68 m³ · 20' = 28 m³"
              />
              <Field
                label="Sztuk / kontener"
                value={unitsPerContainer}
                onChange={setUnitsPerContainer}
                type="number"
                step="1"
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

function Field({
  label,
  value,
  onChange,
  type = "text",
  step,
  suffix,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  step?: string;
  suffix?: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wide text-slate-600">
        {label}
      </Label>
      <div className="relative">
        <Input
          type={type}
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn("h-8 text-sm font-mono", suffix && "pr-7")}
        />
        {suffix && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
      {hint && (
        <p className="text-[9px] text-muted-foreground italic">{hint}</p>
      )}
    </div>
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
  theme: "emerald" | "violet";
}) {
  const ring = {
    emerald: "ring-emerald-400 bg-emerald-50",
    violet: "ring-violet-400 bg-violet-50",
  }[theme];
  const iconBg = {
    emerald: "bg-emerald-100 text-emerald-700",
    violet: "bg-violet-100 text-violet-700",
  }[theme];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-left rounded-md ring-1 p-2.5 transition-all hover:shadow-sm",
        active ? `ring-2 ${ring}` : "ring-slate-200 bg-white hover:ring-slate-300",
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <div className={cn("size-7 rounded grid place-items-center", iconBg)}>
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

function SubModeCard({
  active,
  onClick,
  title,
  description,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-left rounded-md ring-1 p-2.5 transition-all hover:shadow-sm",
        active
          ? "ring-2 ring-emerald-400 bg-emerald-50"
          : "ring-slate-200 bg-white hover:ring-slate-300",
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <div className="text-xs font-semibold flex-1 inline-flex items-center gap-1.5">
          {title}
          {active && (
            <Check
              className="size-3 text-emerald-700"
              strokeWidth={3}
              aria-label="wybrany"
            />
          )}
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground leading-snug">
        {description}
      </p>
    </button>
  );
}
