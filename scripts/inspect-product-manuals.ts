import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const manuals = await db.productManual.findMany({
    select: {
      id: true,
      name: true,
      template: true,
      pageSize: true,
      kind: true,
      fontFamily: true,
      bodyFontSize: true,
      h1FontSize: true,
      h2FontSize: true,
      h3FontSize: true,
      logoImageUrl: true,
      logoHeightPt: true,
      headerLang: true,
      headerTitle: true,
      footerCustom: true,
      _count: {
        select: {
          productAssignments: true,
          categoryAssignments: true,
        },
      },
    },
    orderBy: { updatedAt: "asc" },
  });
  console.log(`Manuals w katalogu (${manuals.length}):`);
  for (const m of manuals) {
    console.log(
      `\n  ${m.name}  (id ${m.id})`,
      `\n    pageSize=${m.pageSize}  template=${m.template}  kind=${m.kind}`,
      `\n    font=${m.fontFamily}  body=${m.bodyFontSize}  h1=${m.h1FontSize}  h2=${m.h2FontSize}  h3=${m.h3FontSize}`,
      `\n    logo=${m.logoImageUrl ?? "—"}  logoHeight=${m.logoHeightPt}`,
      `\n    headerLang=${m.headerLang}  headerTitle=${m.headerTitle}  footer=${m.footerCustom ?? "—"}`,
      `\n    przypisania: produkty=${m._count.productAssignments}  kategorie=${m._count.categoryAssignments}`,
    );
  }
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
