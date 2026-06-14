import { redirect } from "next/navigation";

/**
 * Legacy redirect — sekcja Ceny została zintegrowana z Podstawowe.
 * Stare linki przekierowujemy żeby nic nie pękło.
 */
export default async function CenyRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/produkty/${id}/podstawowe`);
}
