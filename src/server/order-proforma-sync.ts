"use server";

/**
 * Parsowanie uploadu Proforma Invoice XLSX i synchronizacja z ERP.
 *
 * Format XLSX: 1:1 jak generujemy w `proforma-invoice-xlsx.ts`. Nagłówki
 * w wierszu 13-14, pozycje od wiersza 15. Klucz dopasowania:
 *   1) productCode (Model name, kolumna D) — primarny
 *   2) EAN (kolumna E) — fallback
 *
 * Co nadpisujemy:
 *   - `ImportOrderItem.quantity`      ← F (Quantity)
 *   - `ImportOrderItem.unitPriceUsd`  ← H (Unit price EXW USD)
 *   - `Product.eanCode`               ← E (gdy ERP ma null i XLSX ma wartość)
 *   - `Product.boxDepthCm`            ← N (Length Cm)
 *   - `Product.boxWidthCm`            ← O (Width Cm)
 *   - `Product.boxHeightCm`           ← P (Height Cm)
 *   - `Product.unitsPerBox`           ← Q (Packing qty)
 *   - `Product.weightKg`              ← U (Net Weight)
 *   - `Product.shippingBoxWeightKg`   ← W (Gross Weight)  — waga kartonu
 *
 * Zwracamy summary: ile zmienionych pozycji, lista pominiętych (nieznane
 * productCode) — UI pokazuje toast + opcjonalnie szczegółowy modal.
 */

import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";

async function requireUser() {
  const session = await auth();
  if (!session?.user) throw new Error("Brak autoryzacji");
  return session.user;
}

type ParsedRow = {
  rowIndex: number;
  productCode: string;
  eanCode: string | null;
  quantity: number | null;
  unitPriceUsd: number | null;
  boxDepthCm: number | null;
  boxWidthCm: number | null;
  boxHeightCm: number | null;
  unitsPerBox: number | null;
  weightKg: number | null;
  boxWeightKg: number | null;
};

export type ProformaSyncReport = {
  totalRowsInFile: number;
  matchedItems: number;
  updatedItems: number;
  updatedProducts: number;
  unknownCodes: string[];
  changes: {
    productCode: string;
    productName: string;
    diffs: string[];
  }[];
};

function toNumberOrNull(v: ExcelJS.CellValue): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  // CellFormulaValue { result: number | string }
  if (typeof v === "object" && "result" in v) {
    const r = v.result;
    if (typeof r === "number") return Number.isFinite(r) ? r : null;
    if (typeof r === "string") {
      const n = parseFloat(r.replace(",", "."));
      return Number.isFinite(n) ? n : null;
    }
  }
  return null;
}

function toStringOrNull(v: ExcelJS.CellValue): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number") return String(v);
  if (typeof v === "object" && "result" in v) {
    const r = v.result;
    if (typeof r === "string") return r.trim() || null;
    if (typeof r === "number") return String(r);
  }
  if (typeof v === "object" && "richText" in v) {
    const txt = (v as { richText: { text: string }[] }).richText
      .map((p) => p.text)
      .join("");
    return txt.trim() || null;
  }
  return null;
}

async function parseProformaWorkbook(
  buffer: ArrayBuffer,
): Promise<ParsedRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  // Prefer sheet "PI", fallback to pierwszy.
  const ws = wb.getWorksheet("PI") ?? wb.worksheets[0];
  if (!ws) throw new Error("Pusty plik XLSX.");

  const rows: ParsedRow[] = [];
  // Pozycje zaczynają się od wiersza 15.
  for (let r = 15; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const codeCell = toStringOrNull(row.getCell("D").value);
    // Zatrzymujemy się kiedy natrafimy na "TOTAL:" w kolumnie A
    const aText = toStringOrNull(row.getCell("A").value);
    if (aText && /^total/i.test(aText)) break;
    if (!codeCell) continue; // puste wiersze pomiń

    rows.push({
      rowIndex: r,
      productCode: codeCell,
      eanCode: toStringOrNull(row.getCell("E").value),
      quantity: toNumberOrNull(row.getCell("F").value),
      unitPriceUsd: toNumberOrNull(row.getCell("H").value),
      boxDepthCm: toNumberOrNull(row.getCell("N").value),
      boxWidthCm: toNumberOrNull(row.getCell("O").value),
      boxHeightCm: toNumberOrNull(row.getCell("P").value),
      unitsPerBox: toNumberOrNull(row.getCell("Q").value),
      weightKg: toNumberOrNull(row.getCell("U").value),
      boxWeightKg: toNumberOrNull(row.getCell("W").value),
    });
  }

  return rows;
}

export async function parseProformaInvoiceXlsxAction(
  orderId: string,
  formData: FormData,
): Promise<ProformaSyncReport> {
  await requireUser();
  const companyId = await getCurrentCompanyId();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Wgraj plik XLSX.");
  }
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    throw new Error("Dozwolone tylko pliki .xlsx.");
  }
  if (file.size > 25 * 1024 * 1024) {
    throw new Error("Plik za duży (max 25 MB).");
  }

  // Sprawdź zamówienie + wyciągnij pozycje z productCode
  const order = await db.importOrder.findFirst({
    where: { id: orderId, companyId },
    select: {
      id: true,
      companyId: true,
      items: {
        select: {
          id: true,
          productId: true,
          quantity: true,
          unitPriceUsd: true,
          product: {
            select: {
              id: true,
              name: true,
              productCode: true,
              eanCode: true,
              boxDepthCm: true,
              boxWidthCm: true,
              boxHeightCm: true,
              unitsPerBox: true,
              weightKg: true,
              shippingBoxWeightKg: true,
            },
          },
        },
      },
    },
  });
  if (!order) throw new Error("Zamówienie nie istnieje.");

  const buf = Buffer.from(await file.arrayBuffer());
  const parsed = await parseProformaWorkbook(buf.buffer.slice(
    buf.byteOffset,
    buf.byteOffset + buf.byteLength,
  ));

  const itemsByCode = new Map(
    order.items.map((it) => [it.product.productCode.toLowerCase(), it]),
  );
  const itemsByEan = new Map(
    order.items
      .filter((it) => it.product.eanCode)
      .map((it) => [it.product.eanCode as string, it]),
  );

  const unknownCodes: string[] = [];
  const changes: ProformaSyncReport["changes"] = [];
  let updatedItemsCount = 0;
  let updatedProductsCount = 0;

  for (const row of parsed) {
    const code = row.productCode.trim();
    const match =
      itemsByCode.get(code.toLowerCase()) ??
      (row.eanCode ? itemsByEan.get(row.eanCode) : undefined);
    if (!match) {
      unknownCodes.push(code);
      continue;
    }

    const itemDiffs: string[] = [];
    const productDiffs: string[] = [];
    const itemData: {
      quantity?: number;
      unitPriceUsd?: number | null;
    } = {};
    const productData: {
      eanCode?: string;
      boxDepthCm?: number | null;
      boxWidthCm?: number | null;
      boxHeightCm?: number | null;
      unitsPerBox?: number | null;
      weightKg?: number | null;
      shippingBoxWeightKg?: number | null;
    } = {};

    // Item fields
    if (row.quantity != null && row.quantity !== match.quantity) {
      itemData.quantity = Math.round(row.quantity);
      itemDiffs.push(
        `qty: ${match.quantity} → ${Math.round(row.quantity)}`,
      );
    }
    if (
      row.unitPriceUsd != null &&
      (match.unitPriceUsd ?? null) !== row.unitPriceUsd
    ) {
      itemData.unitPriceUsd = row.unitPriceUsd;
      itemDiffs.push(
        `cena USD: ${match.unitPriceUsd ?? "—"} → ${row.unitPriceUsd}`,
      );
    }

    // Product fields
    const p = match.product;
    if (row.eanCode && !p.eanCode) {
      productData.eanCode = row.eanCode;
      productDiffs.push(`EAN: — → ${row.eanCode}`);
    }
    if (row.boxDepthCm != null && p.boxDepthCm !== row.boxDepthCm) {
      productData.boxDepthCm = row.boxDepthCm;
      productDiffs.push(
        `boxDepth: ${p.boxDepthCm ?? "—"} → ${row.boxDepthCm}`,
      );
    }
    if (row.boxWidthCm != null && p.boxWidthCm !== row.boxWidthCm) {
      productData.boxWidthCm = row.boxWidthCm;
      productDiffs.push(
        `boxWidth: ${p.boxWidthCm ?? "—"} → ${row.boxWidthCm}`,
      );
    }
    if (row.boxHeightCm != null && p.boxHeightCm !== row.boxHeightCm) {
      productData.boxHeightCm = row.boxHeightCm;
      productDiffs.push(
        `boxHeight: ${p.boxHeightCm ?? "—"} → ${row.boxHeightCm}`,
      );
    }
    if (
      row.unitsPerBox != null &&
      p.unitsPerBox !== Math.round(row.unitsPerBox)
    ) {
      productData.unitsPerBox = Math.round(row.unitsPerBox);
      productDiffs.push(
        `unitsPerBox: ${p.unitsPerBox ?? "—"} → ${Math.round(row.unitsPerBox)}`,
      );
    }
    if (row.weightKg != null && p.weightKg !== row.weightKg) {
      productData.weightKg = row.weightKg;
      productDiffs.push(
        `weight: ${p.weightKg ?? "—"} → ${row.weightKg}`,
      );
    }
    if (
      row.boxWeightKg != null &&
      p.shippingBoxWeightKg !== row.boxWeightKg
    ) {
      productData.shippingBoxWeightKg = row.boxWeightKg;
      productDiffs.push(
        `boxWeight: ${p.shippingBoxWeightKg ?? "—"} → ${row.boxWeightKg}`,
      );
    }

    const diffs = [...itemDiffs, ...productDiffs];
    if (diffs.length === 0) continue;

    changes.push({
      productCode: p.productCode,
      productName: p.name,
      diffs,
    });

    if (Object.keys(itemData).length > 0) {
      await db.importOrderItem.update({
        where: { id: match.id },
        data: itemData,
      });
      updatedItemsCount += 1;
    }
    if (Object.keys(productData).length > 0) {
      await db.product.update({
        where: { id: p.id },
        data: productData,
      });
      updatedProductsCount += 1;
    }
  }

  revalidatePath(`/zamowienia/${orderId}`);

  return {
    totalRowsInFile: parsed.length,
    matchedItems: parsed.length - unknownCodes.length,
    updatedItems: updatedItemsCount,
    updatedProducts: updatedProductsCount,
    unknownCodes,
    changes,
  };
}
