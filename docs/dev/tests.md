# Tests

| Niveau | Outil | Commande | Contenu |
|---|---|---|---|
| API, unitaires | Jest | `pnpm --filter api test` | Config (dont SMTP et OTP), domaines jetables, tarification, expiration des crédits, modèles d'e-mails |
| API, intégration | Jest + supertest + PostgreSQL réel | `pnpm --filter api test:e2e` | Authentification, sessions, CSRF, rôles, Google (client simulé), limitation de débit, registre de crédits (concurrence, idempotence, expiration), paiements simulés, catalogue, **codes OTP** (`otp`), **Setup Wizard** (`setup`), **administration** (`admin`) |
| API, file de tâches | Jest + BullMQ + **Redis** | (inclus dans `test:e2e`) | Callback → worker → crédit unique, rattrapage, tâches planifiées. Utilise la base Redis n° 15, réservée aux tests |
| Navigateur | Playwright | `pnpm test:e2e` | Site public et application (desktop et mobile 360 px) |

## Bases de données de test

Trois suites modifient des données **globales** (paramètres, packs, absence d'administrateur) : elles utilisent leur **propre base** pour ne pas perturber les suites exécutées en parallèle. Le module `test/isolate-*-db.ts`, importé **avant** les helpers, redirige `DATABASE_URL` :

| Suite | Base | Particularité |
|---|---|---|
| `admin.e2e-spec.ts` | `yamboka_admin_test` | migrée et seedée (administrateur de test) |
| `setup.e2e-spec.ts` | `yamboka_setup_test` | **vierge** (migrations seules, ni seed ni administrateur) : c'est le seul moyen de tester le Setup Wizard |
| `otp.e2e-spec.ts` | `yamboka_test` | rétablit le délai de renvoi (60 s) et le plafond horaire (5) que les autres suites désactivent |

Le mode de confirmation de connexion (`loginOtpMode`) est simulé par un espion sur `SettingsService` propre au processus de la suite : le réglage n'est jamais modifié en base partagée.

### Base de test principale

Les tests d'intégration recréent la base `yamboka_test` à chaque exécution (suppression, création, migrations, seed). Le registre de crédits est volontairement impossible à vider (trigger), d'où une base neuve plutôt qu'un nettoyage. **Garde-fou** : `resetDatabase` refuse toute base dont le nom ne finit pas par `_test` ou `_e2e`.

PostgreSQL **et Redis** doivent tourner : `docker compose -f docker/docker-compose.dev.yml up -d`.

## Tests de navigateur (Playwright)

Pile isolée (ports 3100, 3101 et 4101, jamais ceux du développement 3000, 3001 et 4000), pour ne jamais gêner le travail en cours :

| Service | Port | Remarque |
|---|---|---|
| Site public | 3100 | Compilé par Playwright avec un numéro WhatsApp factice ; aucune dépendance à l'API |
| Application | 3101 | Compilée avec `API_INTERNAL_URL` de l'e2e (la réécriture est figée au build) |
| API | 4101 | `NODE_ENV=test`, base `yamboka_e2e` recréée au lancement |

Playwright démarre les trois serveurs lui-même. Pour ne jamais perturber un serveur de développement en cours, l'API de test est compilée dans `api/dist-e2e` (et non `dist`) et les builds Next dans `.next-e2e` (variable `NEXT_DIST_DIR`). Premier lancement : `pnpm exec playwright install chromium`.

Projets : `web-desktop`, `web-mobile-360`, `app-desktop`, `app-mobile-360`. Exemple : `pnpm exec playwright test -c tests/playwright.config.ts --project=app-desktop -g "connexion"`.

### Charge et nombre de workers

La configuration limite Playwright à **4 workers** (2 en CI). Chaque worker pilote un Chromium, et trois serveurs Node plus PostgreSQL tournent sur la même machine : avec 8 workers sur 8 cœurs, environ 7 % des tests échouaient par délai dépassé (inscription ou paiement qui n'aboutit pas à temps). Ne pas augmenter ce nombre pour « aller plus vite » : cela rend la suite instable sans rien dire du code.

### Conventions des tests

- Chaque page présente sa propre IP (`X-Forwarded-For`) : pour que les comptes de test restent isolés les uns des autres (usage historique : la règle RG-09, supprimée, limitait les comptes par IP).
- Les codes et liens reçus par e-mail sont lus dans l'outbox de développement de l'API (`/v1/dev/outbox`) : `codeFor` (code à 6 chiffres) et `tokenFor` (lien de réinitialisation).
- `signUpVerified` = inscription + saisie du code : arrive sur le tableau de bord d'un compte vérifié (solde nul : aucun crédit offert). `signUp` seul s'arrête sur `/verifier-email`. **Attendre l'URL avant de naviguer ailleurs**, sinon la requête d'inscription en cours est abandonnée.
- Le délai de renvoi des codes est réduit à 3 s dans l'e2e (`EMAIL_OTP_RESEND_COOLDOWN_SECONDS`).
- La déconnexion se fait par le menu du compte (`logOut`) ; l'administrateur se connecte avec `adminLogin`.
- Les tests d'administration qui modifient des données le font sur des **comptes créés pour le test** (jamais sur les packs ou paramètres globaux, partagés entre projets Playwright qui tournent en parallèle) ; les changements globaux sont couverts côté API sur base isolée.
- On attend un **état stable** (un titre, un bouton activé), jamais une URL transitoire : les redirections serveur passent par des URL intermédiaires.
- `appAlerts(page)` exclut l'annonceur de routes de Next, qui est aussi un `role="alert"`.
