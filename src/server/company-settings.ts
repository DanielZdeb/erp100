"use server";

import { promises as fs } from "node:fs";
import path from "node:path";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getCurrentCompanyId, tryGetCurrentCompanyId } from "@/lib/tenant";

async function requireUser() {
  const session = await auth();
  if (!session?.user) throw new Error("Brak autoryzacji");
  return session.user;
}

/**
 * Ustawienia firmy — feature flagi (Komponenty/Zestawy) i inne ustawienia
 * specyficzne dla scope'u firmy. Czytane raz, cache'owane przez Next w renderze.
 */
export interface CompanyFeatureFlags {
  componentsEnabled: boolean;
}

export async function getCompanyFeatureFlags(): Promise<CompanyFeatureFlags> {
  const companyId = await tryGetCurrentCompanyId();
  if (!companyId) {
    // Brak firmy = wszystko domyślnie włączone (np. dla widoków publicznych).
    return { componentsEnabled: true };
  }
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { componentsEnabled: true },
  });
  return {
    componentsEnabled: company?.componentsEnabled ?? true,
  };
}

export async function setComponentsEnabledAction(
  enabled: boolean,
): Promise<{ ok: true }> {
  await requireUser();
  const companyId = await getCurrentCompanyId();
  await db.company.update({
    where: { id: companyId },
    data: { componentsEnabled: enabled },
  });
  revalidatePath("/ustawienia");
  revalidatePath("/produkty");
  return { ok: true };
}

// ─── Branding firmy — strona internetowa + logosy ──────────────────────

const websiteSchema = z.object({
  websiteUrl: z
    .string()
    .nullable()
    .optional()
    .transform((v) => (v ? v.trim() || null : null)),
});

export async function updateCompanyWebsiteAction(input: unknown) {
  await requireUser();
  const companyId = await getCurrentCompanyId();
  const { websiteUrl } = websiteSchema.parse(input);
  await db.company.update({
    where: { id: companyId },
    data: { websiteUrl },
  });
  revalidatePath("/moje-konto");
  return { ok: true as const };
}

const companyInfoSchema = z.object({
  name: z.string().min(1, "Podaj nazwę firmy").trim(),
  street: z.string().nullable().optional().transform((v) => v?.trim() || null),
  postalCode: z
    .string()
    .nullable()
    .optional()
    .transform((v) => v?.trim() || null),
  city: z.string().nullable().optional().transform((v) => v?.trim() || null),
  nip: z.string().nullable().optional().transform((v) => v?.trim() || null),
  krs: z.string().nullable().optional().transform((v) => v?.trim() || null),
  representativeName: z
    .string()
    .nullable()
    .optional()
    .transform((v) => v?.trim() || null),
  deliveryAddress: z
    .string()
    .nullable()
    .optional()
    .transform((v) => v?.trim() || null),
});

export async function updateCompanyInfoAction(input: unknown) {
  await requireUser();
  const companyId = await getCurrentCompanyId();
  const data = companyInfoSchema.parse(input);
  await db.company.update({
    where: { id: companyId },
    data,
  });
  revalidatePath("/ustawienia");
  revalidatePath("/moje-konto");
  return { ok: true as const };
}

const logoKindSchema = z.enum(["color", "bw-black", "bw-white"]);
type LogoKindT = z.infer<typeof logoKindSchema>;

/**
 * Parser data URI bez regexa — regex z greedy `(.+)` wybucha „Maximum call
 * stack size exceeded" na większych stringach base64. Akceptujemy png/jpg/
 * webp/svg+xml.
 */
function parseLogoDataUri(
  dataUri: string,
): { mime: string; base64: string } | null {
  const allowed = ["png", "jpeg", "jpg", "webp", "svg+xml"];
  if (!dataUri.startsWith("data:image/")) return null;
  const semiIdx = dataUri.indexOf(";", 11);
  if (semiIdx < 0) return null;
  const mimeSuffix = dataUri.slice(11, semiIdx).toLowerCase();
  if (!allowed.includes(mimeSuffix)) return null;
  const headerEnd = dataUri.indexOf(",", semiIdx);
  if (headerEnd < 0) return null;
  if (dataUri.slice(semiIdx + 1, headerEnd) !== "base64") return null;
  return {
    mime: mimeSuffix === "jpg" ? "jpeg" : mimeSuffix,
    base64: dataUri.slice(headerEnd + 1),
  };
}

/** Wgraj logo firmy (base64) i zapisz URL w DB. */
export async function uploadCompanyLogoAction(input: {
  kind: LogoKindT;
  dataUri: string;
}): Promise<{ ok: true; url: string }> {
  await requireUser();
  const companyId = await getCurrentCompanyId();
  const kind = logoKindSchema.parse(input.kind);
  const parsed = parseLogoDataUri(input.dataUri);
  if (!parsed) throw new Error("Logo musi być w formacie PNG/JPG/WEBP/SVG");
  const mime = parsed.mime;
  const ext = mime === "jpeg" ? "jpg" : mime === "svg+xml" ? "svg" : mime;
  const buf = Buffer.from(parsed.base64, "base64");
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
  const url = `/uploads/companies/${companyId}/${filename}`;

  // Update odpowiednie pole na company
  const field =
    kind === "color"
      ? "logoColorUrl"
      : kind === "bw-black"
        ? "logoBwOnBlackUrl"
        : "logoBwOnWhiteUrl";
  await db.company.update({
    where: { id: companyId },
    data: { [field]: url },
  });

  revalidatePath("/moje-konto");
  return { ok: true as const, url };
}

/** Usuń logo firmy (DB + plik). */
export async function removeCompanyLogoAction(input: {
  kind: LogoKindT;
}): Promise<{ ok: true }> {
  await requireUser();
  const companyId = await getCurrentCompanyId();
  const kind = logoKindSchema.parse(input.kind);
  const field =
    kind === "color"
      ? "logoColorUrl"
      : kind === "bw-black"
        ? "logoBwOnBlackUrl"
        : "logoBwOnWhiteUrl";

  // Pobierz aktualny URL żeby usunąć plik
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { [field]: true },
  });
  const currentUrl = company?.[field] as string | null | undefined;

  await db.company.update({
    where: { id: companyId },
    data: { [field]: null },
  });

  if (currentUrl?.startsWith("/uploads/")) {
    const filePath = path.join(
      process.cwd(),
      "public",
      currentUrl.replace(/^\//, ""),
    );
    await fs.unlink(filePath).catch(() => undefined);
  }

  revalidatePath("/moje-konto");
  return { ok: true as const };
}
