import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const o = await db.importOrder.findFirst({
    where: {
      orderNumber: "2026-0005",
      company: { name: { contains: "ACRO" } },
    },
    select: { id: true, name: true },
  });
  if (o) {
    await db.importOrder.delete({ where: { id: o.id } });
    console.log(`Skasowano 2026-0005 (${o.name})`);
  } else {
    console.log("Brak 2026-0005");
  }
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
