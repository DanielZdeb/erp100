import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/layout/app-sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="flex flex-1 min-h-0">
      <AppSidebar user={session.user} />
      <main className="flex-1 overflow-auto bg-app">{children}</main>
    </div>
  );
}
