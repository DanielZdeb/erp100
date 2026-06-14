import OrderDetailPage from "../../[id]/page";

export const dynamic = "force-dynamic";

/**
 * Trasa szczegółów zamówienia PL. Renderuje ten sam komponent co
 * `/zamowienia/[id]`, ale URL ma prefix `/zamowienia/z-polski/...`,
 * dzięki czemu sidebar podświetla pozycję „Zamówienia z Polski".
 *
 * Dla pewności komponent w `/zamowienia/[id]` przekierowuje na ten URL gdy
 * zamówienie ma country=POLAND — czyli niezależnie od tego, którym linkiem
 * user trafi, prawidłowy URL i highlight się ustawi.
 */
export default async function Page(props: {
  params: Promise<{ id: string }>;
}) {
  return <OrderDetailPage {...props} />;
}
