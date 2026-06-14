/**
 * Ustawia Company.componentsEnabled wg slugu firmy.
 *   ACRO4F → false (sprzedaż tylko pojedynczych SKU, bez zestawów)
 *   ZDEB   → true  (zestawy i komponenty włączone)
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const targets: { slug: string; enabled: boolean }[] = [
    { slug: "acro4f", enabled: false },
    { slug: "zdeb", enabled: true },
  ];

  for (const t of targets) {
    const company = await db.company.findUnique({
      where: { slug: t.slug },
      select: { id: true, name: true, componentsEnabled: true },
    });
    if (!company) {
      console.log(`  ! Firma '${t.slug}' nie istnieje — pomijam.`);
      continue;
    }
    if (company.componentsEnabled === t.enabled) {
      console.log(
        `  = ${company.name}: componentsEnabled już = ${t.enabled}, bez zmian.`,
      );
      continue;
    }
    await db.company.update({
      where: { id: company.id },
      data: { componentsEnabled: t.enabled },
    });
    console.log(`  ✓ ${company.name}: componentsEnabled = ${t.enabled}`);
  }

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
