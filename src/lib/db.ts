import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

declare global {
  var __prismaClient: PrismaClient | undefined;
  var __prismaClass: typeof PrismaClient | undefined;
}

function build(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  // Niech PrismaPg sam zarządza poolem — naszego ręcznego pool.end()
  // dawało P1017 / "Cannot use a pool after end".
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

function getClient(): PrismaClient {
  // W dev po `prisma generate` moduł generated/prisma/client jest ponownie
  // ewaluowany przez HMR, więc `PrismaClient` to nowa klasa z nowymi modelami.
  // Stara instancja na `globalThis` nadal nie zna nowych modeli — wykrywamy
  // podmianę klasy i odpalamy świeży klient.
  if (
    globalThis.__prismaClient &&
    globalThis.__prismaClass &&
    globalThis.__prismaClass !== PrismaClient
  ) {
    const stale = globalThis.__prismaClient;
    globalThis.__prismaClient = undefined;
    globalThis.__prismaClass = undefined;
    void stale.$disconnect().catch(() => undefined);
  }
  if (!globalThis.__prismaClient) {
    globalThis.__prismaClient = build();
    globalThis.__prismaClass = PrismaClient;
  }
  return globalThis.__prismaClient;
}

function isConnectionError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const err = e as { code?: string; message?: string; cause?: unknown };
  if (
    err.code === "P1001" ||
    err.code === "P1002" ||
    err.code === "P1008" ||
    err.code === "P1017"
  ) {
    return true;
  }
  if (
    err.code === "ECONNREFUSED" ||
    err.code === "ECONNRESET" ||
    err.code === "ETIMEDOUT" ||
    err.code === "EPIPE"
  ) {
    return true;
  }
  const msg = err.message ?? "";
  if (
    /Server has closed the connection|ECONNREFUSED|ECONNRESET|ETIMEDOUT|Connection terminated|terminating connection|Cannot use a pool|pool is being destroyed|Connection ended|connection has been closed|client has encountered/i.test(
      msg,
    )
  ) {
    return true;
  }
  if (err.cause && isConnectionError(err.cause)) return true;
  return false;
}

async function rebuild(): Promise<void> {
  const old = globalThis.__prismaClient;
  globalThis.__prismaClient = undefined;
  // Best-effort disconnect — błędy ignorujemy, klient i tak nie będzie używany.
  if (old) {
    void old.$disconnect().catch(() => undefined);
  }
}

/**
 * Wykonuje funkcję na bieżącym kliencie. Gdy w trakcie wystąpi błąd
 * połączenia, przebudowuje klient i ponawia. Do 4 prób z backoff.
 */
async function withRetry<T>(
  fn: (c: PrismaClient) => Promise<T>,
): Promise<T> {
  const delays = [0, 250, 500, 1000];
  let lastErr: unknown;
  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (delays[attempt] > 0) {
      await new Promise((r) => setTimeout(r, delays[attempt]));
    }
    try {
      return await fn(getClient());
    } catch (e) {
      lastErr = e;
      if (process.env.NODE_ENV === "production" || !isConnectionError(e)) {
        throw e;
      }
      console.warn(
        `[Prisma] Connection error (attempt ${attempt + 1}/${delays.length}) — rebuilding`,
      );
      await rebuild();
    }
  }
  throw lastErr;
}

/**
 * Proxy z auto-retry. W produkcji bez wrappera — minimal overhead.
 *
 * WAŻNE: `db.$transaction([array])` nie jest wspierane przez proxy —
 * używaj callback formy: `db.$transaction(async (tx) => {...})`.
 */
function makeDb(): PrismaClient {
  if (process.env.NODE_ENV === "production") {
    return getClient();
  }

  return new Proxy({} as PrismaClient, {
    get(_target, prop) {
      const sentinel = (c: PrismaClient) =>
        (c as unknown as Record<PropertyKey, unknown>)[prop];

      return new Proxy(
        function () {} as unknown as Record<PropertyKey, unknown>,
        {
          apply(_t, _thisArg, args) {
            // db.$transaction / db.$queryRaw / db.$executeRaw — wywołania
            // bezpośrednie na kliencie. Trzymamy `this = client`, bo Prisma
            // w środku robi `this._engineConfig`.
            return withRetry((c) => {
              const fn = sentinel(c) as (
                ...a: unknown[]
              ) => Promise<unknown>;
              return Reflect.apply(fn, c, args as unknown[]);
            });
          },
          get(_t, methodProp) {
            return (...args: unknown[]) =>
              withRetry((c) => {
                // db.X.method — `target` to `c.X` (np. c.importOrder), więc
                // `target[methodProp](...)` zachowuje `this = c.X` (zgodnie
                // z konwencją Prisma dla metod modeli).
                const target = sentinel(c) as Record<
                  PropertyKey,
                  (...a: unknown[]) => Promise<unknown>
                >;
                return target[methodProp](...args);
              });
          },
        },
      );
    },
  });
}

export const db: PrismaClient = makeDb();
