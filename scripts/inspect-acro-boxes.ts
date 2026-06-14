/**
 * Wypisuje wszystkie pudełka ACRO4F z klasyfikacją:
 *   origin × isCollective → 4 kategorie (PL wysyłk, PL zbiorcze, CN imp., CN zbiorcze)
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const company = await db.company.findFirst({
    where: { name: { contains: "ACRO" } },
    select: { id: true, name: true },
  });
  if (!company) throw new Error("Brak ACRO4F");

  const boxes = await db.shippingBox.findMany({
    where: { companyId: company.id },
    orderBy: [{ origin: "asc" }, { isCollective: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      origin: true,
      isCollective: true,
      packagingType: true,
      widthCm: true,
      heightCm: true,
      depthCm: true,
      innerBoxId: true,
      innerBoxesPerMaster: true,
      _count: { select: { productBoxes: true } },
    },
  });

  const groups = new Map<
    string,
    { label: string; boxes: typeof boxes }
  >();
  groups.set("CHINA_STANDARD-false", { label: "CN IMPORTOWE (pojedyncze)", boxes: [] });
  groups.set("CHINA_STANDARD-true", { label: "CN ZBIORCZE (master)", boxes: [] });
  groups.set("POLAND-false", { label: "PL WYSYŁKOWE", boxes: [] });
  groups.set("POLAND-true", { label: "PL ZBIORCZE", boxes: [] });

  for (const b of boxes) {
    const key = `${b.origin}-${b.isCollective}`;
    groups.get(key)?.boxes.push(b);
  }

  for (const [, g] of groups) {
    console.log(`\n=== ${g.label} (${g.boxes.length}) ===`);
    for (const b of g.boxes) {
      const dims = `${b.widthCm}×${b.heightCm}×${b.depthCm}cm`;
      const master =
        b.isCollective && b.innerBoxId
          ? ` master→inner=${b.innerBoxesPerMaster}x`
          : "";
      console.log(
        `  ${b.name.padEnd(50).slice(0, 50)} ${dims.padEnd(20)} pinów=${b._count.productBoxes}${master}`,
      );
    }
  }

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
