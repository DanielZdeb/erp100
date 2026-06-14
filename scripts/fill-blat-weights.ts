/**
 * Masowe uzupełnienie wag i wymiarów dla blatów.
 *
 * Strategia:
 *  - Filtruj produkty z prefiksem "Blat " w nazwie
 *  - Parsuj wymiary z nazwy: "Blat WxDxH materiał" (W, D w cm; H grubość w cm)
 *  - Wykryj materiał (decyduje o gęstości):
 *      • dąb (craft / sonoma / naturalny) → 720 kg/m³
 *      • biały / szary / antracyt → MDF lakierowany → 750 kg/m³
 *  - Oblicz wagę: V (m³) × ρ = (W × D × H / 1000000) × density (kg/m³) [kg]
 *  - Zapisz: widthCm, depthCm, heightCm, weightKg
 *
 * Pomijamy BUNDLE-* (zestawy biurek) — to nie blaty same w sobie.
 *
 * Idempotent: powtórne uruchomienie nadpisze tymi samymi wartościami.
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

// Gęstości w kg/m³
const DENSITY_OAK = 720; // Dąb naturalny przy 12% wilgotności
const DENSITY_MDF = 750; // MDF laminowany / lakierowany (kolory)

/** "Blat 140x70x2,5 ..." → { W: 140, D: 70, H: 2.5 }, albo null. */
function parseDimensions(name: string): { W: number; D: number; H: number } | null {
  // 140x70x2,5 lub 140x70x2.5 (akceptujemy oba separatory dziesiętne)
  const m = name.match(/Blat\s+(\d+(?:[.,]\d+)?)x(\d+(?:[.,]\d+)?)x(\d+(?:[.,]\d+)?)/i);
  if (!m) return null;
  const W = parseFloat(m[1].replace(",", "."));
  const D = parseFloat(m[2].replace(",", "."));
  const H = parseFloat(m[3].replace(",", "."));
  if (!Number.isFinite(W) || !Number.isFinite(D) || !Number.isFinite(H)) return null;
  return { W, D, H };
}

/** Detect material po fragmentach nazwy. */
function detectMaterial(name: string): "OAK" | "MDF" | null {
  const n = name.toLowerCase();
  // Dąb — explicit name lub suffix DC/DS/DN
  if (
    n.includes("dąb") ||
    /\b(?:dc|ds|dn)\b/i.test(name) ||
    name.endsWith("-DC") ||
    name.endsWith("-DS") ||
    name.endsWith("-DN")
  ) {
    return "OAK";
  }
  // MDF — kolory
  if (
    n.includes("biały") ||
    n.includes("szary") ||
    n.includes("antracyt") ||
    /\b(?:b|sz|a)\b/i.test(name) ||
    name.endsWith("-B") ||
    name.endsWith("-SZ") ||
    name.endsWith("-A")
  ) {
    return "MDF";
  }
  return null;
}

async function main() {
  const products = await db.product.findMany({
    where: {
      AND: [
        { name: { startsWith: "Blat ", mode: "insensitive" } },
        { productCode: { not: { startsWith: "BUNDLE-" } } },
      ],
    },
    select: { id: true, name: true, productCode: true, weightKg: true },
  });
  console.log(`Znaleziono ${products.length} blatów do przetworzenia.\n`);

  let oakCount = 0;
  let mdfCount = 0;
  let skipped = 0;
  let totalWeight = 0;
  const updates: { id: string; widthCm: number; depthCm: number; heightCm: number; weightKg: number; material: "OAK" | "MDF"; productCode: string }[] = [];

  for (const p of products) {
    const dims = parseDimensions(p.name);
    if (!dims) {
      console.log(`  SKIP ${p.productCode}: nie sparsowane wymiary z "${p.name}"`);
      skipped++;
      continue;
    }
    const material = detectMaterial(p.name);
    if (!material) {
      console.log(`  SKIP ${p.productCode}: nie wykryty materiał z "${p.name}"`);
      skipped++;
      continue;
    }
    const density = material === "OAK" ? DENSITY_OAK : DENSITY_MDF;
    // Objętość m³ z cm³ → /1e6. Waga kg = V × ρ.
    const volumeM3 = (dims.W * dims.D * dims.H) / 1_000_000;
    const weightKg = Math.round(volumeM3 * density * 100) / 100; // 2 miejsca

    updates.push({
      id: p.id,
      widthCm: dims.W,
      depthCm: dims.D,
      heightCm: dims.H,
      weightKg,
      material,
      productCode: p.productCode,
    });
    totalWeight += weightKg;
    if (material === "OAK") oakCount++;
    else mdfCount++;
  }

  console.log("\nPodsumowanie:");
  console.log(`  Dąb (720 kg/m³): ${oakCount}`);
  console.log(`  MDF (750 kg/m³): ${mdfCount}`);
  console.log(`  Pominięte:       ${skipped}`);
  console.log(`  Łączna waga:     ${totalWeight.toFixed(2)} kg`);
  console.log(`  Średnia waga:    ${(totalWeight / updates.length).toFixed(2)} kg\n`);

  console.log("Przykłady (pierwsze 8):");
  for (const u of updates.slice(0, 8)) {
    console.log(
      `  ${u.productCode} (${u.material}): ${u.widthCm}×${u.depthCm}×${u.heightCm}cm → ${u.weightKg}kg`,
    );
  }

  // Zapisz
  console.log(`\nZapisuję ${updates.length} produktów…`);
  for (const u of updates) {
    await db.product.update({
      where: { id: u.id },
      data: {
        widthCm: u.widthCm,
        depthCm: u.depthCm,
        heightCm: u.heightCm,
        weightKg: u.weightKg,
      },
    });
  }
  console.log(`✓ Zapisano ${updates.length} produktów.`);
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
