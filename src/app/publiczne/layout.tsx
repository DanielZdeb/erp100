/**
 * Layout dla publicznych stron (instrukcje otwierane z QR).
 * Bez wewnętrznego chrome ERP — tylko minimalistyczny wrapper.
 * Dynamikę/cache ustala każda podstrona (page.tsx) osobno.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-white text-slate-900">{children}</div>;
}
