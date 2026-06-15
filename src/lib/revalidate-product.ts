import { revalidatePath } from "next/cache";

/**
 * Wszystkie miejsca w UI ktore renderuja produkt / jego zdjecia / metadane.
 * Wolaj po kazdej mutacji ProductImage / Product zeby zmiana z jednej strony
 * (np. AI-gen w /sprzedaz) odswiezala glowne zdjecie w /produkty i odwrotnie.
 */
export function revalidateProductPaths(productId: string) {
  // Karty produktu
  revalidatePath(`/produkty/${productId}`);
  revalidatePath(`/sprzedaz/produkty/${productId}`);
  // Listy produktow (thumbnaile)
  revalidatePath("/produkty");
  revalidatePath("/sprzedaz/produkty");
}
