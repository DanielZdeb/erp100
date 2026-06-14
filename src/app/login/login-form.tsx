"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { loginAction } from "./actions";

export function LoginForm({
  error,
  callbackUrl,
}: {
  error?: string;
  callbackUrl?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [clientError, setClientError] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setClientError(null);
    startTransition(async () => {
      const result = await loginAction(formData, callbackUrl);
      if (result?.error) setClientError(result.error);
    });
  }

  const displayedError = clientError ?? (error ? mapError(error) : null);

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>ERP firmy</CardTitle>
        <CardDescription>Zaloguj się, aby kontynuować.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={onSubmit} className="space-y-4">
          {displayedError && (
            <Alert variant="destructive">
              <AlertDescription>{displayedError}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              disabled={pending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Hasło</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              disabled={pending}
            />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Logowanie…" : "Zaloguj"}
          </Button>
        </form>
        <p className="text-center text-xs text-muted-foreground mt-4">
          Nie masz jeszcze konta?{" "}
          <a href="/rejestracja" className="text-primary hover:underline">
            Zarejestruj firmę
          </a>
        </p>
      </CardContent>
    </Card>
  );
}

function mapError(code: string) {
  switch (code) {
    case "CredentialsSignin":
      return "Nieprawidłowy e-mail lub hasło.";
    default:
      return "Coś poszło nie tak. Spróbuj jeszcze raz.";
  }
}
