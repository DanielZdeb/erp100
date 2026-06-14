"use server";

import { promises as fs } from "node:fs";
import path from "node:path";

import bcrypt from "bcryptjs";
import { z } from "zod";

import { signIn, signOut } from "@/auth";
import { db } from "@/lib/db";

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}

/**
 * Logo z formularza rejestracji jako base64 data URI ("data:image/png;base64,...").
 * Akceptujemy JPG/PNG/SVG/WEBP. Max 2MB po dekodowaniu.
 */
const dataUriSchema = z
  .string()
  .nullable()
  .optional()
  .refine(
    (v) =>
      !v ||
      v === "" ||
      /^data:image\/(png|jpe?g|webp|svg\+xml);base64,/.test(v),
    "Logo musi być w formacie PNG/JPG/WEBP/SVG",
  );

const registerSchema = z.object({
  companyName: z.string().min(2, "Nazwa firmy: min 2 znaki"),
  companyNip: z.string().optional().nullable(),
  /** Adres strony internetowej firmy. Opcjonalny, walidowany jako URL gdy podany. */
  websiteUrl: z
    .string()
    .nullable()
    .optional()
    .transform((v) => (v ? v.trim() : null))
    .refine(
      (v) => !v || /^https?:\/\//i.test(v) || /\./.test(v),
      "Adres strony musi być URL (np. https://acro4f.com lub acro4f.com)",
    ),
  /** Logo w kolorze — auto-uzupełniane w nowych instrukcjach. */
  logoColor: dataUriSchema,
  /** Logo BW na ciemne tło. */
  logoBwOnBlack: dataUriSchema,
  /** Logo BW na jasne tło. */
  logoBwOnWhite: dataUriSchema,
  name: z.string().min(2, "Imię i nazwisko: min 2 znaki"),
  email: z.string().email("Nieprawidłowy email"),
  password: z.string().min(8, "Hasło: min 8 znaków"),
});

/** Zapisz base64 logo na dysk i zwróć URL `/uploads/companies/{id}/logo-{kind}.{ext}`.
 *  Zwraca null gdy data jest pusty. */
async function saveLogoDataUri(
  data: string | null | undefined,
  companyId: string,
  kind: "color" | "bw-black" | "bw-white",
): Promise<string | null> {
  if (!data) return null;
  const match = data.match(
    /^data:image\/(png|jpe?g|webp|svg\+xml);base64,(.+)$/,
  );
  if (!match) return null;
  const mime = match[1];
  const ext = mime === "jpeg" ? "jpg" : mime === "svg+xml" ? "svg" : mime;
  const buf = Buffer.from(match[2], "base64");
  if (buf.length > 2 * 1024 * 1024) {
    throw new Error(`Logo ${kind}: max 2MB`);
  }
  const folder = path.join(
    process.cwd(),
    "public",
    "uploads",
    "companies",
    companyId,
  );
  await fs.mkdir(folder, { recursive: true });
  const filename = `logo-${kind}.${ext}`;
  await fs.writeFile(path.join(folder, filename), buf);
  return `/uploads/companies/${companyId}/${filename}`;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Rejestracja nowej firmy + jej pierwszego użytkownika jako ADMIN.
 * Email użytkownika musi być unikalny w całym systemie.
 * Slug firmy generowany z nazwy, w razie kolizji dodajemy suffix.
 */
export async function registerCompanyAction(input: unknown): Promise<
  | { ok: true }
  | { ok: false; error: string }
> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((i) => i.message).join(", "),
    };
  }
  const data = parsed.data;

  // Email-unique-check
  const existing = await db.user.findUnique({ where: { email: data.email } });
  if (existing) {
    return { ok: false, error: "Ten email jest już zarejestrowany." };
  }

  // Slug — z kolizją suffix
  const baseSlug = slugify(data.companyName) || "firma";
  let slug = baseSlug;
  let i = 1;
  while (await db.company.findUnique({ where: { slug } })) {
    i += 1;
    slug = `${baseSlug}-${i}`;
  }

  // Tworzymy firmę + usera w jednej transakcji.
  const hash = await bcrypt.hash(data.password, 10);
  let createdCompanyId: string;
  await db.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: {
        name: data.companyName,
        slug,
        nip: data.companyNip?.trim() || null,
        websiteUrl: data.websiteUrl,
      },
    });
    createdCompanyId = company.id;
    await tx.user.create({
      data: {
        email: data.email,
        passwordHash: hash,
        name: data.name,
        role: "ADMIN",
        companyId: company.id,
      },
    });
  });

  // Zapisz logosy poza transakcją (FS operations) i update Company.
  try {
    const [colorUrl, bwBlackUrl, bwWhiteUrl] = await Promise.all([
      saveLogoDataUri(data.logoColor, createdCompanyId!, "color"),
      saveLogoDataUri(data.logoBwOnBlack, createdCompanyId!, "bw-black"),
      saveLogoDataUri(data.logoBwOnWhite, createdCompanyId!, "bw-white"),
    ]);
    if (colorUrl || bwBlackUrl || bwWhiteUrl) {
      await db.company.update({
        where: { id: createdCompanyId! },
        data: {
          logoColorUrl: colorUrl,
          logoBwOnBlackUrl: bwBlackUrl,
          logoBwOnWhiteUrl: bwWhiteUrl,
        },
      });
    }
  } catch (e) {
    // Logo errory nie powinny blokować rejestracji — user może zaktualizować
    // później w ustawieniach firmy. Logujemy i kontynuujemy.
    console.error("Failed to save company logos:", e);
  }

  // Auto-login
  await signIn("credentials", {
    email: data.email,
    password: data.password,
    redirect: false,
  });

  return { ok: true };
}
