"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Brak autoryzacji");
  return session.user as { id: string; role?: string };
}

const createSchema = z.object({
  name: z.string().trim().min(1, "Imię wymagane").max(100),
  email: z.string().trim().toLowerCase().email("Nieprawidłowy email"),
  password: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  role: z.enum(["ADMIN", "PRACOWNIK"]).optional(),
});

// Wygenerowane haslo, gdy admin nie poda swojego — przekazuje sie osobiscie
// (np. SMS/Slack). Konfiguracje hasel hash 'em jest standardowa bcrypt(10).
function generateRandomPassword(): string {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  // 12 znaków = ok 71 bitow entropii, wystarczy do MVP
  // (uzytkownik powinien zmienic po pierwszym logowaniu)
  const arr = new Uint8Array(12);
  crypto.getRandomValues(arr);
  for (let i = 0; i < arr.length; i++) {
    out += chars[arr[i] % chars.length];
  }
  return out;
}

export async function createTeamMemberAction(input: unknown) {
  await requireUser();
  const companyId = await getCurrentCompanyId();
  const data = createSchema.parse(input);

  // Email globalnie unique — sprawdzamy zanim spróbujemy stworzyć.
  const existing = await db.user.findUnique({
    where: { email: data.email },
    select: { id: true, companyId: true, active: true },
  });
  if (existing) {
    if (existing.companyId === companyId) {
      if (!existing.active) {
        // Reaktywuj zamiast tworzyć nowego — user byl juz w tej firmie.
        await db.user.update({
          where: { id: existing.id },
          data: { active: true, name: data.name },
        });
        revalidatePath("/dashboard");
        return {
          ok: true as const,
          reactivated: true,
          generatedPassword: null,
        };
      }
      throw new Error("Ten użytkownik już jest w zespole");
    }
    throw new Error("Email jest zajęty w innym koncie");
  }

  const passwordPlain = data.password ?? generateRandomPassword();
  const passwordHash = await bcrypt.hash(passwordPlain, 10);

  await db.user.create({
    data: {
      email: data.email,
      name: data.name,
      passwordHash,
      role: data.role ?? "PRACOWNIK",
      companyId,
      active: true,
    },
  });

  revalidatePath("/dashboard");
  return {
    ok: true as const,
    reactivated: false,
    // Jesli admin nie podal hasla, zwracamy wygenerowane do pokazania raz.
    generatedPassword: data.password ? null : passwordPlain,
  };
}

export async function removeTeamMemberAction(userId: string) {
  const me = await requireUser();
  const companyId = await getCurrentCompanyId();

  if (me.id === userId) {
    throw new Error("Nie możesz usunąć siebie z zespołu");
  }

  const target = await db.user.findFirst({
    where: { id: userId, companyId },
    select: { id: true },
  });
  if (!target) throw new Error("Użytkownik nie istnieje w tym zespole");

  // Soft-delete: dezaktywujemy zamiast kasowac — zachowujemy historie
  // (autorstwo zadan, audit log, etc.).
  await db.user.update({
    where: { id: userId },
    data: { active: false },
  });

  revalidatePath("/dashboard");
  return { ok: true as const };
}
