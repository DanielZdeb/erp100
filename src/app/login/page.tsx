import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  const params = await searchParams;
  return (
    <div className="flex flex-1 items-center justify-center bg-muted/40 p-4">
      <LoginForm error={params.error} callbackUrl={params.callbackUrl} />
    </div>
  );
}
