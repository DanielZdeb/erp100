# syntax=docker/dockerfile:1
# Multi-stage build dla Next.js 16 z `output: 'standalone'`.
# Końcowy obraz: ~150 MB (vs 1.5+ GB z node_modules bez standalone).
# Build wykona Coolify / docker build na Hetznerze.

# ─── Stage 1: deps ──────────────────────────────────────────
# Instaluje zależności bez ciężaru kompilacji dev tools.
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY package.json package-lock.json* ./
# `npm ci` jest deterministyczny — używa dokładnie lockfile, szybciej niż install.
# `--legacy-peer-deps` omija strict peer-dep checking npm v7+ — repo ma drobny
# conflict tiptap (extension-table@3.26.1 chce core@3.26.1, starter-kit@3.26.0
# wciąga core@3.26.0).
# `--include=dev` MUSI być, bo Coolify może mieć NODE_ENV=production przy buildzie
# co domyślnie pomija devDependencies — a my potrzebujemy typescript/eslint/
# @types do `next build`.
RUN npm ci --no-audit --no-fund --legacy-peer-deps --include=dev

# ─── Stage 2: builder ──────────────────────────────────────
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Prisma generate przed buildem — żeby src/generated/prisma było wypełnione.
RUN npx prisma generate
# Telemetria off (mniejszy hałas w logach, brak wychodzącego ruchu).
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ─── Stage 3: runner ──────────────────────────────────────
# Slim runtime — tylko to co potrzebne, non-root user, gotowe pod healthcheck.
FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat openssl wget
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Non-root user — bezpieczeństwo (jak coś się włamie, nie ma root na hoście).
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs

# Standalone server + statyczne assety + public/
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# /uploads/ jest mount-pointem volume (Coolify zarządza persistent storage).
# Tworzymy katalog z poprawnymi uprawnieniami, żeby user `nextjs` mógł zapisywać.
RUN mkdir -p /app/public/uploads && chown -R nextjs:nodejs /app/public/uploads

USER nextjs
EXPOSE 3000

# Healthcheck: /api/auth/session zwraca pustą sesję (GET) bez potrzeby DB.
# UWAGA: Auth.js v5 obsługuje TYLKO GET i POST — nie używać `wget --spider`
# (HEAD), bo wtedy zwraca UnknownAction error i healthcheck failuje.
# `-O /dev/null` = pełny GET, ale odrzucamy body (tylko exit code nas interesuje).
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -q --tries=1 -O /dev/null http://localhost:3000/api/auth/session || exit 1

CMD ["node", "server.js"]
