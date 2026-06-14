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
  if (!company) return;

  const ps = await db.product.findMany({
    where: {
      companyId: company.id,
      productCode: { startsWith: "PRP-50CM-" },
    },
    orderBy: { productCode: "asc" },
    select: {
      productCode: true,
      name: true,
      archived: true,
      isComponent: true,
      compositionMode: true,
      categoryId: true,
      category: { select: { name: true } },
      importMode: true,
      boxWidthCm: true,
      boxHeightCm: true,
      boxDepthCm: true,
      unitsPerBox: true,
      masterBoxWidthCm: true,
      masterBoxHeightCm: true,
      masterBoxDepthCm: true,
      innerBoxesPerMaster: true,
      cbmPerUnit: true,
    },
  });

  console.log(`PRP-50CM-* (${ps.length} sztuk):\n`);
  for (const p of ps) {
    console.log(`  ${p.productCode}`);
    console.log(`    name: ${p.name}`);
    console.log(`    archived: ${p.archived} · isComponent: ${p.isComponent} · compositionMode: ${p.compositionMode}`);
    console.log(`    category: ${p.category?.name ?? "—"}`);
    console.log(`    importMode: ${p.importMode}`);
    console.log(`    box: ${p.boxWidthCm}×${p.boxHeightCm}×${p.boxDepthCm} szt/kart=${p.unitsPerBox}`);
    console.log(`    master: ${p.masterBoxWidthCm}×${p.masterBoxHeightCm}×${p.masterBoxDepthCm} inner/master=${p.innerBoxesPerMaster}`);
    console.log(`    cbm/szt: ${p.cbmPerUnit?.toFixed(4) ?? "—"}`);
    console.log("");
  }

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
