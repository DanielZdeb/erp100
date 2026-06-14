import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

/** Wyciąga rozmiar ze środkowego pola po `|`. Zwraca null gdy brak. */
function extractSize(name: string): string | null {
  const parts = name.split("|").map((s) => s.trim());
  if (parts.length < 3) return null;
  // Trzeba zidentyfikować "rozmiar" — heurystyka: zawiera "m" lub "cm" lub "ml" + cyfra.
  for (let i = 1; i < parts.length - 1; i++) {
    const p = parts[i];
    if (/\d/.test(p) && /\b(m|cm|ml)\b/i.test(p)) {
      return p;
    }
  }
  return null;
}

async function main() {
  const company = await db.company.findUnique({ where: { slug: "acro4f" } });
  if (!company) return;
  const cats = await db.category.findMany({
    where: { companyId: company.id },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  for (const c of cats) {
    const ps = await db.product.findMany({
      where: { companyId: company.id, categoryId: c.id },
      select: { name: true },
    });
    const sizes = new Map<string, number>();
    let noSize = 0;
    for (const p of ps) {
      const s = extractSize(p.name);
      if (s) sizes.set(s, (sizes.get(s) ?? 0) + 1);
      else noSize++;
    }
    console.log(`=== ${c.name} (${ps.length} produktów) ===`);
    for (const [s, n] of [...sizes.entries()].sort()) {
      console.log(`  ${s}: ${n}`);
    }
    if (noSize > 0) console.log(`  (bez rozmiaru: ${noSize})`);
  }
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
