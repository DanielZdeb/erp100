/**
 * Zmienia nazwę 4 materiałów R.BLUE:
 *   „niebieski/niebieska"  →  „granatowy/granatowa"
 *
 * SKU (M-KH-150-4M-R.BLUE itp.) zostaje bez zmian — kod koloru R.BLUE
 * w bazie jest stabilny, zmieniamy tylko etykietę użytkową.
 *
 * Bez --apply: dry-run.
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const apply = process.argv.includes("--apply");
  const products = await db.product.findMany({
    where: { productCode: { contains: "-R.BLUE" } },
    select: { id: true, productCode: true, name: true, color: true },
    orderBy: { productCode: "asc" },
  });

  console.log(`Znaleziono ${products.length} produktow R.BLUE\n`);

  const updates: { id: string; oldName: string; newName: string }[] = [];
  for (const p of products) {
    // Zamień "niebieski" / "niebieska" / "Niebieski" / "Niebieska" → "granatowy/granatowa"
    let newName = p.name
      .replace(/niebieska/gi, (m) =>
        m[0] === m[0].toUpperCase() ? "Granatowa" : "granatowa",
      )
      .replace(/niebieski/gi, (m) =>
        m[0] === m[0].toUpperCase() ? "Granatowy" : "granatowy",
      );
    if (newName === p.name) {
      console.log(`  [SKIP] ${p.productCode.padEnd(28)} -> brak zmian w nazwie`);
      continue;
    }
    console.log(`  ${p.productCode.padEnd(28)} ${p.name}`);
    console.log(`  ${" ".padEnd(28)}   -> ${newName}`);
    updates.push({ id: p.id, oldName: p.name, newName });
  }

  console.log(`\nDo zmiany: ${updates.length} pozycji`);

  if (!apply) {
    console.log("");
    console.log(
      "TO BYL DRY-RUN. Aby zastosowac: npx tsx scripts/rename-rblue-to-granatowy.ts --apply",
    );
    return;
  }

  for (const u of updates) {
    await db.product.update({
      where: { id: u.id },
      data: {
        name: u.newName,
        color: "granatowy",
      },
    });
  }
  console.log(`\nZaktualizowano ${updates.length} pozycji.`);
}

main()
  .catch((e) => console.error(e))
  .finally(() => db.$disconnect());
