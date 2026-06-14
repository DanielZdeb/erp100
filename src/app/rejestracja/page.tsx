import { auth } from "@/auth";
import { redirect } from "next/navigation";

import { RegisterForm } from "./register-form";

export default async function RejestracjaPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <div className="flex flex-1 items-center justify-center bg-muted/40 p-4">
      <RegisterForm />
    </div>
  );
}
