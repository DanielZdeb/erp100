import { auth } from "@/auth";

/**
 * Zwraca companyId aktualnie zalogowanego usera. Rzuca jeśli nie ma sesji
 * lub user nie jest przypisany do firmy (powinno się nigdy nie zdarzyć po
 * migracji `seed-default-company` lub rejestracji).
 *
 * Używać w server actions / server components do scope queries:
 *
 *   const companyId = await getCurrentCompanyId();
 *   const products = await db.product.findMany({ where: { companyId } });
 */
export async function getCurrentCompanyId(): Promise<string> {
  const session = await auth();
  const user = session?.user as
    | { id?: string; companyId?: string | null }
    | undefined;
  if (!user?.id) {
    throw new Error("Brak autoryzacji (sesja).");
  }
  if (!user.companyId) {
    throw new Error("Użytkownik nie jest przypisany do żadnej firmy.");
  }
  return user.companyId;
}

/**
 * Wersja "tryGet" — zwraca null zamiast rzucać.
 * Przydatne w komponentach gdzie obsługujemy stan "loading"/"not logged in".
 */
export async function tryGetCurrentCompanyId(): Promise<string | null> {
  const session = await auth();
  const user = session?.user as { companyId?: string | null } | undefined;
  return user?.companyId ?? null;
}
