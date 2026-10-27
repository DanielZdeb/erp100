/**
 * Generator XLSX awizacji w formacie e-Packman — 1 wiersz per SKU.
 *
 * Kolumny (1:1 jak w `awizacja-packman.xlsx` od Packmana):
 *   Product name | SKU | EAN | Unit | Quantity | Unit net price |
 *   VAT rate | Unit gross price | Weight | Width | Length | Height |
 *   Expiration date | Lot number | Single box quantity | Box number |
 *   Track date | Track batch number | Track bio | Track food |
 *   Track insert | Track fragile
 *
 * Uzupełniane: Product name, SKU, EAN, Unit, Quantity (= ilość z zamówienia),
 * Weight, Width/Length/Height (z wymiarów pojedynczej sztuki), Lot number
 * (= numer zamówienia). Reszta pustа — magazyn wypełnia u siebie.
 */

import ExcelJS from "exceljs";

export type PackmanXlsxItem = {
  productCode: string;
  productName: string;
  eanCode: string | null;
  quantity: number;
  weightKg: number | null;
  widthCm: number | null;
  heightCm: number | null;
  depthCm: number | null;
};

export type PackmanXlsxInput = {
  orderNumber: string;
  items: PackmanXlsxItem[];
};

const HEADERS = [
  "Product name",
  "SKU",
  "EAN",
  "Unit",
  "Quantity",
  "Unit net price",
  "VAT rate",
  "Unit gross price",
  "Weight",
  "Width",
  "Length",
  "Height",
  "Expiration date",
  "Lot number",
  "Single box quantity",
  "Box number",
  "Track date",
  "Track batch number",
  "Track bio",
  "Track food",
  "Track insert",
  "Track fragile",
] as const;

export async function generateAwizacjaPackmanXlsx(
  input: PackmanXlsxInput,
): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ACRO4F ERP";
  wb.created = new Date();

  const ws = wb.addWorksheet("Avisation", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  ws.columns = HEADERS.map((h) => ({
    header: h,
    key: h,
    width:
      h === "Product name"
        ? 44
        : h === "SKU"
          ? 24
          : h === "EAN"
            ? 16
            : h === "Lot number"
              ? 18
              : 14,
  }));

  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: "middle", horizontal: "left" };
  headerRow.height = 20;
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE2E8F0" },
  };
  headerRow.border = {
    top: { style: "thin", color: { argb: "FFCBD5E1" } },
    bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
  };

  for (const it of input.items) {
    ws.addRow({
      "Product name": it.productName,
      SKU: it.productCode,
      EAN: it.eanCode ?? "",
      Unit: "szt",
      Quantity: it.quantity,
      "Unit net price": "",
      "VAT rate": "",
      "Unit gross price": "",
      Weight: it.weightKg ?? "",
      Width: it.widthCm ?? "",
      Length: it.depthCm ?? "",
      Height: it.heightCm ?? "",
      "Expiration date": "",
      "Lot number": input.orderNumber,
      "Single box quantity": "",
      "Box number": "",
      "Track date": "",
      "Track batch number": "",
      "Track bio": "",
      "Track food": "",
      "Track insert": "",
      "Track fragile": "",
    });
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
