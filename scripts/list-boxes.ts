import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const boxes = await db.shippingBox.findMany({
    where: { archived: false, isCollective: false },
    select: {
      id: true,
      name: true,
      internalCode: true,
      widthCm: true,
      heightCm: true,
      depthCm: true,
      purchasePricePln: true,
    },
    orderBy: { name: "asc" },
  });
  console.log("Pudełka (nie-zbiorcze):");
  for (const b of boxes) {
    console.log(
      `  ${b.id} | ${b.name} | ${b.internalCode ?? "—"} | ${b.widthCm}x${b.heightCm}x${b.depthCm} | ${b.purchasePricePln ?? "?"} zł`,
    );
  }
}
main()
  .catch(console.error)
  .finally(() => db.$disconnect());
