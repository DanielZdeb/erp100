"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";

export async function loginAction(formData: FormData, callbackUrl?: string) {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: callbackUrl ?? "/dashboard",
    });
    return { error: null };
  } catch (e) {
    if (e instanceof AuthError) {
      if (e.type === "CredentialsSignin") {
        return { error: "Nieprawidłowy e-mail lub hasło." };
      }
      return { error: "Nie udało się zalogować." };
    }
    throw e;
  }
}
