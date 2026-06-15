"use client";

/**
 * Client wrapper dla ManualEditor — wstrzykuje server actions specyficzne dla
 * ProductManual: saveAction (update), uploadImageAction, pdfUrl.
 *
 * ManualEditor jest reusable — istniejący per-product flow zostaje, ale tutaj
 * używamy go w kontekście niezależnej instrukcji (ProductManual entity).
 */

import {
  updateProductManualAction,
  uploadManualImageAction,
} from "@/server/product-manuals";
import type { HeaderRange } from "@/lib/manual-document";

import {
  ManualEditor,
  type ManualSavePayload,
  type ManualStyleSettings,
} from "../../../[id]/(detail)/instrukcja/_components/manual-editor";

import type {
  ManualPageSizeT,
  ManualTemplateT,
} from "@/server/product-manual";

export type ManualKindT = "STANDARD" | "LEAFLET";

export function ManualEditorPanel({
  manualId,
  initialDoc,
  initialTemplate,
  initialPageSize,
  initialKind,
  initialHeaderLang,
  initialHeaderTitle,
  initialHeaderRanges,
  initialFooterCustom,
  initialStyle,
  companyWebsiteUrl,
  productImages,
}: {
  manualId: string;
  initialDoc: object | null;
  initialTemplate: ManualTemplateT;
  initialPageSize: ManualPageSizeT;
  initialKind: ManualKindT;
  initialHeaderLang: string | null;
  initialHeaderTitle: string | null;
  initialHeaderRanges: HeaderRange[];
  initialFooterCustom: string | null;
  initialStyle: ManualStyleSettings;
  /** Adres www firmy — wyświetlany na środku ostatniej strony. */
  companyWebsiteUrl: string | null;
  productImages: { id: string; url: string; alt: string | null }[];
}) {
  async function save(payload: ManualSavePayload) {
    await updateProductManualAction(manualId, payload);
  }

  async function uploadImage(fd: FormData): Promise<string> {
    return uploadManualImageAction(manualId, fd);
  }

  async function translate(fromLang: string, toLang: string) {
    const { translateManualSectionAction } = await import(
      "@/server/manual-translate"
    );
    const result = await translateManualSectionAction(
      manualId,
      fromLang,
      toLang,
    );
    // Action zwraca { ok: false, error } zamiast throwować — żeby uniknąć
    // RSC „Server Components render" 500. Tutaj re-throwujemy żeby logic
    // ManualEditor (try/catch + toast) miał message.
    if (!result.ok) throw new Error(result.error);
    return result;
  }

  return (
    <ManualEditor
      saveAction={save}
      uploadImageAction={uploadImage}
      translateAction={translate}
      pdfUrl={`/api/instrukcje/${manualId}/pdf`}
      printUrl={`/produkty/instrukcje/${manualId}/drukuj`}
      initialDoc={initialDoc}
      initialTemplate={initialTemplate}
      initialPageSize={initialPageSize}
      initialKind={initialKind}
      initialHeaderLang={initialHeaderLang}
      initialHeaderTitle={initialHeaderTitle}
      initialHeaderRanges={initialHeaderRanges}
      initialFooterCustom={initialFooterCustom}
      initialStyle={initialStyle}
      companyWebsiteUrl={companyWebsiteUrl}
      productImages={productImages}
    />
  );
}
