/**
 * Jednorazowa migracja: ImportOrderCost.amountPln BRUTTO → NETTO.
 *
 * Polityka się zmieniła — wszystkie opłaty zamówienia trzymamy w netto.
 * Stare wiersze mają amountPln zapisane jako brutto. Skrypt dzieli przez
 * (1 + vatRate ?? 0.23) i normalizuje znaczniki.
 *
 * Run: `npx tsx scripts/migrate-costs-to-netto.ts`
 *
 * Idempotencja: pomija wiersze z `isNetto=true AND vatRate=null` —
 * to znacznik "już zmigrowane / wprowadzone pod nową polityką".
 */

import { db } from "../src/lib/db";

async function main() {
  // Stare brutto: isNetto=false (zapis jako brutto, vatRate=null)
  //               OR isNetto=true + vatRate!=null (zapis jako netto, ale +VAT)
  // Nowe netto:   isNetto=true + vatRate=null
  const candidates = await db.importOrderCost.findMany({
    where: {
      OR: [
        { isNetto: false },
        { AND: [{ isNetto: true }, { vatRate: { not: null } }] },
      ],
    },
    select: {
      id: true,
      amountPln: true,
      vatRate: true,
      isNetto: true,
      type: true,
      name: true,
    },
  });

  console.log(`Znaleziono ${candidates.length} wierszy do migracji.`);

  for (const c of candidates) {
    const vat = c.vatRate ?? 0.23;
    const netto = c.amountPln / (1 + vat);
    await db.importOrderCost.update({
      where: { id: c.id },
      data: {
        amountPln: Math.round(netto * 100) / 100,
        isNetto: true,
        vatRate: null,
      },
    });
    console.log(
      `  ${c.type}${c.name ? ` (${c.name})` : ""}: ${c.amountPln.toFixed(2)} → ${netto.toFixed(2)} zł netto`,
    );
  }

  console.log("✓ Migracja zakończona.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
