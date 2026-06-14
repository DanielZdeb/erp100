/**
 * Aktualizuje ustawienia manuala „Rura do pole dance — montaż i konserwacja"
 * do standardu ACRO4F (jak Koła cyrkowe / Hamak do jogi):
 *   pageSize=A5, font=Plus Jakarta Sans, body=10, h1=12, h2=10, h3=10,
 *   logo z biblioteki ACRO4F, logoHeight=60pt, footer=ACRO4F.COM.
 *
 * Opcjonalnie usuwa pustą duplikatną pozycję „Rury pole dance" (test row
 * stworzony przez usera, 0 stron).
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const ACRO4F_LOGO =
  "/uploads/manuals/cmq6ouz2q000094hjk1g2kha1/images/1781018841231-jftnzs-logo-color.svg";

async function main() {
  const target = await db.productManual.findFirst({
    where: { name: "Rura do pole dance — montaż i konserwacja" },
    select: { id: true, name: true },
  });
  if (!target) {
    console.log("Brak manuala do aktualizacji");
    return;
  }
  await db.productManual.update({
    where: { id: target.id },
    data: {
      pageSize: "A5",
      template: "CLEAN",
      kind: "STANDARD",
      fontFamily: "Plus Jakarta Sans",
      bodyFontSize: 10,
      h1FontSize: 12,
      h2FontSize: 10,
      h3FontSize: 10,
      logoImageUrl: ACRO4F_LOGO,
      logoHeightPt: 60,
      footerCustom: "ACRO4F.COM",
      headerLang: null, // headerRanges już ma lang per zakres
    },
  });
  console.log(`✓ Zaktualizowano ustawienia: ${target.name}`);

  // Pusty duplikat „Rury pole dance" (jeśli istnieje i nie ma treści)
  const empty = await db.productManual.findFirst({
    where: { name: "Rury pole dance" },
    select: {
      id: true,
      manualJson: true,
      _count: {
        select: {
          productAssignments: true,
          categoryAssignments: true,
        },
      },
    },
  });
  if (empty) {
    const json = empty.manualJson as { pages?: unknown[] } | null;
    const pages = json?.pages?.length ?? 0;
    const assigns =
      empty._count.productAssignments + empty._count.categoryAssignments;
    console.log(
      `Pusty duplikat „Rury pole dance": ${pages} stron, ${assigns} przypisań`,
    );
    if (pages === 0 && assigns === 0) {
      await db.productManual.delete({ where: { id: empty.id } });
      console.log(`  ✗ Usunięto pusty duplikat`);
    } else {
      console.log(`  (zostawiam — ma treść lub przypisania)`);
    }
  }

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
