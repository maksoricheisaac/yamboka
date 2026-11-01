# Authentification et sécurité d'accès

## Vue d'ensemble

| Élément | Choix |
|---|---|
| Session | Serveur : jeton aléatoire de 256 bits dans un cookie `yamboka_session` (`HttpOnly`, `SameSite=Lax`, `Secure` en production). **Seul le hachage SHA-256 du jeton est stocké** en base. Durée : 30 jours (`SESSION_TTL_DAYS`). |
| Mots de passe | Argon2id (`@node-rs/argon2`), 8 caractères minimum, 128 maximum. |
| Origine unique | Le navigateur ne parle qu'à l'application (`app/`) : `/api/*` est relayé vers l'API par une réécriture Next. Le cookie est donc « même origine » (aucun CORS à gérer côté navigateur). |
| Rôles | `USER` et `ADMIN`. Refus par défaut : toute route est protégée sauf si elle porte `@Public()`. `@Roles('ADMIN')` et `@RequireVerifiedEmail()` complètent. Le rôle n'apparaît dans aucun schéma d'entrée publique. |
| Contrats | Les schémas Zod de `packages/shared` sont utilisés par les formulaires **et** par l'API (la validation définitive reste côté API). |

## Gardes globaux (ordre d'exécution)

1. **Limitation de débit** : par IP (300/min) et par couple IP + e-mail (1 000/min par défaut). Routes sensibles (connexion, inscription, vérification, mot de passe oublié, réinitialisation) : 5/min par couple IP + e-mail et 30/min par IP. Réponse `429 TOO_MANY_REQUESTS`. Désactivée quand `NODE_ENV=test`.
2. **CSRF** : une requête qui modifie des données doit venir d'une origine autorisée (`APP_URL`, `WEB_URL`) ; avec un cookie de session et sans en-tête `Origin`, elle est refusée. S'ajoute à `SameSite=Lax`.
3. **Authentification** : session valide, compte non supprimé, statut `ACTIVE` (un compte suspendu ou banni est coupé immédiatement, même avec une session ouverte).
4. **Rôles**.

Le proxy Next.js (`app/proxy.ts`) ne fait qu'une redirection de confort (absence de cookie). L'identité est vérifiée par `requireUser()` côté serveur Next **et** par l'API sur chaque route.

## Parcours

- **Inscription** : crée le compte, enregistre l'acceptation horodatée (CGU et charte, avec l'IP), ouvre la session et envoie un **code à usage unique** par e-mail. La réponse indique `emailSent` : si l'e-mail n'a pas pu partir, l'interface le dit. L'utilisateur peut explorer l'application mais ni acheter ni créer tant que l'adresse n'est pas vérifiée.
- **Vérification de l'e-mail** : code à 6 chiffres, 10 minutes, usage unique, 5 essais, renvoi limité (voir [emails-et-otp.md](emails-et-otp.md)). Il **remplace le lien de 24 h** : un seul système. Une faute de frappe dans l'adresse se corrige tant qu'elle n'est pas vérifiée (`POST /auth/change-email`).
- **Confirmation de connexion** (optionnelle, réglage `loginOtpMode` : `off` / `admin` / `all`) : le mot de passe est vérifié d'abord, **aucune session n'est ouverte avant le code**. Les comptes Google n'ont pas d'étape supplémentaire.
- **Rôles et administration** : voir [administration.md](administration.md) (séparation des espaces, Setup Wizard du premier administrateur).
- **Aucun crédit offert à l'inscription** : sans vérification par SMS, des comptes multiples (e-mails temporaires, Gmail à la chaîne) permettraient d'abuser d'un essai gratuit. Les crédits s'achètent ; le seul geste commercial automatique est le bonus de premier achat (voir [credits-et-paiements.md](credits-et-paiements.md)). Les adresses jetables sont refusées.
- **Mot de passe oublié** (1 h, usage unique) : réponse identique que l'adresse existe ou non. Une réinitialisation coupe **toutes** les sessions.
- **Connexion** : même message et même durée que le compte existe ou non. Plafond de 5 e-mails par heure et par utilisateur et par type.
- **Suppression de compte** : anonymisation (le registre de crédits et les traces légales sont conservés, RG-34).

### Décision : l'inscription révèle qu'une adresse existe

`POST /auth/register` répond `409 EMAIL_TAKEN` pour une adresse déjà utilisée. C'est le compromis retenu pour permettre d'explorer l'application avant vérification (UF-05, qui exige une session dès l'inscription) ; il est atténué par la limitation de débit. La connexion et le mot de passe oublié, eux, ne révèlent rien.

## Connexion Google

Flux code d'autorisation avec **PKCE** et paramètre **`state`** (cookies `HttpOnly` de 10 minutes). Seule une adresse `email_verified = true` est acceptée.

- Compte e-mail **vérifié** existant : liaison automatique, mot de passe conservé.
- Compte e-mail **jamais vérifié** existant : liaison, **mot de passe effacé et sessions coupées** (un tiers a pu s'inscrire avec l'adresse d'autrui ; son mot de passe ne doit pas survivre).
- Nouveau compte : créé vérifié (sans crédit), acceptation des CGU demandée à la première visite.

### Configuration (à faire une fois)

1. Google Cloud Console → créer un projet → écran de consentement OAuth → identifiants « ID client OAuth » de type *Application Web*.
2. URI de redirection autorisée : `https://<domaine-de-app>/api/auth/google/callback` (en local : `http://localhost:3001/api/auth/google/callback`).
3. Renseigner dans `api/.env` : `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` (la même URL que ci-dessus).

Sans ces trois variables, le bouton Google n'est pas affiché (`GET /auth/providers`).

## Variables d'environnement liées

| Variable | Rôle |
|---|---|
| `SESSION_SECRET` | Au moins 32 caractères (validé au démarrage). |
| `SESSION_TTL_DAYS` | Durée d'une session (30 par défaut). |
| `COOKIE_DOMAIN` | Domaine du cookie en production (vide en local). |
| `TRUST_PROXY` | Nombre de proxys de confiance devant l'API, pour lire la vraie IP (`X-Forwarded-For`). **Doit correspondre au déploiement** : chaîne navigateur → Next → API = 2 ; en ajoutant un reverse proxy (Traefik), compter un saut de plus. Une valeur trop faible fausse la limitation de débit et la règle RG-09 ; trop élevée permet de falsifier l'IP. |
| `API_INTERNAL_URL` (app) | Adresse interne de l'API, **figée à la compilation** pour la réécriture `/api/*`. |

## Tests

- API : `pnpm --filter api test:e2e` (base `yamboka_test` recréée à chaque exécution : 52 tests, dont la concurrence, le CSRF, les rôles, Google simulé et la limitation de débit réelle).
- Navigateur : `pnpm test:e2e` (Playwright ; voir `docs/dev/tests.md`).

## Outils de développement

`GET /v1/dev/outbox?to=<email>` expose les e-mails du mode `console` (codes de vérification, liens de réinitialisation) **hors production uniquement** : le module n'est pas chargé quand `NODE_ENV=production`.

## Connexions keep-alive derrière un proxy (erreurs 500 aléatoires)

Le navigateur parle à `app/`, qui relaie `/api/*` vers l'API. Un proxy réutilise des connexions HTTP keep-alive. Node ferme les siennes après **5 s d'inactivité** par défaut : si le proxy en réutilise une à cet instant précis, il reçoit `ECONNRESET` (« Failed to proxy … socket hang up ») et l'utilisateur voit une erreur 500 aléatoire.

L'API garde donc ses connexions ouvertes **65 s** (`keepAliveTimeout`, `headersTimeout` à 66 s, voir `api/src/main.ts`), pour que ce soit toujours le proxy qui ferme en premier. Si un reverse proxy est ajouté devant (Traefik sous Dokploy), son délai d'inactivité doit rester **inférieur** à 65 s.

Ce correctif réduit la fenêtre de la course mais n'a pas pu être prouvé comme la seule cause d'erreurs sous très forte charge ; en cas d'erreurs 500 intermittentes en production, chercher d'abord `Failed to proxy` dans les journaux de `app/`.
