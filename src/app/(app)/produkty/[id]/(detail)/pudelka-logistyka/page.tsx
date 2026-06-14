import { redirect } from "next/navigation";

/**
 * Legacy redirect — sekcja Pudełka i logistyka została podzielona
 * na dwie nowe zakładki: Pakowanie (wysyłkowe + kurierzy) i Import
 * (CN factory + master + bulk). Stare linki domyślnie kierujemy na Pakowanie.
 */
export default async function PudelkaLogistykaRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/produkty/${id}/pakowanie`);
}
