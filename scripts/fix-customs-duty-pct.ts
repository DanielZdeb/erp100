/**
 * Naprawia customsDutyPct dla kategorii ACRO4F zgodnie z xlsx kalkulacją:
 *  - Rury pole dance (+ przedłużki): 6.5%
 *  - Szarfy akrobatyczne (CN i PL): 2.7%
 *  - Hamaki do jogi: 2.7% (też uznane za "szarfy" typu materiał tekstylny)
 *  - Hamaki dla dzieci: 2.7%
 *  - Materiały szarfa: 2.7%
 *  - Koła cyrkowe: 2.7% (sugerowane jak szarfy)
 *  - Magnezja pole dance: 8.5% (chemia/proszek typu)
 *  - Mocowania sufitowe (metal): 6.5%
 *
 * Stawka ustawiana na poziomie KATEGORII L1 — produkty dziedziczą.
 * Per-produkt customsDutyPct zostaje override'em (gdyby user wpisał coś
 * specyficznego na produkt).
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const CATEGORY_DUTY: Record<string, number> = {
  "Rury pole dance": 0.027, // 2.7%
  "Szarfy akrobatyczne CN - Zestaw": 0.08, // 8%
  "Szarfy akrobatyczna PL - materiały": 0.08,
  "Materiały szarfa": 0.08,
  "Hamaki do jogi CN - zestaw": 0.08, // 8%
  "Hamaki dla dzieci": 0.08, // 8%
  "Koła cyrkowe - zestaw": 0.027, // 2.7% (jak rury — metal)
  "Magnezja pole dance": 0.085, // 8.5% — chemia
  "Mocowania sufitowe": 0.027, // 2.7% — metal
};

async function main() {
  const company = await db.company.findFirst({
    where: { name: { contains: "ACRO" } },
    select: { id: true },
  });
  if (!company) throw new Error("Brak ACRO4F");

  // Aktualizuj L1 categories ACRO4F
  let updated = 0;
  for (const [catName, dutyPct] of Object.entries(CATEGORY_DUTY)) {
    const cats = await db.category.findMany({
      where: { companyId: company.id, name: catName },
      select: { id: true, name: true, level: true, parent: { select: { name: true } } },
    });
    for (const c of cats) {
      await db.category.update({
        where: { id: c.id },
        data: { customsDutyPct: dutyPct },
      });
      console.log(
        `  ✓ L${c.level}  ${c.parent?.name ?? "—"} > ${c.name}  customsDutyPct = ${(dutyPct * 100).toFixed(1)}%`,
      );
      updated++;
    }
  }

  // Wyczyść per-product overrides na produktach gdzie były ustawione kategoria
  // ma teraz prawidłową stawkę (chyba że user explicitly chce per-produkt).
  // Tu konserwatywnie — pomijam, bo to override usera.

  console.log(`\nGotowe. Zaktualizowano ${updated} kategorii.`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
