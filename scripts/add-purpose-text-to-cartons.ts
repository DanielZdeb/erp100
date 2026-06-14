/**
 * Dodaje `purposeText` (opis przeznaczenia) do utworzonych pudełek ACRO4F.
 * FACTORY (z Chin) — opis kartonu importowego z xlsx
 * SHIPPING (PL) — opis kartonu wysyłkowego do klienta
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

// Klucz: szerokość×wysokość×głębokość (jak utworzono — width=length, height=height, depth=width)
const PURPOSES: Record<
  string,
  { factory: string; shipping: string }
> = {
  "58×32×19": {
    factory: "Przedłużki rury pole dance 50cm — Srebrne, Białe, Multikolor, Różowe (15 szt / karton)",
    shipping: "Wysyłka przedłużek rury pole dance 50cm (do 15 szt)",
  },
  "58×35×22": {
    factory: "Przedłużka rury pole dance 50cm | Czarna (20 szt / karton)",
    shipping: "Wysyłka przedłużki rury pole dance 50cm | Czarna (do 20 szt)",
  },
  "58×24×19": {
    factory: "Przedłużka rury pole dance 50cm | Złota (10 szt / karton)",
    shipping: "Wysyłka przedłużki rury pole dance 50cm | Złota (do 10 szt)",
  },
  "108×40.5×11": {
    factory: "Rura do pole dance — pełny zestaw (1 zestaw / karton): rura + osłona + łożysko + talerz + podstawa + przedłużki",
    shipping: "Wysyłka pełnego zestawu rury pole dance (1 szt)",
  },
  "26.5×41×26.5": {
    factory: "Mocowania sufitowe + akcesoria do hamaków/szarf (10-20 szt / karton): KIDS-SET, AERIALSILK, HS-*, YOGA-SET",
    shipping: "Wysyłka akcesoriów sufitowych (haki, zestawy montażowe)",
  },
  "60×50×40": {
    factory: "Hamak do jogi aerial 4m/5m/6m (12 szt / karton) — wszystkie 14 kolorów",
    shipping: "Wysyłka hamaka do jogi aerial (1 szt)",
  },
  "93.5×93.5×5": {
    factory: "Koło cyrkowe (aerial hoop) Ø85 cm (1 szt / karton) — Czarne, Różowe, Białe",
    shipping: "Wysyłka koła cyrkowego Ø85 cm (1 szt)",
  },
  "98.5×98.5×5": {
    factory: "Koło cyrkowe Ø90 cm (1 szt / karton) — Czarne, Różowe, Białe",
    shipping: "Wysyłka koła cyrkowego Ø90 cm (1 szt)",
  },
  "103.5×103.5×5": {
    factory: "Koło cyrkowe Ø95 cm (1 szt / karton) — Czarne, Różowe, Białe",
    shipping: "Wysyłka koła cyrkowego Ø95 cm (1 szt)",
  },
  "108.5×108.5×5": {
    factory: "Koło cyrkowe Ø100 cm (1 szt / karton) — Czarne, Różowe, Białe",
    shipping: "Wysyłka koła cyrkowego Ø100 cm (1 szt)",
  },
  "113.5×113.5×5": {
    factory: "Koło cyrkowe Ø105 cm (1 szt / karton) — Czarne, Różowe, Białe",
    shipping: "Wysyłka koła cyrkowego Ø105 cm (1 szt)",
  },
  "51×37.5×33": {
    factory: "Taśma owijka do koła cyrkowego 5cm × 5m (196 szt / karton) — Czarne, Fioletowe, Różowe, Białe",
    shipping: "Wysyłka taśm owijek do koła cyrkowego (do 196 szt)",
  },
};

async function main() {
  const company = await db.company.findFirst({
    where: { name: { contains: "ACRO" } },
    select: { id: true },
  });
  if (!company) throw new Error("Brak ACRO4F");

  const boxes = await db.shippingBox.findMany({
    where: {
      companyId: company.id,
      OR: [
        { name: { startsWith: "Karton Chin " } },
        { name: { startsWith: "Karton wysyłkowy " } },
      ],
    },
    select: {
      id: true,
      name: true,
      origin: true,
      widthCm: true,
      heightCm: true,
      depthCm: true,
      purposeText: true,
    },
  });
  console.log(`Pudełka do uzupełnienia: ${boxes.length}`);

  let updated = 0;
  let notFound = 0;
  for (const b of boxes) {
    const key = `${b.widthCm}×${b.heightCm}×${b.depthCm}`;
    const purpose = PURPOSES[key];
    if (!purpose) {
      console.log(`  ⚠ ${b.name}  (klucz ${key}) — brak opisu w mapie`);
      notFound++;
      continue;
    }
    const text =
      b.origin === "CHINA_STANDARD" ? purpose.factory : purpose.shipping;
    await db.shippingBox.update({
      where: { id: b.id },
      data: { purposeText: text },
    });
    console.log(
      `  ✓ ${b.name}  [${b.origin === "CHINA_STANDARD" ? "CHIN" : "PL"}]`,
    );
    console.log(`    → ${text}`);
    updated++;
  }
  console.log(`\nZaktualizowano ${updated}, brak ${notFound}`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
