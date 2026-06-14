import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const m = await db.productManual.findFirst({
    where: { name: { contains: "ury", mode: "insensitive" } },
    select: { id: true, name: true, manualJson: true, headerRanges: true },
  });
  if (!m) {
    console.log("Brak manuala");
    return;
  }
  console.log(`Manual: ${m.name}  (id ${m.id})`);
  const json = m.manualJson as any;
  if (!json || !Array.isArray(json.pages)) {
    console.log("Brak pages");
    return;
  }
  console.log(`Pages count: ${json.pages.length}`);
  for (let i = 0; i < json.pages.length; i++) {
    const p = json.pages[i];
    const content = p.content;
    const nodes = content?.content ?? [];
    console.log(`\nPage ${i + 1}  (id=${p.id}, lang=${p.lang})  — ${nodes.length} node(s):`);
    for (const n of nodes.slice(0, 3)) {
      const text =
        (n.content ?? [])
          .map((c: any) => c.text ?? "")
          .join("")
          .slice(0, 60) || `<${n.type}>`;
      console.log(`  ${n.type}: "${text}"`);
    }
    if (nodes.length > 3) console.log(`  ... +${nodes.length - 3} więcej`);
  }
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
