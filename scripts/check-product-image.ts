import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
async function main() {
  const id = "cmqe2wltj0006zchj0m9g5b3d";
  const p = await db.product.findUnique({
    where: { id },
    select: { productCode: true, name: true, images: { select: { id: true, url: true, alt: true, isPrimary: true, sortOrder: true } } },
  });
  console.log(JSON.stringify(p, null, 2));
}
main().catch(console.error).finally(() => db.$disconnect());
