# Yamboka

Plateforme de création d'images et de vidéos par IA, payée en mobile money. Monorepo pnpm :

| Dossier | Rôle | Port local |
|---|---|---|
| `web/` | Landing publique (Next.js) | 3000 |
| `app/` | Espace membre et administration (Next.js) | 3001 |
| `api/` | Backend (NestJS, Prisma, PostgreSQL, Redis/BullMQ) | 4000 |
| `packages/shared/` | Contrats Zod partagés | — |
| `docker/` | Dockerfile et un fichier Compose par environnement | — |

PostgreSQL et Redis ne sont jamais exposés publiquement. Documentation technique détaillée : [docs/README.md](docs/README.md).

## 1. Environnements

| | `local` | `dev` | `staging` | `prod` |
|---|---|---|---|---|
| Usage | poste de développement | tests techniques sur le VPS | préproduction, **identique à la prod** | production |
| Fichier de variables | `.env.local` | `.env.dev` | `.env.staging` | `.env.prod` |
| Fichier Compose | `docker/docker-compose.local.yml` | `…dev.yml` | `…staging.yml` | `…prod.yml` |
| Landing | `http://localhost:3000` | `https://dev.domaine.com` | `https://staging.domaine.com` | `https://domaine.com` |
| Espace membre | `http://localhost:3001` | `https://app.dev.domaine.com` | `https://app.staging.domaine.com` | `https://app.domaine.com` |
| API | `http://localhost:4000/api` | `…/api` sur les deux hôtes | idem | idem |
| Images | code monté, rechargement auto | images de déploiement | images de déploiement | images de déploiement |
| Ports publiés | `127.0.0.1` uniquement | **aucun** | **aucun** | **aucun** |
| Domains Dokploy / `dokploy-network` | non | oui | oui | oui |

`dev`, `staging` et `prod` utilisent **le même modèle Compose** (généré par `scripts/gen-compose-remote.py`) : seuls les fichiers de variables diffèrent. Staging n'est donc pas un environnement allégé : mêmes images, mêmes protections, mêmes contrôles de santé. Chaque environnement a ses propres conteneurs, réseau interne, volumes, base de données et secrets (`COMPOSE_PROJECT_NAME` unique).

## 2. Fichiers `.env` (racine du dépôt)

```
.env.example   modèle commenté, SEUL fichier suivi par Git (aucune valeur réelle)
.env.local  .env.dev  .env.staging  .env.prod     ignorés par Git
```

Aucun `.env` ne subsiste dans `api/`, `web/` ou `app/`. Un fichier par environnement, utilisé de trois façons :

1. **Docker Compose** : `--env-file .env.<env>` alimente l'interpolation (`${DOMAIN}`, noms d’alias réseau…). Les fichiers Compose passent ensuite à chaque conteneur **uniquement les variables dont il a besoin** (`environment:` explicite) : le front ne reçoit aucun secret de l'API. Les variables requises (`SESSION_SECRET`, `POSTGRES_PASSWORD`…) font échouer `config` si elles manquent.
2. **Développement hors Docker** (`pnpm dev:*`) : l'API (NestJS, Prisma, scripts) et les deux Next.js lisent `.env.local` à la racine ; une variable déjà définie dans le shell l'emporte.
3. **Dokploy** : le contenu du fichier est collé dans l'onglet *Environment* du projet.

Variables d'infrastructure (obligatoires dans chaque fichier) :

| Variable | Rôle |
|---|---|
| `ENV_NAME` | `local` · `dev` · `staging` · `prod` — nomme les alias réseau internes (`api-<ENV_NAME>`, `web-<ENV_NAME>`) |
| `COMPOSE_PROJECT_NAME` | unique par environnement (`yamboka-prod`…) : isole conteneurs, réseaux, volumes |
| `DOMAIN` / `APP_DOMAIN` | hôte de la landing / de l'espace membre (`app.` + `DOMAIN`) ; `localhost` en local |
| `WEB_URL` / `APP_URL` / `API_URL` | URLs publiques (CORS, CSRF, liens des e-mails, retours paiement/OAuth) |
| `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_APP_URL` | égales à `WEB_URL` / `APP_URL`, figées dans le bundle au build |

Toutes les autres variables sont décrites dans [`.env.example`](.env.example).

### Initialisation locale

```bash
pnpm install                                   # compile aussi packages/shared
cp .env.example .env.local                     # puis renseigner SESSION_SECRET, POSTGRES_*, ADMIN_PASSWORD…
# valeurs locales : DOMAIN=APP_DOMAIN=localhost, URLs http://localhost:300x, ENV_NAME=local, TRUST_PROXY=0,
#   DATABASE_URL="postgresql://yamboka:<mdp>@localhost:5433/yamboka_dev", REDIS_URL="redis://localhost:6380", API_INTERNAL_URL=http://localhost:4000
docker compose --env-file .env.local -f docker/docker-compose.local.yml up -d   # PostgreSQL + Redis
pnpm --filter api db:migrate && pnpm --filter api db:seed
pnpm dev:api & pnpm dev:web & pnpm dev:app
```

> **Migration depuis l'ancienne organisation** : le volume PostgreSQL historique `yamboka-dev_pgdata` est réutilisé tel quel (voir `LOCAL_PGDATA_VOLUME`). Arrêtez d'abord les anciens conteneurs `yamboka-dev-*` (mêmes ports).

## 3. Commandes

Toutes depuis la **racine du dépôt**.

```bash
# ── Local ───────────────────────────────────────────────────────────────────────
docker compose --env-file .env.local -f docker/docker-compose.local.yml up -d                    # PostgreSQL + Redis
docker compose --env-file .env.local -f docker/docker-compose.local.yml --profile apps up -d --build   # + api, web, app en conteneurs
docker compose --env-file .env.local -f docker/docker-compose.local.yml --profile apps down      # arrêt

# ── Distant (dev | staging | prod) ──────────────────────────────────────────────
docker compose --env-file .env.staging -f docker/docker-compose.staging.yml up -d --build
docker compose --env-file .env.staging -f docker/docker-compose.staging.yml ps
docker compose --env-file .env.staging -f docker/docker-compose.staging.yml down                 # SANS -v : les volumes (données) sont conservés

# ── Validation des fichiers (interpolation des variables) ─────────────────────
docker compose --env-file .env.local   -f docker/docker-compose.local.yml   config
docker compose --env-file .env.dev     -f docker/docker-compose.dev.yml     config
docker compose --env-file .env.staging -f docker/docker-compose.staging.yml config
docker compose --env-file .env.prod    -f docker/docker-compose.prod.yml    config
# Hors serveur Dokploy, `config` des fichiers distants exige le réseau externe : docker network create dokploy-network
```

Les chemins relatifs des fichiers Compose (`context: ..`, `env_file`, volumes) se résolvent depuis `docker/`, quel que soit le dossier d'exécution ; seul `--env-file` et `-f` sont relatifs au dossier courant (d'où « depuis la racine »).

## 4. Routage distant (onglet Domains de Dokploy)

Le routage n'est **pas** dans les fichiers Compose : il se saisit dans l'onglet **Domains** de chaque projet Dokploy (aucun label Traefik dans le dépôt, donc aucun doublon possible). Deux hôtes par environnement ; l'API est servie **sous `/api` sur les deux** : chaque front l'appelle en chemin relatif sur sa propre origine (aucun CORS ni cookie inter-domaines).

Entrées à créer (4 par environnement, HTTPS activé, certificat `letsencrypt`, **Strip Path désactivé**). Le port est le port **interne** du conteneur : identique dans les trois environnements (aucun port n'est publié sur l'hôte, chaque environnement a son propre réseau).

| Service | Domaine (prod / staging / dev) | Chemin | Port |
|---|---|---|---|
| `web` | `yamboka.com` / `staging.yamboka.com` / `dev.yamboka.com` | `/` | 3000 |
| `app` | `app.yamboka.com` / `app.staging.yamboka.com` / `app.dev.yamboka.com` | `/` | 3001 |
| `api` | domaine de la landing | `/api/` | 4000 |
| `api` | domaine de l'espace membre | `/api/` | 4000 |

Les domaines saisis doivent être **identiques** à `DOMAIN` / `APP_DOMAIN` du `.env` de l'environnement (qui sert aux URLs publiques, CORS et liens des e-mails).

- Pas de strip du préfixe : l'API porte elle-même `/api` (`setGlobalPrefix('api')`). Santé : `/api/health`.
- Seuls `web`, `app` et `api` rejoignent `dokploy-network` (réseau du Traefik de Dokploy) ; `postgres`, `redis` et `migrate` restent sur le réseau interne de l'environnement. `api` et `web` ont sur ce réseau un alias propre à l'environnement (`api-<ENV_NAME>`, `web-<ENV_NAME>`) : les noms de service `api`/`web` existeraient sinon dans tous les environnements à la fois sur `dokploy-network`.
- Priorité : Dokploy n'en fixe pas ; Traefik donne l'avantage à la règle la plus longue, donc hôte + `/api/` l'emporte sur l'hôte seul. **À vérifier au premier déploiement** (`curl https://<domaine>/api/health` doit renvoyer du JSON, pas la page du front).
- Certificats : un par hôte (challenge HTTP), pas de wildcard. Le DNS doit être propagé avant (« Validate DNS »).
- Redirection HTTP→HTTPS : activée par l'option HTTPS de l'entrée Domains.
- Les anciennes variables `TRAEFIK_*` n'existent plus.

### Liens landing → espace membre

La navbar et les CTA utilisent `NEXT_PUBLIC_APP_URL` (`web/content/site.ts`). Cette valeur est **figée au build** : l'image `web` doit être construite séparément pour chaque environnement (le Compose le fait avec les `build.args` de son `.env`). **Ne jamais promouvoir une image de dev/staging en production.**

### Cookies et sessions

Le cookie `yamboka_session` est limité à l'hôte (`HttpOnly`, `SameSite=Lax`, `Secure` en production, **sans attribut `Domain`**). `COOKIE_DOMAIN` est forcé à vide dans les Compose distants : une session de `app.domaine.com` n'est jamais envoyée à `app.staging.domaine.com` ni à aucun autre hôte. La landing ne lit pas la session (aucun « Mon compte » pour l'instant) ; si besoin, il faudra un appel à `/api` depuis la landing avec un cookie dédié, jamais un cookie de domaine parent.

## 5. Déploiement sur Dokploy

**Prérequis serveur** : VPS avec Docker et Dokploy installés (Traefik ports 80/443), réseau `dokploy-network` présent, enregistrements DNS créés, dépôt accessible depuis Dokploy.

DNS (six enregistrements `A` vers l'IP du serveur) :

| Enregistrement | Hôte servi |
|---|---|
| `@` | `domaine.com` |
| `app` | `app.domaine.com` |
| `staging` | `staging.domaine.com` |
| `app.staging` | `app.staging.domaine.com` |
| `dev` | `dev.domaine.com` |
| `app.dev` | `app.dev.domaine.com` |

Pour chaque environnement : créer un projet **Compose** dans Dokploy, source = ce dépôt (branche de l'environnement), *Compose Path* = `./docker/docker-compose.<env>.yml`, coller le contenu de `.env.<env>` (secrets renseignés) dans *Environment*, créer les 4 entrées de l'onglet *Domains* (§4), puis déployer.
Hypothèse non vérifiée ici : Dokploy interpole le Compose avec les variables saisies dans *Environment* (c'est ce qui rend les fichiers compatibles avec `--env-file`, car ils n'utilisent aucun `env_file:`). À contrôler au premier déploiement : `docker inspect <conteneur>` doit montrer les bonnes valeurs.

### Mise à jour et migrations

Les migrations Prisma sont appliquées automatiquement à chaque déploiement par le service `migrate` (`prisma migrate deploy`), avant le démarrage de l'API ; si une migration échoue, l'API ne démarre pas. Procédure : déployer sur **staging**, vérifier, puis déployer la même révision en prod. Avant une migration risquée, sauvegarder la base (voir [docs/dev/base-de-donnees.md](docs/dev/base-de-donnees.md)).
Ne jamais utiliser `down -v` ni supprimer un volume sans sauvegarde.

### URLs à déclarer chez les services externes (par environnement, avec leurs clés propres)

| Service | URL |
|---|---|
| SasPay — webhook | `https://<APP_DOMAIN>/api/webhooks/saspay` (+ `SASPAY_WEBHOOK_SECRET` de cet environnement) |
| Google OAuth — redirection | `https://<APP_DOMAIN>/api/auth/google/callback` (= `GOOGLE_CALLBACK_URL`) ; origine JavaScript : `https://<APP_DOMAIN>` |
| E-mails (SPF/DKIM) | expéditeur `EMAIL_FROM` sur un domaine autorisé |

Ces chemins étaient déjà `/api/...` (relayés par l'espace membre) : si vos fournisseurs pointent déjà vers `<hôte app>/api/...`, rien ne change. L’ancien préfixe `/v1/...` n’existe plus.

## 6. Secrets

- Aucun `.env.local|dev|staging|prod` n'est suivi par Git ; `.dockerignore` exclut tous les `.env*` des images, qui ne contiennent donc aucun secret. Seules les `NEXT_PUBLIC_*` (publiques) sont passées en `build.args`.
- Un secret différent par environnement (`SESSION_SECRET`, mot de passe PostgreSQL, clés SasPay/SMTP/R2/Higgsfield). Ne jamais copier ceux de la production vers dev ou staging.
- Mot de passe PostgreSQL : alphanumérique (il est inséré dans une URL de connexion).
- `SETUP_SECRET` : à retirer une fois l'administrateur créé par le Setup Wizard. `ADMIN_*` : local uniquement.
- `NODE_ENV=production` sur tous les environnements distants : cookies `Secure`, Swagger et routes de développement désactivés.

## 7. Vérifications à faire sur le serveur (non exécutables hors de celui-ci)

1. Certificats Let's Encrypt émis pour les six hôtes (HTTP-01 : ports 80/443 ouverts, DNS propagé).
2. Priorité de la route `/api/` sur le fourre-tout de l'hôte (§4).
3. Interpolation des variables par Dokploy (voir §5).
4. `curl -I https://<DOMAIN>/`, `https://<APP_DOMAIN>/connexion`, `https://<DOMAIN>/api/health` et `https://<APP_DOMAIN>/api/health`.
