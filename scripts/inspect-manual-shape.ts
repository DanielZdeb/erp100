import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const p = await db.product.findFirst({
    where: { productManualJson: { not: null } },
    select: { name: true, productCode: true, productManualJson: true, manualHeaderRanges: true },
  });
  if (!p || !p.productManualJson) {
    console.log("Brak manuala w bazie");
    return;
  }
  console.log("Produkt:", p.productCode, "-", p.name);
  const json = p.productManualJson as any;
  console.log("Top-level keys:", Object.keys(json));
  if (json.pages) {
    console.log("pages.length:", json.pages.length);
    console.log("pages[0] keys:", Object.keys(json.pages[0]));
    const c = json.pages[0].content;
    console.log(
      "pages[0].content top:",
      typeof c === "object" ? Object.keys(c) : typeof c,
    );
    console.log("pages[0].content.type:", c?.type);
    if (c?.content) {
      console.log("pages[0].content.content length:", c.content.length);
      console.log("first 2 nodes:", JSON.stringify(c.content.slice(0, 2), null, 2));
    }
    console.log("\npages[0].lang:", json.pages[0].lang);
  }
  console.log("\nheaderRanges:", JSON.stringify(p.manualHeaderRanges, null, 2));
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
