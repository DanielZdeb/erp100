/**
 * Usuwa SHIPPING piny które utworzyłem wcześniej dla pudełek z xlsx
 * (te są realnie chińskimi kartonami → tylko FACTORY).
 *
 * Pudełka "Karton wysyłkowy NN×NN×NN cm" (origin=POLAND) zostawiam
 * w bibliotece — gdyby user kiedyś chciał faktycznie pakować w PL.
 * Same SHIPPING piny na produktach które wskazują na te pudełka — kasuję.
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
    select: { id: true },
  });
  if (!company) throw new Error("Brak ACRO4F");

  const shippingBoxes = await db.shippingBox.findMany({
    where: {
      companyId: company.id,
      name: { startsWith: "Karton wysyłkowy " },
    },
    select: { id: true, name: true },
  });
  console.log(`SHIPPING pudełka utworzone wcześniej: ${shippingBoxes.length}`);

  const pinsDeleted = await db.productShippingBox.deleteMany({
    where: {
      purpose: "SHIPPING",
      boxId: { in: shippingBoxes.map((b) => b.id) },
    },
  });
  console.log(`✓ Skasowano ${pinsDeleted.count} pinów SHIPPING na produktach`);

  // Czy mam też usunąć same pudełka z biblioteki?
  // — zostawiam (gdyby user kiedyś chciał z nich skorzystać).
  console.log(
    `Pudełka "Karton wysyłkowy" zostają w bibliotece (gdybyś chciał potem użyć)`,
  );
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
