/**
 * Jednorazowy skrypt tworzący konto dla drugiej firmy: ACRO4F SP. Z O.O.
 *
 * Strategia:
 *  - kopiuje passwordHash z istniejącego konta zdebu.pl@gmail.com (skoro user
 *    chce takie samo hasło)
 *  - tworzy nową firmę Company + nowego usera ADMIN powiązanego z tą firmą
 *  - idempotentny: jeśli firma/user już istnieje, kończy bez błędu
 *
 * Uruchomienie: npx tsx prisma/create-acro4f-account.ts
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const SOURCE_USER_EMAIL = "zdebu.pl@gmail.com";

const NEW_COMPANY = {
  name: "ACRO4F SP. Z O.O.",
  slug: "acro4f",
  nip: "7011175385",
  address:
    "Stefana Batorego 18/108, 02-591 Warszawa, Polska | KRS: 0001069642 | REGON: 526980646",
};

const NEW_USER = {
  email: "contact@acro4f.com",
  name: "ACRO4F Administrator",
  role: "ADMIN" as const,
};

async function main() {
  const source = await db.user.findUnique({
    where: { email: SOURCE_USER_EMAIL },
    select: { passwordHash: true },
  });
  if (!source) {
    console.error(
      `Źródłowy user (${SOURCE_USER_EMAIL}) nie istnieje — nie mogę skopiować hasła.`,
    );
    process.exit(1);
  }

  const existingUser = await db.user.findUnique({
    where: { email: NEW_USER.email },
  });
  if (existingUser) {
    console.log(`User ${NEW_USER.email} już istnieje — pomijam.`);
    await db.$disconnect();
    return;
  }

  const existingCompany = await db.company.findUnique({
    where: { slug: NEW_COMPANY.slug },
  });
  const company =
    existingCompany ??
    (await db.company.create({
      data: {
        name: NEW_COMPANY.name,
        slug: NEW_COMPANY.slug,
        nip: NEW_COMPANY.nip,
        address: NEW_COMPANY.address,
      },
    }));
  if (existingCompany) {
    console.log(`Firma ${NEW_COMPANY.slug} już istnieje — używam istniejącej.`);
  } else {
    console.log(`Utworzono firmę: ${company.name} (id=${company.id})`);
  }

  const user = await db.user.create({
    data: {
      email: NEW_USER.email,
      name: NEW_USER.name,
      role: NEW_USER.role,
      passwordHash: source.passwordHash,
      companyId: company.id,
    },
  });
  console.log(
    `Utworzono usera: ${user.email} (id=${user.id}, role=${user.role}, hasło = takie samo jak na koncie ${SOURCE_USER_EMAIL}).`,
  );

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
