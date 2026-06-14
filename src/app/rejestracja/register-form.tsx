"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, ImagePlus, X } from "lucide-react";

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

import { registerCompanyAction } from "@/server/actions/auth";

type LogoKind = "color" | "bwOnBlack" | "bwOnWhite";

interface LogoState {
  dataUri: string | null;
  filename: string | null;
}

const EMPTY_LOGO: LogoState = { dataUri: null, filename: null };

/** Konwertuje File → data URI (base64) przez FileReader. */
function readFileAsDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function RegisterForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [logos, setLogos] = useState<Record<LogoKind, LogoState>>({
    color: EMPTY_LOGO,
    bwOnBlack: EMPTY_LOGO,
    bwOnWhite: EMPTY_LOGO,
  });

  async function handleLogoUpload(kind: LogoKind, file: File | null) {
    if (!file) {
      setLogos((prev) => ({ ...prev, [kind]: EMPTY_LOGO }));
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError(`Plik musi być obrazem (PNG/JPG/WEBP/SVG)`);
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError(`Logo: max 2MB (twój: ${(file.size / 1024 / 1024).toFixed(2)}MB)`);
      return;
    }
    setError(null);
    try {
      const dataUri = await readFileAsDataUri(file);
      setLogos((prev) => ({
        ...prev,
        [kind]: { dataUri, filename: file.name },
      }));
    } catch {
      setError("Nie udało się odczytać pliku");
    }
  }

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await registerCompanyAction({
        companyName: formData.get("companyName"),
        companyNip: formData.get("companyNip"),
        websiteUrl: formData.get("websiteUrl"),
        name: formData.get("name"),
        email: formData.get("email"),
        password: formData.get("password"),
        logoColor: logos.color.dataUri,
        logoBwOnBlack: logos.bwOnBlack.dataUri,
        logoBwOnWhite: logos.bwOnWhite.dataUri,
      });
      if (result.ok) {
        router.push("/dashboard");
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="size-5 text-primary" />
          Zarejestruj firmę
        </CardTitle>
        <CardDescription>
          Utwórz konto firmowe — pierwsza osoba staje się administratorem.
          Każda firma ma własne produkty, zamówienia i ustawienia.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={onSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="companyName">Nazwa firmy</Label>
            <Input
              id="companyName"
              name="companyName"
              required
              placeholder="np. ACME sp. z o.o."
              disabled={pending}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="companyNip">NIP (opcjonalnie)</Label>
              <Input
                id="companyNip"
                name="companyNip"
                placeholder="1234567890"
                disabled={pending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="websiteUrl">Strona internetowa</Label>
              <Input
                id="websiteUrl"
                name="websiteUrl"
                placeholder="np. acro4f.com"
                disabled={pending}
              />
            </div>
          </div>

          {/* Logosy firmy — używane w instrukcjach, dokumentach, brandingu */}
          <div className="space-y-2 pt-2">
            <Label className="text-xs uppercase tracking-wider text-slate-500 font-bold">
              Logo firmy (każde max 2MB)
            </Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <LogoUploadBox
                kind="color"
                label="W kolorze"
                hint="główne logo, kolorowe"
                bgClass="bg-white"
                state={logos.color}
                onUpload={(f) => handleLogoUpload("color", f)}
                onClear={() => handleLogoUpload("color", null)}
                disabled={pending}
              />
              <LogoUploadBox
                kind="bwOnBlack"
                label="BW na ciemne"
                hint="białe na czarnym"
                bgClass="bg-slate-900"
                state={logos.bwOnBlack}
                onUpload={(f) => handleLogoUpload("bwOnBlack", f)}
                onClear={() => handleLogoUpload("bwOnBlack", null)}
                disabled={pending}
              />
              <LogoUploadBox
                kind="bwOnWhite"
                label="BW na jasne"
                hint="czarne na białym"
                bgClass="bg-white"
                state={logos.bwOnWhite}
                onUpload={(f) => handleLogoUpload("bwOnWhite", f)}
                onClear={() => handleLogoUpload("bwOnWhite", null)}
                disabled={pending}
              />
            </div>
          </div>

          <div className="pt-2 border-t" />

          <div className="space-y-2">
            <Label htmlFor="name">Imię i nazwisko</Label>
            <Input
              id="name"
              name="name"
              required
              placeholder="Jan Kowalski"
              disabled={pending}
            />
          </div>

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
            <Label htmlFor="password">Hasło (min 8 znaków)</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              disabled={pending}
            />
          </div>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Tworzę firmę…" : "Zarejestruj firmę"}
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground mt-4">
          Masz już konto?{" "}
          <a href="/login" className="text-primary hover:underline">
            Zaloguj się
          </a>
        </p>
      </CardContent>
    </Card>
  );
}

function LogoUploadBox({
  kind,
  label,
  hint,
  bgClass,
  state,
  onUpload,
  onClear,
  disabled,
}: {
  kind: LogoKind;
  label: string;
  hint: string;
  bgClass: string;
  state: LogoState;
  onUpload: (file: File | null) => void;
  onClear: () => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-1">
      <div
        className={`relative rounded-md ring-1 ring-slate-300 ${bgClass} aspect-square flex items-center justify-center overflow-hidden`}
      >
        {state.dataUri ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={state.dataUri}
              alt={label}
              className="max-w-[85%] max-h-[85%] object-contain"
            />
            <button
              type="button"
              onClick={onClear}
              disabled={disabled}
              className="absolute top-1 right-1 size-5 rounded-full bg-rose-600 text-white grid place-items-center hover:bg-rose-700"
              title="Usuń logo"
            >
              <X className="size-3" />
            </button>
          </>
        ) : (
          <label
            className={`w-full h-full flex flex-col items-center justify-center gap-1 cursor-pointer text-[10px] ${
              bgClass === "bg-slate-900" ? "text-slate-300" : "text-slate-500"
            } hover:opacity-80 transition-opacity`}
          >
            <ImagePlus className="size-5" />
            <span>Wybierz plik</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              onChange={(e) => onUpload(e.target.files?.[0] ?? null)}
              disabled={disabled}
              data-kind={kind}
            />
          </label>
        )}
      </div>
      <div className="text-center">
        <div className="text-[11px] font-semibold text-slate-700">{label}</div>
        <div className="text-[9px] text-slate-400">{hint}</div>
      </div>
    </div>
  );
}
