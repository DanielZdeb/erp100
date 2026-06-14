import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const company = await db.company.findUnique({
    where: { slug: "acro4f" },
    select: { id: true },
  });
  if (!company) throw new Error("ACRO4F nie istnieje.");

  // Spróbuj różne warianty
  const patterns = ["Hamak", "Hamki", "hamak", "joga", "jogi"];
  for (const pat of patterns) {
    const matches = await db.product.findMany({
      where: {
        companyId: company.id,
        archived: false,
        name: { contains: pat, mode: "insensitive" },
      },
      select: { name: true, productCode: true },
      take: 15,
    });
    console.log(`\n[${pat}] — ${matches.length} match(es):`);
    for (const m of matches) console.log(`  ${m.productCode} — ${m.name}`);
  }

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
