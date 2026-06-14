/**
 * Przypisuje karton wysyłkowy „katron na nowe szafrt" jako wspólny karton
 * (`bundleShippingMode = SINGLE_CARTON`) wszystkim szarfom-zestawom
 * (CN, AS-{6,7,8}M-{COLOR}, compositionMode = ZESTAW).
 *
 * Bez --apply: dry-run.
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const BUNDLE_BOX_NAME = "katron na nowe szafrt";

async function main() {
  const apply = process.argv.includes("--apply");

  const box = await db.shippingBox.findFirst({
    where: { name: BUNDLE_BOX_NAME, archived: false },
    select: { id: true, name: true, widthCm: true, heightCm: true, depthCm: true },
  });
  if (!box) {
    console.error(`[!] Brak pudełka „${BUNDLE_BOX_NAME}" w bibliotece.`);
    return;
  }
  console.log(
    `Pudełko: ${box.name} (${box.widthCm}x${box.heightCm}x${box.depthCm} cm) [${box.id}]\n`,
  );

  const szarfy = await db.product.findMany({
    where: {
      productCode: { startsWith: "AS-" },
      NOT: [{ productCode: { startsWith: "AS-150-" } }],
      compositionMode: "ZESTAW",
    },
    select: {
      id: true,
      productCode: true,
      name: true,
      bundleShippingMode: true,
      bundleShippingBoxId: true,
    },
    orderBy: { productCode: "asc" },
  });

  console.log(`Znaleziono ${szarfy.length} szarf-zestawów (ZESTAW mode).\n`);

  let toUpdate = 0;
  let alreadyOk = 0;
  for (const sz of szarfy) {
    const isOk =
      sz.bundleShippingMode === "SINGLE_CARTON" &&
      sz.bundleShippingBoxId === box.id;
    if (isOk) {
      console.log(`  [OK]    ${sz.productCode}`);
      alreadyOk++;
      continue;
    }
    const prevLabel = sz.bundleShippingBoxId
      ? `${sz.bundleShippingMode ?? "—"}/${sz.bundleShippingBoxId.slice(-8)}`
      : `${sz.bundleShippingMode ?? "—"}/—`;
    console.log(`  [SET]   ${sz.productCode}  (było: ${prevLabel})`);
    toUpdate++;
    if (!apply) continue;
    await db.product.update({
      where: { id: sz.id },
      data: {
        bundleShippingMode: "SINGLE_CARTON",
        bundleShippingBoxId: box.id,
      },
    });
  }

  console.log(
    `\nPodsumowanie: ${toUpdate} do zmiany, ${alreadyOk} już skonfigurowane.`,
  );
  if (!apply) {
    console.log(
      "\nTO BYŁ DRY-RUN. Aby zapisać: npx tsx scripts/assign-szarfy-bundle-box.ts --apply",
    );
  }
}

main()
  .catch((e) => console.error(e))
  .finally(() => db.$disconnect());
