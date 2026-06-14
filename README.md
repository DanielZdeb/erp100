# ERP firmy

Custom ERP dla firmy e-commerce — import towarów z Chin, kalkulacja kontenera,
katalog produktów, kurierzy.

**Stack:** Next.js 16 (App Router) · Prisma 7 · PostgreSQL · Auth.js v5 · TailwindCSS · shadcn/ui

## Codzienne uruchamianie (dev lokalny)

Aplikacja używa lokalnego Postgresa wbudowanego w Prismę. Potrzebujesz **dwóch
terminali**:

**Terminal 1 — baza danych:**
```bash
npx prisma dev
```
Zostaw to okno otwarte. Postgres słucha na portach 51214 (główny) i 51215 (shadow).
Dane trzymane są lokalnie (przeżywają restart komputera).

**Terminal 2 — aplikacja:**
```bash
npm run dev
```
Otwórz [http://localhost:3000](http://localhost:3000) — zostaniesz przekierowany
na `/login`.

## Pierwsze uruchomienie (zrobione już raz)

Jeśli musisz odtworzyć środowisko od zera albo na innym komputerze:

```bash
# 1. Stwórz .env (są tam już lokalne ustawienia)
cp .env.example .env

# 2. W jednym terminalu odpal lokalną bazę
npx prisma dev

# 3. W drugim terminalu — wgraj schemat
npm run db:push

# 4. Stwórz administratora
npm run create-admin -- email@firma.pl haslo123 "Imię"

# 5. Odpal aplikację
npm run dev
```

## Przejście na chmurę (Vercel + Neon) — później

W `.env` wymień `DATABASE_URL` na connection string z [neon.tech](https://neon.tech),
zakomentuj `SHADOW_DATABASE_URL` i przestań odpalać `npx prisma dev`. Reszta
działa tak samo.

## Skróty

| Komenda | Co robi |
| --- | --- |
| `npm run dev` | Dev server (Next.js z Turbopack) |
| `npm run build` | Build produkcyjny |
| `npm run db:push` | Wgraj schemat do bazy (dev) |
| `npm run db:migrate` | Utwórz migrację (prod) |
| `npm run db:studio` | UI do przeglądania bazy (Prisma Studio) |
| `npm run db:generate` | Zregeneruj klient Prismy po zmianie schematu |
| `npm run create-admin` | Utwórz użytkownika admin |
| `npm run lint` | ESLint |

## Struktura

```
prisma/
  schema.prisma         # schemat bazy
src/
  app/
    layout.tsx          # root layout
    page.tsx            # przekierowanie do /dashboard
    login/              # strona logowania
    (app)/              # protected (sidebar + auth)
      layout.tsx        # protected layout z sidebarem
      dashboard/        # główna strona
      produkty/         # katalog
      zamowienia/       # zamówienia importowe
      kurierzy/         # kurierzy
    api/auth/[...nextauth]  # Auth.js endpoints
  lib/
    db.ts               # Prisma client singleton
    kalkulacje.ts       # logika z Excela (CBM, marże, koszty)
  components/
    ui/                 # shadcn/ui
    layout/             # sidebar, user menu
  server/
    actions/            # Server Actions
  auth.ts               # Auth.js z DB lookup
  auth.config.ts        # Auth.js (Edge-safe, do middleware)
  middleware.ts         # ochrona ścieżek
scripts/
  create-admin.ts       # tworzenie pierwszego usera
```

## Moduły (status)

- [x] **Faza 0** — scaffold, baza, auth, layout
- [ ] **Faza 2** — Produkty (kategorie, CRUD, grafiki, historia cen)
- [ ] **Faza 3** — Zamówienia importowe (workflow statusów, kalkulacje, koszty, zadania, płatności, pliki)
- [ ] **Faza 4** — Kurierzy (umowy, stawki, rekomendacje per produkt)
- [ ] **Faza 5** — Dashboard (agregacja zadań, KPI, gotówka do zapłaty)
