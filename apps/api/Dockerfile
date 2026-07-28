# Build desde la raíz del monorepo (contexto = raíz), ver apps/api/fly.toml.
# syntax=docker/dockerfile:1

FROM node:20-slim AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
# Copiar solo los package.json de cada workspace primero para cachear el
# `pnpm install` entre builds mientras no cambien las dependencias.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/whatsapp/package.json apps/whatsapp/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter @colonia-crm/api build
RUN pnpm --filter @colonia-crm/api deploy --prod /out

FROM node:20-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out .
EXPOSE 3001
CMD ["node", "dist/index.js"]
