/**
 * Zmienia SKU materiałów ze starego formatu na nowy:
 *   stary: {PREFIX}-FABRIC-{WIDTH}-{LEN}M-{COLOR}
 *          np. AS-FABRIC-150-6M-BLACK, KH-FABRIC-150-4M-WHITE
 *   nowy:  M-{PREFIX}-{WIDTH}-{LEN}M-{COLOR}
 *          np. M-AS-150-6M-BLACK, M-KH-150-4M-WHITE
 *
 * Bez --apply: tylko dry-run (wypisuje co by zmieniło).
 * Z --apply: faktycznie aktualizuje DB.
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

function convertSku(oldSku: string): string | null {
  // Pasuje stary format z FABRIC
  const m = oldSku.match(/^([A-Z]+)-FABRIC-(\d+)-(\d+M)-(.+)$/i);
  if (!m) return null;
  const [, prefix, width, length, color] = m;
  return `M-${prefix.toUpperCase()}-${width}-${length.toUpperCase()}-${color.toUpperCase()}`;
}

async function main() {
  const apply = process.argv.includes("--apply");

  const products = await db.product.findMany({
    where: { productCode: { contains: "-FABRIC-" } },
    select: { id: true, productCode: true, name: true },
    orderBy: { productCode: "asc" },
  });

  console.log(`Znaleziono ${products.length} produktow z "FABRIC" w SKU.`);
  console.log("");

  const updates: { id: string; oldSku: string; newSku: string }[] = [];
  for (const p of products) {
    const newSku = convertSku(p.productCode);
    if (!newSku || newSku === p.productCode) {
      console.log(`  SKIP  ${p.productCode}  (nie pasuje do wzorca)`);
      continue;
    }
    console.log(`  ${p.productCode.padEnd(40)} -> ${newSku}`);
    updates.push({ id: p.id, oldSku: p.productCode, newSku });
  }

  console.log("");
  console.log(`Do zmiany: ${updates.length} pozycji.`);

  if (!apply) {
    console.log("");
    console.log(
      "TO BYL DRY-RUN. Aby zastosowac zmiany: npx tsx scripts/rename-material-skus.ts --apply",
    );
    return;
  }

  // Sprawdz konflikty — czy nowy SKU juz nie istnieje
  for (const u of updates) {
    const exists = await db.product.findFirst({
      where: { productCode: u.newSku, NOT: { id: u.id } },
      select: { id: true },
    });
    if (exists) {
      console.error(
        `BLAD: nowy SKU ${u.newSku} juz istnieje (id=${exists.id}). Przerywam.`,
      );
      return;
    }
  }

  console.log("");
  console.log("Aktualizuje DB...");

  let ok = 0;
  for (const u of updates) {
    await db.product.update({
      where: { id: u.id },
      data: { productCode: u.newSku },
    });
    ok++;
  }

  console.log(`Zaktualizowano ${ok} pozycji.`);
}

main()
  .catch((e) => console.error(e))
  .finally(() => db.$disconnect());
