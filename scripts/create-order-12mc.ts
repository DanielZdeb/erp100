/**
 * Tworzy polskie zamówienie z pliku `acro zamowienia/Zamowienie_12mc.xlsx`.
 *
 *   Plik ma 2 sekcje:
 *     1. Hamaki dla dzieci (chusta sensoryczna) 3 m — gotowe produkty KH-3X1.5M-*
 *     2. Szarfy akrobatyczne 6/7/8 m — materiały M-AS-150-{N}M-*
 *
 *   Tylko wiersze z qty > 0 trafiają do zamówienia.
 *   Niedopasowane nazwy/kolory → warning + pomijamy.
 *
 *   Bez --apply: dry-run (pokazuje mapowanie, nic nie zapisuje).
 */
import "dotenv/config";
import * as XLSX from "xlsx";
import path from "node:path";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const XLSX_PATH = path.join(
  process.cwd(),
  "acro zamowienia",
  "Zamowienie_12mc.xlsx",
);

// Mapowanie polskich nazw kolorów → suffix SKU (UPPERCASE).
// Klucze celowo lowercase + bez polskich znaków przy lookup.
const COLOR_MAP: Record<string, string> = {
  "pastelowy roz": "PASTELPINK",
  "pastelowy róż": "PASTELPINK",
  "jasnoszary": "GREY",
  "pistacjowy": "PIST",
  "ciemnozielony": "D.GREEN",
  "ciemnozielona": "D.GREEN",
  "granatowy": "R.BLUE",
  "granatowa": "R.BLUE",
  "zloty": "GOLD",
  "złoty": "GOLD",
  "zlota": "GOLD",
  "złota": "GOLD",
  "rozowy": "PINK",
  "różowy": "PINK",
  "rozowa": "PINK",
  "różowa": "PINK",
  "ciemnoszary": "DARKGREY",
  "ciemnoszara": "DARKGREY",
  "jasnozielony": "GREEN",
  "jasnozielona": "GREEN",
  "zielony": "GREEN",
  "zielona": "GREEN",
  "jasnoniebieski": "S.BLUE",
  "jasnoniebieska": "S.BLUE",
  "bialy": "WHITE",
  "biały": "WHITE",
  "biala": "WHITE",
  "biała": "WHITE",
  "fioletowy": "PURPLE",
  "fioletowa": "PURPLE",
  "czarny": "BLACK",
  "czarna": "BLACK",
  "szary": "GREY",
  "szara": "GREY",
  // "Niebieska" osobno od jasnoniebieska/granatowa — w bazie nie istnieje,
  // pomijamy z warning.
};

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function colorSuffix(colorRaw: string): string | null {
  const norm = normalize(colorRaw);
  return COLOR_MAP[norm] ?? null;
}

interface ParsedRow {
  rawName: string;
  lengthM: number;
  colorName: string;
  qty: number;
  category: "hamak3m" | "szarfa";
}

function parseSheet(rows: (string | number | null)[][]): ParsedRow[] {
  const out: ParsedRow[] = [];
  let inSzarfy = false;
  for (const row of rows) {
    if (!row || row.length < 3) continue;
    const [id, name, qty] = row;
    if (typeof name !== "string") continue;
    if (name === "RAZEM") continue;
    // Nagłówek drugiej sekcji „ID | Nazwa towaru | DO ZAMÓWIENIA" pojawia się
    // dwukrotnie. Pierwsze wystąpienie = sekcja hamaków, drugie = szarfy.
    if (name === "Nazwa towaru") {
      if (!inSzarfy) {
        inSzarfy = false; // pierwszy nagłówek — kolejne wiersze to hamaki 3m
        continue;
      }
      continue;
    }
    if (typeof qty !== "number" || qty <= 0) continue;

    // Wzorzec nazwy: "3 m | Pastelowy róż" (hamaki) lub "6 m | Pastelowy róż" (szarfy)
    const m = name.match(/^(\d+)\s*m\s*\|\s*(.+)$/i);
    if (!m) continue;
    const lengthM = Number(m[1]);
    const colorName = m[2].trim();

    // Hamaki = sekcja przed pierwszym RAZEM (długość = 3)
    // Szarfy = sekcja po pierwszym RAZEM (długości 6, 7, 8)
    const category = lengthM === 3 ? "hamak3m" : "szarfa";
    if (category === "szarfa") inSzarfy = true;

    out.push({
      rawName: name,
      lengthM,
      colorName,
      qty,
      category,
    });
    void id;
  }
  return out;
}

interface ResolvedItem {
  productCode: string;
  qty: number;
  source: ParsedRow;
}

async function resolveItem(p: ParsedRow): Promise<ResolvedItem | string> {
  const suffix = colorSuffix(p.colorName);
  if (!suffix) {
    return `[SKIP] „${p.rawName}" — nieznany kolor „${p.colorName}".`;
  }
  // Hamaki dziecięce mają legacy literówkę w SKU: większość ma `-COLOR` ale
  // jeden istniejący to `KH-3X1.5MGREY` (bez myślnika). Próbujemy oba formaty.
  const candidates: string[] =
    p.category === "hamak3m"
      ? [`KH-3X1.5M-${suffix}`, `KH-3X1.5M${suffix}`]
      : [`M-AS-150-${p.lengthM}M-${suffix}`];

  for (const productCode of candidates) {
    const product = await db.product.findFirst({
      where: { productCode },
      select: { productCode: true },
    });
    if (product) return { productCode, qty: p.qty, source: p };
  }
  return `[SKIP] „${p.rawName}" → próbowano ${candidates.join(" / ")} — brak w bazie.`;
}

async function main() {
  const apply = process.argv.includes("--apply");

  console.log(`Wczytuję ${XLSX_PATH}...`);
  const wb = XLSX.readFile(XLSX_PATH);
  const sn = wb.SheetNames[0];
  const ws = wb.Sheets[sn];
  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, {
    header: 1,
    defval: null,
  });

  const parsed = parseSheet(rows);
  console.log(`Wierszy z qty>0 w pliku: ${parsed.length}\n`);

  const resolved: ResolvedItem[] = [];
  const skipped: string[] = [];
  for (const p of parsed) {
    const r = await resolveItem(p);
    if (typeof r === "string") skipped.push(r);
    else resolved.push(r);
  }

  console.log(`=== Pozycje do zamówienia: ${resolved.length} ===`);
  let totalQty = 0;
  for (const r of resolved) {
    console.log(
      `  ${r.productCode.padEnd(24)} ← „${r.source.rawName}" × ${r.qty}`,
    );
    totalQty += r.qty;
  }
  console.log(`  RAZEM: ${totalQty} szt\n`);

  if (skipped.length > 0) {
    console.log(`=== Pomijane: ${skipped.length} ===`);
    for (const s of skipped) console.log(`  ${s}`);
    console.log();
  }

  if (!apply) {
    console.log(
      "TO BYŁ DRY-RUN. Aby utworzyć zamówienie: npx tsx scripts/create-order-12mc.ts --apply",
    );
    return;
  }

  // ─── Tworzymy zamówienie ─────────────────────────────────────────
  const productCodes = resolved.map((r) => r.productCode);
  const products = await db.product.findMany({
    where: { productCode: { in: productCodes } },
    select: { id: true, productCode: true, companyId: true },
  });
  if (products.length !== resolved.length) {
    throw new Error("Niezgodność liczby produktów po znalezieniu w DB.");
  }
  const companyId = products[0].companyId;
  if (!companyId) throw new Error("Brak companyId.");
  const codeToProductId = new Map(products.map((p) => [p.productCode, p.id]));

  // Nadaj numer zamówienia: rok-NNNN (kolejny po istniejących polskich w tym roku).
  const year = new Date().getFullYear();
  const lastOrder = await db.importOrder.findFirst({
    where: { companyId, orderNumber: { startsWith: `${year}-` } },
    orderBy: { orderNumber: "desc" },
    select: { orderNumber: true },
  });
  let nextNum = 1;
  if (lastOrder) {
    const m = lastOrder.orderNumber.match(/(\d{4})-(\d{4})/);
    if (m) nextNum = Number(m[2]) + 1;
  }
  const orderNumber = `${year}-${String(nextNum).padStart(4, "0")}`;

  // createdById — bierzemy pierwszego usera w firmie (skrypt admina).
  const firstUser = await db.user.findFirst({
    where: { companyId },
    select: { id: true },
  });
  if (!firstUser) throw new Error("Brak usera w firmie.");

  console.log(`Tworzę zamówienie ${orderNumber} (POLAND, status PLANOWANE)...`);
  const order = await db.importOrder.create({
    data: {
      companyId,
      orderNumber,
      name: "Zamówienie 12 mc — hamaki dziecięce + szarfy",
      country: "POLAND",
      status: "PLANOWANE",
      createdById: firstUser.id,
      notes:
        "Wygenerowane skryptem create-order-12mc.ts z pliku Zamowienie_12mc.xlsx (acro zamowienia/).",
      items: {
        create: resolved.map((r, idx) => ({
          productId: codeToProductId.get(r.productCode)!,
          quantity: r.qty,
          sortOrder: idx,
        })),
      },
    },
    select: { id: true, orderNumber: true },
  });
  console.log(
    `✓ Utworzono zamówienie ${order.orderNumber} (${order.id}) z ${resolved.length} pozycji, ${totalQty} szt łącznie.`,
  );
}

main()
  .catch((e) => console.error(e))
  .finally(() => db.$disconnect());
