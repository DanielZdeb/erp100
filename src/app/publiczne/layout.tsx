/**
 * Layout dla publicznych stron (welcome.acro4f.com).
 * Bez chrome ERP — tylko wrapper z jasnym tłem. Nagłówek i footer
 * renderują same podstrony (bo instrukcje mają sticky header ze
 * switcherem języka, home ma inny hero, /zwrot ma jeszcze inny).
 */
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white text-slate-900">{children}</div>
  );
}
