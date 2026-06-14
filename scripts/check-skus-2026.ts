import "dotenv/config";
import * as XLSX from "xlsx";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

type Item = {
  rowIdx: number;
  num: unknown;
  sku: string | null;
  qty: number;
  unitPriceUsd: number;
  nameEn: string;
};

async function main() {
  const wb = XLSX.readFile(
    "C:/Users/zdebd/projekty-zdeb/GitHub/API KRS/erp-firma/acro zamowienia/2026.xlsx",
  );
  const ws = wb.Sheets["Sheet1"];
  const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
  const items: Item[] = [];
  for (let i = 0; i < data.length; i++) {
    const row = data[i] as unknown[];
    if (!row || row.length === 0) continue;
    const sku = typeof row[3] === "string" ? row[3].trim() : null;
    const qty = typeof row[6] === "number" ? row[6] : 0;
    const unitPrice = typeof row[8] === "number" ? row[8] : 0;
    if (qty > 0 && unitPrice > 0) {
      items.push({
        rowIdx: i,
        num: row[0],
        sku,
        qty,
        unitPriceUsd: unitPrice,
        nameEn: typeof row[2] === "string" ? row[2].slice(0, 80) : "",
      });
    }
  }
  console.log(`Pozycje w pliku: ${items.length}`);

  const skus = items.filter((i) => i.sku).map((i) => i.sku!);
  const existing = await db.product.findMany({
    where: {
      productCode: { in: skus },
      company: { name: { contains: "ACRO" } },
    },
    select: {
      id: true,
      productCode: true,
      name: true,
      defaultUnitPriceUsd: true,
    },
  });
  const existingMap = new Map(existing.map((p) => [p.productCode, p]));

  console.log(`\nW bazie (ACRO4F): ${existing.length} z ${skus.length}`);

  console.log("\n=== STATUS PER POZYCJA ===");
  let mappedQty = 0;
  let mappedValue = 0;
  let missingQty = 0;
  let missingValue = 0;
  let noSkuQty = 0;
  let noSkuValue = 0;
  for (const it of items) {
    const total = it.qty * it.unitPriceUsd;
    if (!it.sku) {
      noSkuQty += it.qty;
      noSkuValue += total;
      console.log(
        `  [NO-SKU]    qty=${it.qty.toString().padStart(5)}  $${it.unitPriceUsd.toFixed(2).padStart(7)}  =$${total.toFixed(2).padStart(10)}  ${it.nameEn.slice(0, 50)}`,
      );
      continue;
    }
    const inDb = existingMap.get(it.sku);
    if (inDb) {
      mappedQty += it.qty;
      mappedValue += total;
      console.log(
        `  [OK]        ${it.sku.padEnd(28)} qty=${it.qty.toString().padStart(5)}  $${it.unitPriceUsd.toFixed(2).padStart(7)}  =$${total.toFixed(2).padStart(10)}  → ${inDb.name.slice(0, 40)}`,
      );
    } else {
      missingQty += it.qty;
      missingValue += total;
      console.log(
        `  [BRAK W DB] ${it.sku.padEnd(28)} qty=${it.qty.toString().padStart(5)}  $${it.unitPriceUsd.toFixed(2).padStart(7)}  =$${total.toFixed(2).padStart(10)}  ${it.nameEn.slice(0, 40)}`,
      );
    }
  }
  console.log("\n=== SUMA ===");
  console.log(`  OK w bazie:     qty=${mappedQty}  wartość=$${mappedValue.toFixed(2)}`);
  console.log(`  Brak w bazie:   qty=${missingQty}  wartość=$${missingValue.toFixed(2)}`);
  console.log(`  Bez SKU:        qty=${noSkuQty}  wartość=$${noSkuValue.toFixed(2)}`);
  console.log(
    `  TOTAL:          qty=${mappedQty + missingQty + noSkuQty}  wartość=$${(mappedValue + missingValue + noSkuValue).toFixed(2)}`,
  );
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
