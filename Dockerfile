# Imagen de producción (Next.js standalone no se usa para mantener better-sqlite3 simple)
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
COPY --from=build /app ./
# Base de datos y archivos en volumen persistente
VOLUME ["/app/data", "/app/storage"]
EXPOSE 3000
CMD ["sh", "-c", "mkdir -p data && npx drizzle-kit push --force && ([ -f data/.seeded ] || (npx tsx scripts/seed.ts && touch data/.seeded)) && npx next start -p $PORT"]
