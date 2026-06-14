/**
 * Tworzy pierwszego użytkownika (Administratora).
 *
 * Użycie:
 *   npm run create-admin -- email@firma.pl haslo123 "Imię Nazwisko"
 *
 * Wymagane: DATABASE_URL ustawione w .env
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Brak DATABASE_URL w .env");
  process.exit(1);
}
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
  const [email, password, ...nameParts] = process.argv.slice(2);
  const name = nameParts.join(" ").trim() || null;

  if (!email || !password) {
    console.error(
      'Użycie: npm run create-admin -- email@firma.pl haslo123 "Imię Nazwisko"',
    );
    process.exit(1);
  }
  if (password.length < 6) {
    console.error("Hasło musi mieć min. 6 znaków.");
    process.exit(1);
  }
  if (!email.includes("@")) {
    console.error("Niepoprawny e-mail.");
    process.exit(1);
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    console.error(`Użytkownik ${email} już istnieje (rola: ${existing.role}).`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await db.user.create({
    data: { email, passwordHash, name, role: "ADMIN" },
  });

  console.log(`✅ Utworzono administratora: ${user.email} (id: ${user.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
