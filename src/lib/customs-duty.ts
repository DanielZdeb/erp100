/**
 * Resolver cła importowego z hierarchii produkt → kategoria → parent → grandparent.
 * Pierwsze niezerowe wystąpienie wygrywa.
 *
 * Używany w:
 *  - zamowienia/[id]/page.tsx (główna kalkulacja kontenera)
 *  - produkty/page.tsx (snapshot landed/szt z ostatniego zamówienia per produkt)
 *  - dashboard/innych widokach które używają `kalkulujKontener`
 *
 * Dzięki wspólnemu helperowi nie ma rozjazdu między miejscami liczenia cła.
 */

export type ProductDutySource = {
  customsDutyPct: number | null;
  category: {
    customsDutyPct: number | null;
    parent: {
      customsDutyPct: number | null;
      parent: { customsDutyPct: number | null } | null;
    } | null;
  } | null;
};

export function resolveCustomsDutyPct(p: ProductDutySource): number | null {
  if (p.customsDutyPct != null) return p.customsDutyPct;
  const cat = p.category;
  if (cat?.customsDutyPct != null) return cat.customsDutyPct;
  if (cat?.parent?.customsDutyPct != null) return cat.parent.customsDutyPct;
  if (cat?.parent?.parent?.customsDutyPct != null) {
    return cat.parent.parent.customsDutyPct;
  }
  return null;
}
