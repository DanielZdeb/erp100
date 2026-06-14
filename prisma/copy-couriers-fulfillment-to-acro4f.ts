/**
 * Kopiuje dane "wspólne dla firmy" z firmy źródłowej (zdebu.pl@gmail.com)
 * do ACRO4F. Cel: ACRO4F startuje z czystym katalogiem produktów/kategorii/
 * kartonów, ale przejmuje:
 *   - Kurierów (Courier)
 *   - Umowy kurierskie (CourierContract)
 *   - Stawki kurierskie (CourierRate)
 *   - Widełki prowizji pośrednika (BrokerCommissionTier)
 *   - Ustawienia fulfillmentowe (SystemConfig — wszystkie klucze)
 *
 * Idempotentny: gdy w ACRO4F są już kurierzy → pomija sekcję. Gdy klucz
 * SystemConfig już istnieje → nie nadpisuje.
 *
 * Uruchomienie: npx tsx prisma/copy-couriers-fulfillment-to-acro4f.ts
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
const TARGET_COMPANY_SLUG = "acro4f";

async function main() {
  // 1. Znajdź sourceCompanyId po userze
  const sourceUser = await db.user.findUnique({
    where: { email: SOURCE_USER_EMAIL },
    select: { companyId: true, company: { select: { name: true } } },
  });
  if (!sourceUser?.companyId) {
    console.error(
      `Źródłowy user (${SOURCE_USER_EMAIL}) nie ma przypisanej firmy.`,
    );
    process.exit(1);
  }
  const sourceCompanyId = sourceUser.companyId;
  console.log(
    `Źródło: ${sourceUser.company?.name} (companyId=${sourceCompanyId})`,
  );

  // 2. Znajdź targetCompanyId po slugu
  const targetCompany = await db.company.findUnique({
    where: { slug: TARGET_COMPANY_SLUG },
    select: { id: true, name: true },
  });
  if (!targetCompany) {
    console.error(`Docelowa firma (slug=${TARGET_COMPANY_SLUG}) nie istnieje.`);
    process.exit(1);
  }
  const targetCompanyId = targetCompany.id;
  console.log(`Cel: ${targetCompany.name} (companyId=${targetCompanyId})`);

  if (sourceCompanyId === targetCompanyId) {
    console.error("Źródło == cel — nic do zrobienia.");
    process.exit(1);
  }

  // ── KURIERZY + UMOWY + STAWKI ─────────────────────────────────────
  const existingCouriers = await db.courier.count({
    where: { companyId: targetCompanyId },
  });
  if (existingCouriers > 0) {
    console.log(
      `[Kurierzy] ACRO4F ma już ${existingCouriers} kurier(ów) — pomijam sekcję.`,
    );
  } else {
    const sourceCouriers = await db.courier.findMany({
      where: { companyId: sourceCompanyId },
      include: {
        contracts: true,
        rates: true,
      },
    });
    console.log(
      `[Kurierzy] Kopiuję ${sourceCouriers.length} kurier(ów) ze źródła…`,
    );
    let courierCount = 0;
    let contractCount = 0;
    let rateCount = 0;
    for (const src of sourceCouriers) {
      const newCourier = await db.courier.create({
        data: {
          companyId: targetCompanyId,
          name: src.name,
          active: src.active,
          notes: src.notes,
        },
      });
      courierCount++;
      for (const c of src.contracts) {
        await db.courierContract.create({
          data: {
            courierId: newCourier.id,
            startsAt: c.startsAt,
            endsAt: c.endsAt,
            fileUrl: c.fileUrl,
            filename: c.filename,
            notes: c.notes,
          },
        });
        contractCount++;
      }
      for (const r of src.rates) {
        await db.courierRate.create({
          data: {
            courierId: newCourier.id,
            serviceType: r.serviceType,
            maxWeightKg: r.maxWeightKg,
            maxLengthCm: r.maxLengthCm,
            maxWidthCm: r.maxWidthCm,
            maxHeightCm: r.maxHeightCm,
            maxSumDimsCm: r.maxSumDimsCm,
            isPaczkomat: r.isPaczkomat,
            pricePln: r.pricePln,
            validFrom: r.validFrom,
            validTo: r.validTo,
            notes: r.notes,
          },
        });
        rateCount++;
      }
    }
    console.log(
      `[Kurierzy] Skopiowano: ${courierCount} kurierów, ${contractCount} umów, ${rateCount} stawek.`,
    );
  }

  // ── WIDEŁKI PROWIZJI POŚREDNIKA ──────────────────────────────────
  const existingTiers = await db.brokerCommissionTier.count({
    where: { companyId: targetCompanyId },
  });
  if (existingTiers > 0) {
    console.log(
      `[Broker tiers] ACRO4F ma już ${existingTiers} wpis(ów) — pomijam.`,
    );
  } else {
    const sourceTiers = await db.brokerCommissionTier.findMany({
      where: { companyId: sourceCompanyId },
    });
    for (const t of sourceTiers) {
      await db.brokerCommissionTier.create({
        data: {
          companyId: targetCompanyId,
          brokerName: t.brokerName,
          minValueUsd: t.minValueUsd,
          maxValueUsd: t.maxValueUsd,
          ratePct: t.ratePct,
          flatPln: t.flatPln,
          individual: t.individual,
          sortOrder: t.sortOrder,
        },
      });
    }
    console.log(`[Broker tiers] Skopiowano ${sourceTiers.length} wpis(ów).`);
  }

  // ── SYSTEM CONFIG (fulfillment + reszta key-value) ───────────────
  const sourceConfigs = await db.systemConfig.findMany({
    where: { companyId: sourceCompanyId },
  });
  let configCopied = 0;
  let configSkipped = 0;
  for (const cfg of sourceConfigs) {
    const exists = await db.systemConfig.findUnique({
      where: { companyId_key: { companyId: targetCompanyId, key: cfg.key } },
    });
    if (exists) {
      configSkipped++;
      continue;
    }
    await db.systemConfig.create({
      data: {
        companyId: targetCompanyId,
        key: cfg.key,
        value: cfg.value,
      },
    });
    configCopied++;
  }
  console.log(
    `[SystemConfig] Skopiowano: ${configCopied}, pominięto (już istniało): ${configSkipped}.`,
  );

  await db.$disconnect();
  console.log("\n✔ Kopiowanie zakończone.");
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
