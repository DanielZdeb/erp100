/** Test wyceny InPost Kurier dla paczki 76×73×25 cm.
 *  User raportuje że system traktuje to jako dłużycowy — sprawdzamy logikę. */

import { priceInPostAllServices } from "../erp-firma/src/lib/courier-pricing/inpost";
import { detectNstInpost } from "../erp-firma/src/lib/courier-pricing/nst";

const pkg = { widthCm: 76, heightCm: 73, depthCm: 25, weightKg: 10 };

console.log("=== Test paczki 76×73×25 cm × 10 kg ===\n");

const sumDims = pkg.widthCm + pkg.heightCm + pkg.depthCm;
const dimWeight = (pkg.widthCm * pkg.heightCm * pkg.depthCm) / 4000;
console.log(`Suma wymiarów: ${sumDims} cm  (InPost limit max 220 cm)`);
console.log(`Najdłuższy bok: ${Math.max(pkg.widthCm, pkg.heightCm, pkg.depthCm)} cm  (dłużycowy >120 cm)`);
console.log(`Waga gabarytowa: ${dimWeight.toFixed(2)} kg`);
console.log(`Waga rzeczywista: ${pkg.weightKg} kg`);
console.log(`Wyższa z dwóch (charge): ${Math.max(pkg.weightKg, dimWeight).toFixed(2)} kg`);

console.log(`\n=== detectNstInpost ===`);
const nst = detectNstInpost(pkg);
console.log(`  isNonStandard: ${nst.isNonStandard}`);
console.log(`  isDluzycowy:   ${nst.isDluzycowy}`);
console.log(`  reasons: ${nst.reasons.join("; ") || "(brak)"}`);

console.log(`\n=== priceInPostAllServices ===`);
const services = priceInPostAllServices([pkg], { fuelSurcharge: true });
for (const s of services) {
  if (s.serviceCode !== "INPOST_KURIER_STANDARD") continue;
  console.log(`${s.serviceLabel}:`);
  console.log(`  applicable: ${s.applicable}`);
  console.log(`  basePricePln: ${s.basePricePln}`);
  console.log(`  fuelSurchargePln: ${s.fuelSurchargePln}`);
  console.log(`  surchargesPln: ${s.surchargesPln}`);
  console.log(`  totalNetPln: ${s.totalNetPln}`);
  console.log(`  Breakdown:`);
  for (const b of s.breakdown) {
    console.log(`    ${b.label}: ${b.pln} zł`);
  }
  console.log(`  Reasons: ${s.reasons.join("; ") || "(brak)"}`);
}
