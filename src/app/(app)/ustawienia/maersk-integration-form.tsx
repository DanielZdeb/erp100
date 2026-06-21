"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, EyeOff, Key, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateMaerskApiKeyAction } from "@/server/orders";

function maskKey(k: string): string {
  if (k.length < 12) return "•".repeat(k.length);
  return `${k.slice(0, 6)}${"•".repeat(Math.max(0, k.length - 10))}${k.slice(-4)}`;
}

export function MaerskIntegrationForm({
  initialKey,
}: {
  initialKey: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialKey ?? "");
  const [show, setShow] = useState(false);
  const [pending, startTransition] = useTransition();
  const hasKey = initialKey != null && initialKey.length > 0;

  function save() {
    startTransition(async () => {
      try {
        await updateMaerskApiKeyAction(value || null);
        toast.success(
          value ? "Zapisano klucz Maersk" : "Usunięto klucz Maersk",
        );
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label
          htmlFor="maersk-key"
          className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
        >
          Consumer-Key (Track & Trace Events API)
        </label>
        <div className="relative">
          <Key className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="maersk-key"
            type={show ? "text" : "password"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={
              hasKey
                ? maskKey(initialKey ?? "")
                : "Wklej klucz z developer.maersk.com → My Apps"
            }
            className="pl-8 pr-10 font-mono text-xs"
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => setShow(!show)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            title={show ? "Ukryj" : "Pokaż"}
          >
            {show ? (
              <EyeOff className="size-3.5" />
            ) : (
              <Eye className="size-3.5" />
            )}
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Wpisz klucz raz — będzie zapisany w bazie firmy i używany przez
          przycisk „Pobierz z Maersk" przy każdym kontenerze. Bezpłatny plan:
          100 wywołań/mies. Każde wywołanie = 1 numer kontenera.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          onClick={save}
          disabled={pending || value === (initialKey ?? "")}
          className="gap-1.5"
        >
          {pending && <Loader2 className="size-3.5 animate-spin" />}
          Zapisz klucz
        </Button>
        {hasKey && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setValue("");
              startTransition(async () => {
                try {
                  await updateMaerskApiKeyAction(null);
                  toast.success("Usunięto klucz Maersk");
                  router.refresh();
                } catch (e) {
                  toast.error(
                    e instanceof Error ? e.message : "Nie udało się",
                  );
                }
              });
            }}
            disabled={pending}
            className="text-amber-700"
          >
            Usuń klucz
          </Button>
        )}
        <span
          className={`text-xs font-medium ${hasKey ? "text-emerald-700" : "text-muted-foreground"}`}
        >
          {hasKey ? "✓ Klucz skonfigurowany" : "Brak klucza"}
        </span>
      </div>

      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          Jak zdobyć klucz?
        </summary>
        <ol className="mt-2 ml-4 space-y-1 list-decimal text-muted-foreground">
          <li>
            Wejdź na{" "}
            <a
              href="https://developer.maersk.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              developer.maersk.com
            </a>{" "}
            i zaloguj się
          </li>
          <li>
            Z katalogu API wybierz <strong>Track & Trace Events</strong>
          </li>
          <li>Subskrybuj darmowy plan (100 calls/mies)</li>
          <li>
            Wejdź w <strong>My Apps</strong> → skopiuj{" "}
            <strong>Consumer-Key</strong>
          </li>
          <li>Wklej tutaj i kliknij „Zapisz klucz"</li>
        </ol>
      </details>
    </div>
  );
}
