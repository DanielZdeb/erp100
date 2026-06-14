import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Stary URL `/produkty/kurierzy` przeniesiony do głównej zakładki Kurierzy.
 * Zachowane jako redirect dla zewnętrznych linków.
 */
export default async function KurierzyRedirectPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const tab = sp.tab === "cennik" ? "cennik" : "kalkulator";
  redirect(`/kurierzy?tab=${tab}`);
}
