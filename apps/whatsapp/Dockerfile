# Build desde la raíz del monorepo (contexto = raíz), ver apps/whatsapp/fly.toml.
# syntax=docker/dockerfile:1

FROM node:20-slim AS base
# git es necesario: baileys depende de libsignal-node directo desde GitHub
# (no publicado en npm), pnpm necesita el binario para resolverlo.
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/whatsapp/package.json apps/whatsapp/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter @colonia-crm/whatsapp build
RUN pnpm --filter @colonia-crm/whatsapp deploy --prod /out

FROM node:20-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out .
EXPOSE 3002
CMD ["node", "dist/index.js"]
