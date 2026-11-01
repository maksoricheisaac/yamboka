# Déploiement (Dokploy) et variables d'environnement

Trois services : **api** (NestJS), **app** (Next.js, espace client et administration), **web** (Next.js, site public), plus PostgreSQL 16 et Redis. **Aucune de ces valeurs ne doit être commitée** : elles se saisissent dans l'onglet *Environment* de chaque service Dokploy.

## Ordre de mise en service

1. PostgreSQL et Redis créés ; noter leurs URL internes.
2. **api** : variables ci-dessous, puis commande de déploiement `pnpm --filter api db:deploy` (migrations) avant le démarrage. **Ne pas lancer `db:seed`** en production avec `ADMIN_PASSWORD` : le premier administrateur se crée par le Setup Wizard.
3. **app** et **web** : `API_INTERNAL_URL` est **figée à la compilation** (réécriture `/api/*`) : définissez-la avant le build.
4. Ouvrir `https://<app>/installation`, saisir `SETUP_SECRET`, créer l'administrateur. Puis **retirer `SETUP_SECRET`** et redéployer.
5. Administration → Paramètres → **Tester l'envoi d'e-mails**.

## api

| Variable | Valeur en production |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `4000` |
| `DATABASE_URL` | URL interne PostgreSQL (`postgresql://…`) |
| `REDIS_URL` | URL interne Redis |
| `SESSION_SECRET` | 48 octets aléatoires (`node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`) |
| `COOKIE_DOMAIN` | domaine parent commun, ex. `.votre-domaine.com` |
| `TRUST_PROXY` | nombre de sauts devant l'API : navigateur → Traefik → Next → API = 3 (à vérifier) |
| `API_URL`, `APP_URL`, `WEB_URL` | URL publiques (https) ; `APP_URL` et `WEB_URL` alimentent CORS et la protection CSRF |
| `SETUP_SECRET` | 24 caractères aléatoires, **uniquement avant l'installation** |
| `EMAIL_PROVIDER` | `smtp` |
| `EMAIL_FROM`, `EMAIL_REPLY_TO` | expéditeur du domaine autorisé, ex. `Yamboka <no-reply@votre-domaine.com>` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` | fournis par l'hébergeur de messagerie (587 + `false`, ou 465 + `true`) |
| `EMAIL_OTP_*` | facultatif (défauts : 6 chiffres, 10 min, 5 essais, 60 s, 5 envois/h) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` | facultatif (voir `authentification.md`) |
| `PAYMENT_PROVIDER` | `mock` (phase 1) |
| `GENERATION_PROVIDER`, `HF_API_KEY_ID`, `HF_API_KEY_SECRET` | `mock`, ou `higgsfield` avec ses identifiants (voir `stockage-et-generation.md`) |
| `STORAGE_DRIVER`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` | `r2` en production (`local` est réservé au développement) |

## app

| Variable | Rôle |
|---|---|
| `API_INTERNAL_URL` | adresse **interne** de l'API (build + exécution) |
| `NEXT_PUBLIC_SITE_URL` | URL publique du site (liens légaux, retour au site) |

## web

| Variable | Rôle |
|---|---|
| `API_INTERNAL_URL` | adresse interne de l'API, pour lire les offres publiées (3 packs). Si l'API est injoignable, le site affiche les offres du business plan |
| `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_URL` | URL du site et de l'application (liens Connexion / Créer mon compte, canoniques, sitemap) |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | numéro de contact (facultatif) |

## À faire hors du dépôt

- DNS : enregistrements **SPF, DKIM, DMARC** du domaine (voir `emails-et-otp.md`).
- Sauvegardes PostgreSQL planifiées (voir `base-de-donnees.md`).
- Si un reverse proxy est ajouté : son délai d'inactivité doit rester inférieur à 65 s (voir `authentification.md`).
