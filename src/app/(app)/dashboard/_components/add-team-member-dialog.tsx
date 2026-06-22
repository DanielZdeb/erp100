"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Copy, Eye, EyeOff, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { createTeamMemberAction } from "@/server/team-members";

export function AddTeamMemberDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"ADMIN" | "PRACOWNIK">("PRACOWNIK");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, startTransition] = useTransition();
  // Po stworzeniu pokazujemy haslo wygenerowane — adminem musi je zanotowac/przekazac.
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(
    null,
  );
  const [copied, setCopied] = useState(false);

  function reset() {
    setName("");
    setEmail("");
    setPassword("");
    setRole("PRACOWNIK");
    setShowPassword(false);
    setGeneratedPassword(null);
    setCopied(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function submit() {
    if (!name.trim()) {
      toast.error("Podaj imię i nazwisko");
      return;
    }
    if (!email.trim()) {
      toast.error("Podaj email");
      return;
    }
    startTransition(async () => {
      try {
        const r = await createTeamMemberAction({
          name: name.trim(),
          email: email.trim(),
          password: password || null,
          role,
        });
        if (r.reactivated) {
          toast.success("Reaktywowano osobę w zespole");
          router.refresh();
          handleClose();
          return;
        }
        if (r.generatedPassword) {
          // Pokazujemy ekran z wygenerowanym haslem — admin musi je przepisac
          setGeneratedPassword(r.generatedPassword);
          toast.success("Dodano osobę. Skopiuj hasło i przekaż jej.");
          router.refresh();
        } else {
          toast.success("Dodano osobę do zespołu");
          router.refresh();
          handleClose();
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  function copyPassword() {
    if (!generatedPassword) return;
    navigator.clipboard.writeText(generatedPassword).then(() => {
      setCopied(true);
      toast.success("Skopiowano");
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="size-4 text-violet-600" />
            Dodaj osobę do zespołu
          </DialogTitle>
        </DialogHeader>

        {/* Ekran wygenerowanego hasla — admin musi je przekazac osobie */}
        {generatedPassword ? (
          <div className="space-y-4 py-3">
            <div className="text-sm text-emerald-800 bg-emerald-50 ring-1 ring-emerald-200 rounded-md p-3">
              ✓ Konto utworzone. Przekaż osobie poniższe hasło — to ostatni
              moment kiedy je widzisz.
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide">
                Wygenerowane hasło
              </Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-md ring-1 ring-slate-300 bg-slate-50 px-3 py-2 text-sm font-mono tracking-wide tabular-nums">
                  {generatedPassword}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={copyPassword}
                  className="shrink-0 gap-1.5"
                >
                  {copied ? (
                    <Check className="size-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                  {copied ? "Skopiowano" : "Kopiuj"}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Osoba powinna zmienić hasło po pierwszym zalogowaniu.
              </p>
            </div>
            <DialogFooter>
              <Button type="button" onClick={handleClose}>
                Gotowe
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label
                  htmlFor="member-name"
                  className="text-xs uppercase tracking-wide"
                >
                  Imię i nazwisko
                </Label>
                <Input
                  id="member-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="np. Jan Kowalski"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor="member-email"
                  className="text-xs uppercase tracking-wide"
                >
                  Email
                </Label>
                <Input
                  id="member-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jan@firma.pl"
                />
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor="member-pass"
                  className="text-xs uppercase tracking-wide"
                >
                  Hasło{" "}
                  <span className="font-normal text-muted-foreground normal-case tracking-normal">
                    (puste = wygeneruję losowe)
                  </span>
                </Label>
                <div className="relative">
                  <Input
                    id="member-pass"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="zostaw puste"
                    className="pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    title={showPassword ? "Ukryj" : "Pokaż"}
                  >
                    {showPassword ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wide">
                  Rola
                </Label>
                <div className="flex gap-2">
                  {(["PRACOWNIK", "ADMIN"] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRole(r)}
                      className={cn(
                        "flex-1 rounded-md ring-1 px-3 py-2 text-sm font-medium transition-colors",
                        role === r
                          ? "bg-violet-600 text-white ring-violet-600"
                          : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50",
                      )}
                    >
                      {r === "PRACOWNIK" ? "Pracownik" : "Admin"}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Admin zarządza całym ERP-em, pracownik — operacyjnie.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={pending}
              >
                Anuluj
              </Button>
              <Button type="button" onClick={submit} disabled={pending}>
                {pending ? "Dodaję…" : "Dodaj osobę"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
