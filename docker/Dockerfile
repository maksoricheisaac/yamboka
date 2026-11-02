# syntax=docker/dockerfile:1
#
# Images de Yamboka (monorepo pnpm). Contexte de build : la RACINE du dépôt.
#   cibles de déploiement : api, web, app          (dev distant, staging, production)
#   cible de développement : dev                    (local, code monté depuis l'hôte)
#
# Aucun secret n'est copié dans les images (.dockerignore exclut tous les .env*). Les seules valeurs liées à
# l'environnement figées au build sont NEXT_PUBLIC_* (publiques par nature) : une image web de staging ne doit
# donc jamais être promue en production, chaque environnement construit la sienne.

ARG NODE_VERSION=24
FROM node:${NODE_VERSION}-alpine AS base
RUN corepack enable && apk add --no-cache libc6-compat openssl
WORKDIR /repo
ENV CI=true NEXT_TELEMETRY_DISABLED=1

# ───── Dépendances (couche mise en cache tant que les manifestes ne changent pas) ─────
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY api/package.json api/
COPY web/package.json web/
COPY app/package.json app/
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts

# ───── Développement local : le code est monté par Compose, seules les dépendances sont dans l'image ─────
FROM deps AS dev
ENV NODE_ENV=development
CMD ["sh", "-c", "echo 'Précisez la commande du service dans docker-compose.local.yml' && exit 1"]

# ───── Sources + contrat partagé compilé ─────
FROM deps AS source
COPY . .
RUN pnpm --filter @yamboka/shared build

# ───── API ─────
FROM source AS api-build
RUN pnpm --filter api exec prisma generate && pnpm --filter api build
# Copie autonome de l'API et de ses dépendances (les devDependencies restent : la CLI Prisma sert aux migrations).
RUN pnpm --filter api deploy --legacy /out

FROM node:${NODE_VERSION}-alpine AS api
RUN apk add --no-cache openssl
ENV NODE_ENV=production PORT=4000
WORKDIR /srv
COPY --from=api-build --chown=node:node /out/node_modules ./node_modules
COPY --from=api-build --chown=node:node /out/package.json /out/prisma.config.ts ./
COPY --from=api-build --chown=node:node /out/prisma ./prisma
COPY --from=api-build --chown=node:node /repo/api/dist ./dist
COPY --from=api-build --chown=node:node /repo/api/src/generated ./src/generated
RUN mkdir -p /srv/storage && chown node:node /srv/storage
USER node
EXPOSE 4000
CMD ["node", "dist/main"]

# ───── Site public (Next.js, sortie autonome) ─────
FROM source AS web-build
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_WHATSAPP_NUMBER=
ENV NEXT_OUTPUT=standalone NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL} \
    NEXT_PUBLIC_WHATSAPP_NUMBER=${NEXT_PUBLIC_WHATSAPP_NUMBER}
RUN test -n "$NEXT_PUBLIC_SITE_URL" && test -n "$NEXT_PUBLIC_APP_URL" \
    || (echo "NEXT_PUBLIC_SITE_URL et NEXT_PUBLIC_APP_URL sont obligatoires (--build-arg)" && exit 1)
RUN pnpm --filter web build

FROM node:${NODE_VERSION}-alpine AS web
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
WORKDIR /srv
COPY --from=web-build --chown=node:node /repo/web/.next/standalone ./
COPY --from=web-build --chown=node:node /repo/web/.next/static ./web/.next/static
COPY --from=web-build --chown=node:node /repo/web/public ./web/public
USER node
EXPOSE 3000
CMD ["node", "web/server.js"]

# ───── Espace membre (Next.js, sortie autonome, servi à la racine de son hôte) ─────
FROM source AS app-build
ARG NEXT_PUBLIC_SITE_URL
ARG API_INTERNAL_URL
ENV NEXT_OUTPUT=standalone NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} API_INTERNAL_URL=${API_INTERNAL_URL}
RUN test -n "$NEXT_PUBLIC_SITE_URL" && test -n "$API_INTERNAL_URL" \
    || (echo "NEXT_PUBLIC_SITE_URL et API_INTERNAL_URL sont obligatoires (--build-arg)" && exit 1)
RUN pnpm --filter app build

FROM node:${NODE_VERSION}-alpine AS app
ENV NODE_ENV=production PORT=3001 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
WORKDIR /srv
COPY --from=app-build --chown=node:node /repo/app/.next/standalone ./
COPY --from=app-build --chown=node:node /repo/app/.next/static ./app/.next/static
COPY --from=app-build --chown=node:node /repo/app/public ./app/public
USER node
EXPOSE 3001
CMD ["node", "app/server.js"]
