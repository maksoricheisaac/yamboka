# Tests

| Niveau | Outil | Commande | Contenu |
|---|---|---|---|
| API, unitaires | Jest | `pnpm --filter api test` | Config, domaines jetables |
| API, intégration | Jest + supertest + PostgreSQL réel | `pnpm --filter api test:e2e` | Authentification, sessions, CSRF, rôles, Google (client simulé), limitation de débit, registre de crédits (concurrence, idempotence, expiration), paiements simulés, catalogue |
| API, file de tâches | Jest + BullMQ + **Redis** | (inclus dans `test:e2e`) | Callback → worker → crédit unique, rattrapage, tâches planifiées. Utilise la base Redis n° 15, réservée aux tests |
| Navigateur | Playwright | `pnpm test:e2e` | Site public et application (desktop et mobile 360 px) |

## Base de données de test

Les tests d'intégration recréent la base `yamboka_test` à chaque exécution (suppression, création, migrations, seed). Le registre de crédits est volontairement impossible à vider (trigger), d'où une base neuve plutôt qu'un nettoyage. **Garde-fou** : `resetDatabase` refuse toute base dont le nom ne finit pas par `_test` ou `_e2e`.

PostgreSQL **et Redis** doivent tourner : `docker compose -f docker/docker-compose.dev.yml up -d`.

## Tests de navigateur (Playwright)

Pile isolée, pour ne jamais toucher au développement en cours :

| Service | Port | Remarque |
|---|---|---|
| Site public | 3000 | Build requis (`pnpm --filter web build`) ; aucune dépendance à l'API |
| Application | 3101 | Compilée avec `API_INTERNAL_URL` de l'e2e (la réécriture est figée au build) |
| API | 4101 | `NODE_ENV=test`, base `yamboka_e2e` recréée au lancement |

Playwright démarre les trois serveurs lui-même. Premier lancement : `pnpm exec playwright install chromium`.

Projets : `web-desktop`, `web-mobile-360`, `app-desktop`, `app-mobile-360`. Exemple : `pnpm exec playwright test --project=app-desktop -g "connexion"`.

### Charge et nombre de workers

La configuration limite Playwright à **4 workers** (2 en CI). Chaque worker pilote un Chromium, et trois serveurs Node plus PostgreSQL tournent sur la même machine : avec 8 workers sur 8 cœurs, environ 7 % des tests échouaient par délai dépassé (inscription ou paiement qui n'aboutit pas à temps). Ne pas augmenter ce nombre pour « aller plus vite » : cela rend la suite instable sans rien dire du code.

### Conventions des tests

- Chaque page présente sa propre IP (`X-Forwarded-For`) : sinon la règle RG-09 (3 comptes par IP) priverait les derniers comptes de leurs crédits de bienvenue.
- Les liens reçus par e-mail sont lus dans l'outbox de développement de l'API (`/v1/dev/outbox`).
- On attend un **état stable** (un titre, un bouton activé), jamais une URL transitoire : les redirections serveur passent par des URL intermédiaires.
- `appAlerts(page)` exclut l'annonceur de routes de Next, qui est aussi un `role="alert"`.
