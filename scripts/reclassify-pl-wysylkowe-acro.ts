/**
 * Z 12 pudełek "Karton wysyłkowy ..." (origin=POLAND, isCollective=false, 0 pinów):
 *  • te które są lustrzane do CN Chin z unitsPerBox > 1 (= master)
 *    → przeklasyfikuj na CHINA_STANDARD + isCollective=true (CN ZBIORCZE)
 *    + zmień nazwę na "Karton zbiorczy {wymiary}"
 *  • te lustrzane do CN single (unitsPerBox=1) → po prostu usuń
 *
 * Pass --write żeby wykonać. Default: dry-run.
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const writeMode = process.argv.includes("--write");
  console.log(writeMode ? "[WRITE MODE]" : "[DRY-RUN — bez zapisu, użyj --write]");

  const company = await db.company.findFirst({
    where: { name: { contains: "ACRO" } },
    select: { id: true },
  });
  if (!company) throw new Error("Brak ACRO4F");

  const plBoxes = await db.shippingBox.findMany({
    where: {
      companyId: company.id,
      origin: "POLAND",
      isCollective: false,
      name: { startsWith: "Karton wysyłkowy " },
    },
    select: {
      id: true,
      name: true,
      widthCm: true,
      heightCm: true,
      depthCm: true,
      _count: { select: { productBoxes: true } },
    },
  });
  console.log(`PL Wysyłkowych do analizy: ${plBoxes.length}`);

  let toReclassify = 0;
  let toDelete = 0;
  let skipped = 0;
  const actions: { id: string; name: string; action: "reclassify" | "delete"; reason: string; maxUpb: number | null }[] = [];

  for (const pl of plBoxes) {
    if (pl._count.productBoxes > 0) {
      skipped++;
      console.log(`  ⚠ ${pl.name} — ma piny (${pl._count.productBoxes}), nie ruszam`);
      continue;
    }
    // Znajdź lustrzane CN Chin o tych samych wymiarach.
    const cnTwin = await db.shippingBox.findFirst({
      where: {
        companyId: company.id,
        origin: "CHINA_STANDARD",
        isCollective: false,
        widthCm: pl.widthCm,
        heightCm: pl.heightCm,
        depthCm: pl.depthCm,
        name: { startsWith: "Karton Chin " },
      },
      select: {
        id: true,
        name: true,
        productBoxes: {
          select: { unitsPerBox: true },
          orderBy: { unitsPerBox: "desc" },
          take: 1,
        },
      },
    });
    if (!cnTwin) {
      skipped++;
      console.log(`  ⚠ ${pl.name} — brak CN counterpart, nie ruszam`);
      continue;
    }
    const maxUpb = cnTwin.productBoxes[0]?.unitsPerBox ?? 1;
    if (maxUpb > 1) {
      toReclassify++;
      actions.push({
        id: pl.id,
        name: pl.name,
        action: "reclassify",
        reason: `CN twin "${cnTwin.name}" ma unitsPerBox=${maxUpb} (master)`,
        maxUpb,
      });
    } else {
      toDelete++;
      actions.push({
        id: pl.id,
        name: pl.name,
        action: "delete",
        reason: `CN twin "${cnTwin.name}" jest single (unitsPerBox=${maxUpb})`,
        maxUpb,
      });
    }
  }

  console.log(`\n=== AKCJE ===`);
  console.log(`  → CN ZBIORCZE (master): ${toReclassify}`);
  console.log(`  → USUŃ:                 ${toDelete}`);
  console.log(`  ⚠ POMINIĘTE:            ${skipped}`);

  console.log(`\n=== SZCZEGÓŁY ===`);
  for (const a of actions) {
    const icon = a.action === "reclassify" ? "↪" : "✗";
    console.log(`  ${icon} ${a.name.padEnd(45)} → ${a.action.padEnd(10)} (${a.reason})`);
  }

  if (writeMode) {
    console.log(`\n=== WYKONUJĘ ===`);
    for (const a of actions) {
      if (a.action === "reclassify") {
        // Stara nazwa: "Karton wysyłkowy 60×40×50 cm" → "Karton zbiorczy 60×40×50 cm"
        const newName = a.name.replace(/^Karton wysyłkowy /, "Karton zbiorczy ");
        await db.shippingBox.update({
          where: { id: a.id },
          data: {
            origin: "CHINA_STANDARD",
            isCollective: true,
            name: newName,
          },
        });
        console.log(`  ✓ ${a.name} → CN ZBIORCZE "${newName}"`);
      } else {
        await db.shippingBox.delete({ where: { id: a.id } });
        console.log(`  ✓ usunięto ${a.name}`);
      }
    }
  } else if (actions.length > 0) {
    console.log(`\nUruchom z --write żeby wykonać.`);
  }

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
