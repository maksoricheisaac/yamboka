# Yamboka

Plateforme de génération de vidéos par IA, payable en mobile money (Congo-Brazzaville, extension africaine prévue).
Spécifications de référence : [docs/](docs/).

| Dossier | Rôle | Port |
|---|---|---|
| [web/](web/) | Site public (Next.js) | 3000 |
| [app/](app/) | Application privée : `/app/*` (utilisateur) et `/admin/*` (administrateur) | 3001 |
| [api/](api/) | API NestJS, Prisma, PostgreSQL | 4000 |

## Prérequis

Node 24+, pnpm 12+, Docker Desktop (PostgreSQL 16 et Redis en conteneurs). Windows, macOS ou Linux.

## Installation

```bash
pnpm install                                   # un seul lockfile à la racine ; compile aussi packages/shared
cp .env.example .env.local                     # fichier UNIQUE à la racine ; renseigner SESSION_SECRET et ADMIN_PASSWORD (développement seulement), voir README.md
docker compose --env-file .env.local -f docker/docker-compose.local.yml up -d
pnpm --filter api db:migrate                   # applique les migrations
pnpm --filter api db:seed                      # données de base + administrateur de développement
```

## Lancer

```bash
pnpm dev:api    # http://localhost:4000  (Swagger : /api/docs, santé : /api/health)
pnpm dev:web    # http://localhost:3000
pnpm dev:app    # http://localhost:3001
```

## Commandes utiles

| Commande | Effet |
|---|---|
| `pnpm build` / `pnpm lint` / `pnpm test` | Sur les trois applications |
| `pnpm --filter api test` | Tests unitaires de l'API |
| `pnpm --filter api test:e2e` | Tests d'intégration de l'API (base `yamboka_test` recréée à chaque exécution) |
| `pnpm test:e2e` | Tests de navigateur Playwright (voir [docs/dev/tests.md](docs/dev/tests.md)) |
| `pnpm --filter api typecheck` | Vérification TypeScript |
| `pnpm --filter api db:migrate` | Crée/applique une migration en développement |
| `pnpm --filter api db:deploy` | Applique les migrations (production) |
| `pnpm --filter api db:seed` | Seed reproductible (idempotent) |
| `pnpm --filter api email:test [adresse]` | Vérifie la configuration SMTP (connexion, authentification, message de test) |
| `pnpm --filter api storage:test` | Vérifie le stockage (`STORAGE_DRIVER`) : écriture, lecture, suppression, URL signée |
| `pnpm --filter api generation:test` | Vérifie les identifiants du fournisseur de génération, sans générer ni payer |

## Mode simulation (phase 1)

Paiement, génération, e-mail et stockage peuvent être **simulés** (`PAYMENT_PROVIDER=mock`, etc.) : aucune clé externe n'est
nécessaire, aucun argent réel n'est échangé. Le paiement réel passe par SasPay (`PAYMENT_PROVIDER=saspay`, voir
[docs/dev/saspay.md](docs/dev/saspay.md)) ; OpenPay a été supprimé.

## Premier administrateur (production)

Pas de seed ni de SQL à la main : définir `SETUP_SECRET` sur l'API, ouvrir `https://<app>/installation` et suivre l'assistant. Il se verrouille définitivement une fois l'installation faite. Voir [docs/dev/administration.md](docs/dev/administration.md) et [docs/dev/deploiement.md](docs/dev/deploiement.md) (variables Dokploy). Procédure de mise en préproduction, rollback et recette : [docs/dev/preproduction.md](docs/dev/preproduction.md).

## Administration

Centre de pilotage distinct de l'espace client : tableau de bord, clients, modération, offre (3 packs publics maximum), finances, configuration, audit. Voir [docs/dev/administration.md](docs/dev/administration.md).

## E-mails et codes de vérification

Envoi SMTP réel (`EMAIL_PROVIDER=smtp`) ou mode console en développement ; vérification d'adresse et confirmation de connexion par code à usage unique. Voir [docs/dev/emails-et-otp.md](docs/dev/emails-et-otp.md) (variables, SPF/DKIM/DMARC, test de configuration).

## Site public

Navigation, landing, animations (Motion), offres lues depuis l'administration, SEO : voir [docs/dev/site-public.md](docs/dev/site-public.md).

## Authentification

Voir [docs/dev/authentification.md](docs/dev/authentification.md) (sessions, CSRF, rôles, Google, variables).

## Interface connectée

Voir [docs/dev/interface-connectee.md](docs/dev/interface-connectee.md) (barre latérale repliable, administration, pièges à éviter).

## Crédits et paiements

Voir [docs/dev/credits-et-paiements.md](docs/dev/credits-et-paiements.md) (registre, paiement simulé, scénarios de test, tâches asynchrones, fournisseur).

SasPay : [docs/dev/saspay.md](docs/dev/saspay.md). Pays et moyens de paiement administrables : [docs/dev/catalogue-international.md](docs/dev/catalogue-international.md). Pagination serveur : [docs/dev/pagination.md](docs/dev/pagination.md).

## Base de données

Voir [docs/dev/base-de-donnees.md](docs/dev/base-de-donnees.md) (migrations, registre de crédits, sauvegarde et restauration).

## Sécurité

- Les fichiers `.env*` sont ignorés par Git ; seul le `.env.example` de la racine (sans secret) est suivi. Configuration et déploiement : [README.md](../README.md).
- Aucun secret dans les applications Next.js : seules les variables `NEXT_PUBLIC_*` atteignent le navigateur.
