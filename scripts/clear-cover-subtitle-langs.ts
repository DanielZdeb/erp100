/**
 * Czyści `coverSubtitle` we wszystkich `ProductManual` gdzie tekst pasuje do
 * starej listy języków „PL · EN · SK · RO · CS · HU · BG" (lub jej wariantu
 * bez spacji / z innymi separatorami). Lista języków pokazuje się teraz
 * automatycznie pod podtytułem z `activeLanguages` — w subtitle nie powinna być.
 *
 * Uruchom: npx tsx scripts/clear-cover-subtitle-langs.ts
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const LANG_CODES = ["PL", "EN", "SK", "RO", "CS", "HU", "BG"];

/** Czy `subtitle` wygląda na hardcoded listę języków? */
function isLangsOnlySubtitle(subtitle: string): boolean {
  const cleaned = subtitle.trim();
  if (!cleaned) return false;
  // Split po dowolnym separatorze (· lub , lub | lub whitespace)
  const tokens = cleaned
    .split(/[·,|/\s]+/)
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);
  if (tokens.length === 0) return false;
  // Wszystkie tokeny muszą być kodami języków
  return tokens.every((t) => LANG_CODES.includes(t));
}

async function main() {
  const manuals = await db.productManual.findMany({
    where: { coverSubtitle: { not: null } },
    select: { id: true, name: true, coverSubtitle: true },
  });

  console.log(`Znaleziono ${manuals.length} instrukcji z coverSubtitle.`);

  let cleared = 0;
  for (const m of manuals) {
    const subtitle = m.coverSubtitle ?? "";
    if (isLangsOnlySubtitle(subtitle)) {
      await db.productManual.update({
        where: { id: m.id },
        data: { coverSubtitle: "" },
      });
      console.log(`  ✓ ${m.name}: „${subtitle}" → ""`);
      cleared++;
    } else {
      console.log(`  ⏭  ${m.name}: „${subtitle}" (zostawiam, to nie lista języków)`);
    }
  }

  console.log(`\nGotowe. Wyczyszczone: ${cleared}/${manuals.length}.`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
