"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";
import { slugify } from "@/lib/slug";

const categorySchema = z.object({
  name: z.string().min(1, "Podaj nazwę"),
  parentId: z.string().nullable().optional(),
  level: z.coerce.number().int().min(1).max(3).optional(),
  sortOrder: z.coerce.number().int().optional(),
  /** Stawka cła w % (0..100) — wpisywana przez usera; konwertujemy na 0..1. */
  customsDutyPct: z.coerce.number().min(0).max(100).nullable().optional(),
  /** Prowizja Allegro % (0..100), konwertujemy na 0..1. */
  commissionPctAllegro: z.coerce.number().min(0).max(100).nullable().optional(),
  /** Prowizja Sklep % (0..100), konwertujemy na 0..1. */
  commissionPctSklep: z.coerce.number().min(0).max(100).nullable().optional(),
  /** KPK Allegro zł/szt netto. */
  kpkPlnAllegro: z.coerce.number().min(0).nullable().optional(),
  /** KPK Sklep zł/szt netto. */
  kpkPlnSklep: z.coerce.number().min(0).nullable().optional(),
  /** Wysyłka pokrywana przez klienta Allegro — zł/szt netto. */
  customerShippingPlnAllegro: z.coerce.number().min(0).nullable().optional(),
  /** Wysyłka pokrywana przez klienta Sklep — zł/szt netto. */
  customerShippingPlnSklep: z.coerce.number().min(0).nullable().optional(),
});

/**
 * Waliduje hierarchię: level musi pasować do (parent.level + 1).
 * Level 1 = brak rodzica. Max poziom 3.
 */
async function validateLevelAndParent(
  level: number,
  parentId: string | null,
): Promise<void> {
  if (level === 1) {
    if (parentId)
      throw new Error("Kategoria główna (poziom 1) nie może mieć rodzica.");
    return;
  }
  if (!parentId)
    throw new Error(
      `Poziom ${level} wymaga rodzica (kategorii poziomu ${level - 1}).`,
    );
  const parent = await db.category.findUnique({
    where: { id: parentId },
    select: { level: true },
  });
  if (!parent) throw new Error("Rodzic nie istnieje.");
  if (parent.level !== level - 1) {
    throw new Error(
      `Rodzic musi być poziomu ${level - 1}, a wybrany jest poziomu ${parent.level}.`,
    );
  }
}

async function requireUser() {
  const session = await auth();
  if (!session?.user) throw new Error("Brak autoryzacji");
  return session.user;
}

async function uniqueSlug(
  companyId: string,
  base: string,
  excludeId?: string,
): Promise<string> {
  let slug = slugify(base) || "kategoria";
  let suffix = 1;
  for (;;) {
    const existing = await db.category.findFirst({
      where: { companyId, slug },
    });
    if (!existing || existing.id === excludeId) return slug;
    suffix += 1;
    slug = `${slugify(base)}-${suffix}`;
  }
}

export async function createCategoryAction(input: unknown) {
  await requireUser();
  const companyId = await getCurrentCompanyId();
  const data = categorySchema.parse(input);
  const level = data.level ?? 1;
  const parentId = data.parentId || null;
  await validateLevelAndParent(level, parentId);
  const slug = await uniqueSlug(companyId, data.name);
  const created = await db.category.create({
    data: {
      companyId,
      name: data.name.trim(),
      slug,
      parentId,
      level,
      sortOrder: data.sortOrder ?? 0,
      customsDutyPct:
        data.customsDutyPct != null ? data.customsDutyPct / 100 : null,
      commissionPctAllegro:
        data.commissionPctAllegro != null
          ? data.commissionPctAllegro / 100
          : null,
      commissionPctSklep:
        data.commissionPctSklep != null ? data.commissionPctSklep / 100 : null,
      kpkPlnAllegro: data.kpkPlnAllegro ?? null,
      kpkPlnSklep: data.kpkPlnSklep ?? null,
      customerShippingPlnAllegro: data.customerShippingPlnAllegro ?? null,
      customerShippingPlnSklep: data.customerShippingPlnSklep ?? null,
    },
  });
  revalidatePath("/produkty/kategorie");
  return { ok: true as const, id: created.id };
}

export async function updateCategoryAction(id: string, input: unknown) {
  await requireUser();
  const companyId = await getCurrentCompanyId();
  const data = categorySchema.parse(input);

  if (data.parentId === id) {
    throw new Error("Kategoria nie może być swoim rodzicem.");
  }

  const existing = await db.category.findFirst({ where: { id, companyId } });
  if (!existing) throw new Error("Kategoria nie istnieje.");

  const level = data.level ?? existing.level;
  const parentId = data.parentId || null;
  await validateLevelAndParent(level, parentId);

  // Zmiana poziomu skomplikowana — zmusza zmianę wszystkich dzieci.
  // Na razie blokujemy zmianę level jeśli ma dzieci.
  if (level !== existing.level) {
    const childCount = await db.category.count({ where: { parentId: id } });
    if (childCount > 0) {
      throw new Error(
        "Nie można zmienić poziomu kategorii która ma podkategorie. Najpierw usuń lub przenieś podkategorie.",
      );
    }
  }

  const slug =
    data.name !== existing.name
      ? await uniqueSlug(companyId, data.name, id)
      : existing.slug;

  await db.category.update({
    where: { id },
    data: {
      name: data.name.trim(),
      slug,
      parentId,
      level,
      sortOrder: data.sortOrder ?? existing.sortOrder,
      // Aktualizuj cło tylko gdy zostało podane jawnie (undefined = nie ruszaj).
      ...(data.customsDutyPct !== undefined && {
        customsDutyPct:
          data.customsDutyPct != null ? data.customsDutyPct / 100 : null,
      }),
      ...(data.commissionPctAllegro !== undefined && {
        commissionPctAllegro:
          data.commissionPctAllegro != null
            ? data.commissionPctAllegro / 100
            : null,
      }),
      ...(data.commissionPctSklep !== undefined && {
        commissionPctSklep:
          data.commissionPctSklep != null
            ? data.commissionPctSklep / 100
            : null,
      }),
      ...(data.kpkPlnAllegro !== undefined && {
        kpkPlnAllegro: data.kpkPlnAllegro,
      }),
      ...(data.kpkPlnSklep !== undefined && {
        kpkPlnSklep: data.kpkPlnSklep,
      }),
      ...(data.customerShippingPlnAllegro !== undefined && {
        customerShippingPlnAllegro: data.customerShippingPlnAllegro,
      }),
      ...(data.customerShippingPlnSklep !== undefined && {
        customerShippingPlnSklep: data.customerShippingPlnSklep,
      }),
    },
  });
  revalidatePath("/produkty/kategorie");
  return { ok: true as const };
}

/**
 * Quick-edit pojedynczego pola sales-channel defaults z items-tab.
 * Klik na 4.5% w kolumnie PROW% otwiera popover, save woła tę akcję,
 * a recalc na zamówieniu pokaże nową wartość we wszystkich pozycjach
 * z tej kategorii (i kategorii dzieci, bo dziedziczą z parent).
 *
 * `channel`: "Allegro" | "Sklep". `field`: "commissionPct" | "kpkPln".
 * Wartość przyjmujemy jako fraction (0..1 dla %) lub PLN (KPK).
 */
export async function updateCategorySalesChannelDefaultsAction(
  categoryId: string,
  channel: "Allegro" | "Sklep",
  field: "commissionPct" | "kpkPln" | "customerShippingPln",
  rawValue: number | null,
) {
  await requireUser();
  const companyId = await getCurrentCompanyId();
  const cat = await db.category.findFirst({
    where: { id: categoryId, companyId },
    select: { id: true },
  });
  if (!cat) throw new Error("Kategoria nie istnieje.");

  const dbField = (() => {
    if (field === "commissionPct") {
      return channel === "Allegro"
        ? "commissionPctAllegro"
        : "commissionPctSklep";
    }
    if (field === "kpkPln") {
      return channel === "Allegro" ? "kpkPlnAllegro" : "kpkPlnSklep";
    }
    return channel === "Allegro"
      ? "customerShippingPlnAllegro"
      : "customerShippingPlnSklep";
  })();

  await db.category.update({
    where: { id: categoryId },
    data: { [dbField]: rawValue },
  });

  // Revalidate strony używające tych wartości — zamówienia i lista produktów.
  revalidatePath("/produkty/kategorie");
  revalidatePath("/produkty");
  revalidatePath("/zamowienia");
  return { ok: true as const };
}

export async function deleteCategoryAction(id: string) {
  await requireUser();
  const [childCount, productCount] = await Promise.all([
    db.category.count({ where: { parentId: id } }),
    db.product.count({ where: { categoryId: id } }),
  ]);
  if (childCount > 0) {
    throw new Error("Najpierw przenieś podkategorie.");
  }
  if (productCount > 0) {
    throw new Error(`W kategorii jest ${productCount} produktów — przenieś je najpierw.`);
  }
  await db.category.delete({ where: { id } });
  revalidatePath("/produkty/kategorie");
  return { ok: true as const };
}
