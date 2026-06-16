"use client";

/**
 * Zakładka „Wytyczne i składanie zamówienia" (PL).
 *
 * Pozwala dodawać dowolnie wiele „sekcji" z tytułem, tekstem i grafikami.
 * Każda sekcja staje się osobną stroną w PDF zamówienia (PL) między
 * okładką (dane zamawiającego) a listą pozycji + belkami.
 *
 * Zawiera też przycisk wygenerowania PDF — przeniesiony z zakładki
 * „Zamówienie".
 */

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { FileText, Pencil, Scissors } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { TemplateSectionsEditor } from "../../ustawienia/szablony-zamowien/template-sections-editor";
import type { TemplateSection } from "../../ustawienia/szablony-zamowien/template-sections-editor";
import {
  GenerateBarcodesMultipagePdfButton,
  GenerateBarcodesZipButton,
  type BarcodeItemRow,
} from "./awizacja-tab";

export type PdfSectionImage = {
  id: string;
  url: string;
  alt: string | null;
  sortOrder: number;
};

export type PdfSection = {
  id: string;
  title: string;
  content: string | null;
  sortOrder: number;
  images: PdfSectionImage[];
};

export function GuidelinesTab({
  orderId,
  orderNumber,
  orderHasItems,
  pdfDescription,
  deliveryAddressOverrideFabryka,
  deliveryAddressOverrideKrajalnia,
  companyDeliveryAddress,
  initialSections,
  templateSections,
  barcodeItems,
  pdfMode = "krajalnia",
}: {
  orderId: string;
  orderNumber: string;
  orderHasItems: boolean;
  /** Opis zamówienia (cover page). Edytowalny tutaj. */
  pdfDescription: string | null;
  /** Nadpisanie adresu dla PDF do FABRYKI (puste = adres magazynu firmy). */
  deliveryAddressOverrideFabryka: string | null;
  /** Nadpisanie adresu dla PDF do SZWALNI/KRAJALNI (puste = adres magazynu firmy). */
  deliveryAddressOverrideKrajalnia: string | null;
  /** Adres magazynu firmy (domyslny dla wszystkich zamowien). Tylko podglad. */
  companyDeliveryAddress: string | null;
  initialSections: PdfSection[];
  /** Aktualne sekcje szablonu firmy — do edycji w dialogu inline. */
  templateSections: TemplateSection[];
  /** Pozycje zamówienia z kodami EAN/CODE128 — do wygenerowania kodów. */
  barcodeItems: BarcodeItemRow[];
  /** Tryb generowania PDF: „fabryka" → zamówienie do producenta materiału,
   *  „krajalnia" (default) → wewnętrzny obieg krajalnia + szwalnia. */
  pdfMode?: "fabryka" | "krajalnia";
}) {
  // Sekcje są tylko-do-odczytu w tym widoku. Całość zarządzania (dodawanie,
  // edycja, kolejność, usuwanie) idzie przez szablon firmy (modal) +
  // przycisk „Pobierz / Dolej z szablonu", który klonuje sekcje do zamówienia.
  const sections = initialSections;
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[3fr_1fr] gap-4 items-start">
      {/* ────── Lewa kolumna (3/4): tylko podgląd / wprowadzanie danych ────── */}
      <div className="space-y-4 min-w-0">
        <PdfHeaderBlock
          orderId={orderId}
          pdfDescription={pdfDescription}
        />

        <DeliveryAddressOverrideBlock
          orderId={orderId}
          mode={pdfMode}
          deliveryAddressOverride={
            pdfMode === "fabryka"
              ? deliveryAddressOverrideFabryka
              : deliveryAddressOverrideKrajalnia
          }
          companyDeliveryAddress={companyDeliveryAddress}
        />

        {/* Podgląd sekcji — tylko-do-odczytu. Edycja idzie przez „Edytuj
            szablon" w prawym panelu, a sekcje wciągamy do zamówienia
            przyciskiem „Pobierz/Dolej z szablonu". */}
        <div className="rounded-lg border border-cyan-200 bg-cyan-50/40 p-4 space-y-3">
          <div className="flex items-center gap-2 justify-between flex-wrap">
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-cyan-700" />
              <h3 className="text-sm font-semibold text-cyan-900">
                Sekcje PDF (po okładce, przed listą pozycji)
              </h3>
            </div>
            <span className="text-[11px] text-cyan-700/80">
              {sections.length}{" "}
              {sections.length === 1 ? "sekcja" : "sekcji"}
            </span>
          </div>
          <p className="text-xs text-cyan-800/80">
            Sekcje są pobierane z{" "}
            <span className="font-medium text-cyan-900">
              szablonu firmy
            </span>{" "}
            (zarządzanego z prawego panelu). Każda = osobna strona PDF.
          </p>

          {sections.length === 0 ? (
            <div className="text-center text-xs text-cyan-700/80 italic py-6 bg-white/60 rounded-md ring-1 ring-cyan-100">
              Brak sekcji w tym zamówieniu — użyj „Pobierz z szablonu"
              w panelu obok.
            </div>
          ) : (
            <div className="space-y-3">
              {sections.map((sec, idx) => (
                <ReadOnlySectionCard
                  key={sec.id}
                  section={sec}
                  index={idx}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ────── Prawa kolumna (1/4): akcje ────── */}
      <aside className="lg:sticky lg:top-4 space-y-3">
        <div className="rounded-lg border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-4 space-y-3">
          <div className="text-[10px] uppercase tracking-wide text-indigo-600 font-bold">
            Akcje PDF
          </div>
          {orderHasItems ? (
            <>
              {/* Przycisk PDF dla bieżącego trybu zakładki (fabryka albo
                  krajalnia/szwalnia). Każda zakładka generuje swój wariant. */}
              <a
                href={`/api/zamowienia/${orderId}/pdf-pl?tryb=${pdfMode}`}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-white text-sm font-semibold shadow-sm transition-colors",
                  pdfMode === "fabryka"
                    ? "bg-amber-600 hover:bg-amber-700"
                    : "bg-indigo-600 hover:bg-indigo-700",
                )}
              >
                <FileText className="size-4" />
                {pdfMode === "fabryka"
                  ? "Wygeneruj zamówienie Fabryka (PDF)"
                  : "Wygeneruj zamówienie Szwalnia (PDF)"}
              </a>
              {/* Kody kreskowe — tylko dla Szwalni (potrzebne przy szyciu).
                  Fabryka produkuje belki materiału, nie potrzebuje EAN-ów. */}
              {pdfMode === "krajalnia" && (
                <div className="flex flex-col gap-2 [&_button]:w-full">
                  <GenerateBarcodesZipButton
                    orderNumber={orderNumber}
                    items={barcodeItems}
                  />
                  <GenerateBarcodesMultipagePdfButton
                    orderNumber={orderNumber}
                    items={barcodeItems}
                  />
                </div>
              )}
            </>
          ) : (
            <div className="text-[11px] text-muted-foreground italic px-2 py-1.5 bg-white rounded ring-1 ring-slate-200">
              Dodaj pozycje, aby wygenerować PDF i kody kreskowe.
            </div>
          )}
        </div>

        <div className="rounded-lg border border-cyan-200 bg-gradient-to-br from-cyan-50 to-white p-4 space-y-3">
          <div className="text-[10px] uppercase tracking-wide text-cyan-700 font-bold">
            Szablon firmy
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start gap-2 h-auto py-2.5"
            onClick={() => setTemplateDialogOpen(true)}
            disabled={pending}
          >
            <Pencil className="size-4 text-cyan-700 shrink-0" />
            <div className="flex flex-col items-start min-w-0 text-left">
              <span className="text-sm font-semibold">
                Edytuj szablon
              </span>
              <span className="text-[10px] text-muted-foreground">
                {templateSections.length}{" "}
                {templateSections.length === 1 ? "sekcja" : "sekcji"} w
                szablonie firmy
              </span>
            </div>
          </Button>
          <p className="text-[10px] text-cyan-700/70 leading-relaxed">
            Sekcje są live linked z szablonem firmy — każda edycja szablonu
            od razu widoczna w PDF tego (i każdego innego) zamówienia.
          </p>
        </div>
      </aside>

      {/* Dialog z edytorem szablonu firmy. */}
      <Dialog
        open={templateDialogOpen}
        onOpenChange={(open) => {
          setTemplateDialogOpen(open);
          if (!open) router.refresh();
        }}
      >
        <DialogContent className="!max-w-[min(98vw,1100px)] sm:!max-w-[min(98vw,1100px)] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scissors className="size-5 text-cyan-600" />
              Szablon wytycznych — Materiał na szarfy
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-1">
            Edycja domyślnych sekcji firmy. Zmiany dotyczą TYLKO kolejnych
            nowych zamówień — to konkretne zamówienie ma już skopiowane swoje
            sekcje. Aby ponownie wciągnąć szablon, użyj „Pobierz / Dolej
            z szablonu".
          </p>
          <TemplateSectionsEditor
            kind="MATERIAL_SZARFY"
            target={pdfMode === "fabryka" ? "FABRYKA" : "KRAJALNIA"}
            initialSections={templateSections}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Read-only podgląd sekcji w zamówieniu — bez akcji edycji/usuwania.
 * Cała edycja sekcji odbywa się w szablonie firmy, a tu wciąga się je
 * przyciskiem „Pobierz z szablonu".
 */
function ReadOnlySectionCard({
  section,
  index,
}: {
  section: PdfSection;
  index: number;
}) {
  const previewText = section.content?.trim() || "";
  return (
    <div className="rounded-lg bg-white ring-1 ring-cyan-200 p-3">
      <div className="flex items-start gap-3">
        <span className="inline-flex shrink-0 items-center justify-center size-8 rounded-md bg-cyan-600 text-white text-xs font-bold">
          {index}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-900">
            {section.title}
          </div>
          {previewText ? (
            <div className="text-xs text-slate-700 mt-1 whitespace-pre-wrap">
              {previewText}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground italic mt-1">
              Brak treści.
            </div>
          )}
          {section.images.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mt-3">
              {section.images.map((img) => (
                <div
                  key={img.id}
                  className="relative aspect-video rounded ring-1 ring-slate-200 overflow-hidden bg-slate-50"
                >
                  <Image
                    src={img.url}
                    alt={img.alt ?? ""}
                    fill
                    sizes="180px"
                    className="object-cover"
                    unoptimized
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Sekcja edycji deliveryAddressOverride — nadpisuje adres magazynu firmy
 * dla tego konkretnego zamowienia (np. dropshipping do klienta).
 */
function DeliveryAddressOverrideBlock({
  orderId,
  mode,
  deliveryAddressOverride,
  companyDeliveryAddress,
}: {
  orderId: string;
  mode: "fabryka" | "krajalnia";
  deliveryAddressOverride: string | null;
  companyDeliveryAddress: string | null;
}) {
  const [draft, setDraft] = useState(deliveryAddressOverride ?? "");
  const [savedValue, setSavedValue] = useState(deliveryAddressOverride ?? "");
  const [pending, startTransition] = useTransition();
  const dirty = draft !== savedValue;
  const usingDefault = !draft.trim();
  const modeLabel = mode === "fabryka" ? "FABRYKA" : "SZWALNIA / KRAJALNIA";

  function save() {
    startTransition(async () => {
      try {
        const { updateOrderDeliveryAddressOverrideAction } = await import(
          "@/server/orders"
        );
        await updateOrderDeliveryAddressOverrideAction(orderId, mode, draft);
        setSavedValue(draft);
        toast.success(
          usingDefault
            ? "Wyczyszczono dane wykonawcy"
            : "Zapisano dane wykonawcy",
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <FileText className="size-4 text-amber-600" />
        <h3 className="text-sm font-semibold text-amber-900">
          Wykonawca — {modeLabel}
        </h3>
      </div>
      <p className="text-xs text-amber-800/80">
        Dane drugiej strony umowy (wykonawca podwykonawca). Pojawią się na
        cover'ze PDF obok danych Zamawiającego i na ostatniej stronie przy
        miejscu na podpis.
      </p>
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={
          "np. Firma XYZ sp. z o.o.\nul. Krótka 5\n00-001 Warszawa\nNIP: 1234567890 · KRS: 0000111222\nReprezentant: Jan Kowalski"
        }
        rows={6}
        className="bg-white text-sm font-mono"
      />
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          onClick={save}
          disabled={!dirty || pending}
          variant={dirty ? "default" : "secondary"}
        >
          {pending
            ? "Zapisuję…"
            : dirty
              ? usingDefault
                ? "Wyczyść dane wykonawcy"
                : "Zapisz wykonawcę"
              : "Zapisano"}
        </Button>
      </div>
    </div>
  );
}

/**
 * Sekcja edycji `pdfDescription` (strona 1 PDF). Przycisk wygenerowania PDF
 * mieszka w prawym panelu akcji, nie tutaj.
 */
function PdfHeaderBlock({
  orderId,
  pdfDescription,
}: {
  orderId: string;
  pdfDescription: string | null;
}) {
  const [draft, setDraft] = useState(pdfDescription ?? "");
  const [savedValue, setSavedValue] = useState(pdfDescription ?? "");
  const [pending, startTransition] = useTransition();
  const dirty = draft !== savedValue;

  function save() {
    startTransition(async () => {
      try {
        const { updateOrderPdfDescriptionAction } = await import(
          "@/server/orders"
        );
        await updateOrderPdfDescriptionAction(orderId, draft);
        setSavedValue(draft);
        toast.success("Zapisano opis zamówienia");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <FileText className="size-4 text-indigo-600" />
        <h3 className="text-sm font-semibold text-indigo-900">
          Opis zamówienia (strona 1 PDF)
        </h3>
      </div>
      <p className="text-xs text-indigo-700/80">
        Tekst pojawi się na pierwszej stronie PDF razem z danymi firmy
        zamawiającej. Lista pozycji startuje po sekcjach.
      </p>
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="np. Zamówienie na rolety materiałowe — kolory PIST i AGUA, dostawa do 15.07.2026..."
        rows={4}
        className="bg-white text-sm"
      />
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          onClick={save}
          disabled={!dirty || pending}
          variant={dirty ? "default" : "secondary"}
        >
          {pending ? "Zapisuję…" : dirty ? "Zapisz opis" : "Zapisano"}
        </Button>
      </div>
    </div>
  );
}
