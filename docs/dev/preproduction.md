# Préproduction (staging) : déploiement, rollback et recette

Trois domaines publics par environnement : **site** (`yamboka.com`), **application** (`app.yamboka.com`, administration sous `/admin`) et **API directe** (`api.yamboka.com`). Cette procédure vaut pour **staging** (`staging.`, `app.staging.`, `api.staging.`) ; la production suit la même procédure, **uniquement après validation explicite**.

> Rien dans ce document ne doit être exécuté sur la production sans autorisation. Les commandes `<…>` sont des paramètres à remplacer ; ne jamais coller de secret dans un terminal partagé, un ticket ou un journal.

## 1. Avant de commencer

- [ ] Branche à déployer identifiée (commits poussés). **Les migrations Prisma de cette branche s'appliquent automatiquement** (service `migrate`) et ne sont pas réversibles : relire `api/prisma/migrations/` avant.
- [ ] Sauvegarde PostgreSQL de l'environnement ciblé (voir `base-de-donnees.md`), **testée en restauration** au moins une fois.
- [ ] Noter la révision actuellement en ligne (tag d'image ou SHA) : c'est la cible du rollback.
- [ ] `.env.staging` prêt (§4), avec des clés **propres à staging** (SasPay, SMTP, R2, Higgsfield, `SESSION_SECRET`, mot de passe PostgreSQL).

## 2. DNS

Enregistrements `A` (ou `AAAA`) vers l'IP du serveur, TTL court (300 s) pendant la bascule :

| Hôte | Staging | Production |
|---|---|---|
| Site | `staging` | `@` |
| Application | `app.staging` | `app` |
| API directe | `api.staging` | `api` |

Pas de wildcard : un certificat par hôte. Vérifier la propagation avant de demander les certificats : `nslookup api.staging.<domaine>` doit renvoyer l'IP du serveur. Si le domaine est derrière Cloudflare, utiliser « DNS only » (nuage gris) tant que les certificats ne sont pas émis.

## 3. Dokploy : domaines, Traefik, certificats

Projet **Compose** : source = le dépôt, branche de l'environnement, *Compose Path* `./docker/docker-compose.staging.yml`, contenu de `.env.staging` collé dans *Environment*. Traefik est celui de Dokploy : **aucun label Traefik, aucun reverse proxy supplémentaire** (le Compose n'en contient pas).

Onglet **Domains**, 4 entrées, HTTPS activé, certificat `letsencrypt`, **Strip Path désactivé** :

| Service | Hôte | Chemin | Port interne |
|---|---|---|---|
| `web` | `staging.<domaine>` | `/` | 3000 |
| `app` | `app.staging.<domaine>` | `/` | 3001 |
| `api` | `app.staging.<domaine>` | `/api/` | 4000 |
| `api` | `api.staging.<domaine>` | `/` | 4000 |

Il n'y a **plus** d'entrée `/api/` sur l'hôte du site. Si elle existe encore, la supprimer.

Points de contrôle Traefik :
- Redirection HTTP→HTTPS : active par entrée (option HTTPS).
- Conflit `app.…/` contre `app.…/api/` : Traefik privilégie la règle la plus longue ; vérifié au §7 (`/api/health` doit renvoyer du JSON, pas la page du front).
- Certificats : émis par HTTP-01, ports 80/443 ouverts. En cas d'échec, vérifier le DNS puis les journaux du conteneur Traefik de Dokploy.
- Aucun port publié sur l'hôte par le Compose : `docker compose ps` ne doit afficher aucune colonne `PORTS` de type `0.0.0.0:…`.

## 4. Variables d'environnement

Le fichier modèle est `.env.example` (une seule source pour tous les services). Chaque conteneur ne reçoit que les variables listées dans le Compose.

| Variable | Service(s) | Valeur staging (exemple) |
|---|---|---|
| `ENV_NAME`, `COMPOSE_PROJECT_NAME` | Compose | `staging`, `yamboka-staging` |
| `DOMAIN`, `APP_DOMAIN`, `API_DOMAIN` | documentation et cohérence | `staging.<d>`, `app.staging.<d>`, `api.staging.<d>` |
| `WEB_URL`, `APP_URL`, `API_URL` | api, builds web/app | `https://staging.<d>`, `https://app.staging.<d>`, `https://api.staging.<d>` |
| `POSTGRES_USER/PASSWORD/DB` | postgres, migrate, api | alphanumérique, **propre à l'env** |
| `SESSION_SECRET` | api | 48 octets aléatoires, ≠ production |
| `COOKIE_DOMAIN` | api | forcé à vide par le Compose (cookie limité à l'hôte) |
| `TRUST_PROXY` | api | `1` |
| `RUN_PROCESSORS` | api | `true` (ou absent) |
| `GOOGLE_CLIENT_ID/SECRET`, `GOOGLE_CALLBACK_URL` | api | callback `https://app.staging.<d>/api/auth/google/callback` |
| `EMAIL_PROVIDER`, `EMAIL_FROM`, `SMTP_*` | api | `smtp`, expéditeur d'un domaine autorisé (SPF/DKIM) |
| `PAYMENT_PROVIDER`, `SASPAY_API_BASE_URL`, `SASPAY_API_KEY`, `SASPAY_WEBHOOK_SECRET` | api | `saspay` + clés **de staging** |
| `GENERATION_PROVIDER`, `HF_API_KEY_ID/SECRET` | api | `higgsfield` (appels réels et payants) |
| `STORAGE_DRIVER`, `R2_*` | api | `r2`, **bucket privé dédié à staging** |
| `REVALIDATE_SECRET` | api, web | identique des deux côtés, 16 caractères minimum |
| `SETUP_SECRET` | api | 24 caractères, **à retirer** après création de l'administrateur |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | web (build) | facultatif |

`NEXT_PUBLIC_SITE_URL` et `NEXT_PUBLIC_APP_URL` sont dérivées de `WEB_URL` et `APP_URL` par le Compose et **figées au build** : une image `web` de staging ne doit jamais être promue en production.

Contrôle des valeurs effectives (sans afficher de secret) :
```
docker compose -p yamboka-staging exec api sh -c 'echo "$API_URL $APP_URL $WEB_URL [$COOKIE_DOMAIN] $RUN_PROCESSORS $NODE_ENV"'
```

## 5. Ordre de démarrage et healthchecks

L'ordre est imposé par `depends_on` :

1. `postgres` (`pg_isready`) et `redis` (`redis-cli ping`) → *healthy*.
2. `migrate` (`prisma migrate deploy`) → s'exécute puis **s'arrête avec le code 0**. S'il échoue, l'API ne démarre pas.
3. `api` → healthcheck sur `http://127.0.0.1:4000/api/health` (vérifie aussi la base).
4. `web` et `app` → démarrent quand l'API est *healthy* ; healthchecks sur `/` (3000) et `/connexion` (3001).

```
docker compose -p yamboka-staging ps                       # tous « healthy », migrate « exited (0) »
docker compose -p yamboka-staging logs --tail=100 migrate  # migrations appliquées, aucune erreur
docker compose -p yamboka-staging logs --tail=100 api      # « Nest application successfully started », aucun avertissement de configuration
```

## 6. Communications internes

Depuis les conteneurs (noms DNS internes, jamais les domaines publics) :
```
docker compose -p yamboka-staging exec app node -e "fetch('http://api-staging:4000/api/health').then(r=>r.text()).then(console.log)"
docker compose -p yamboka-staging exec web node -e "fetch('http://api-staging:4000/api/health').then(r=>r.text()).then(console.log)"
docker compose -p yamboka-staging exec api node -e "fetch('http://web-staging:3000/').then(r=>console.log(r.status))"
docker compose -p yamboka-staging exec redis redis-cli ping           # PONG
docker compose -p yamboka-staging exec postgres pg_isready            # accepting connections
```
Redis et la file BullMQ : les journaux de l'API ne doivent montrer aucune erreur de connexion, et un paiement ou une création (§9) doit être traité sans intervention.

## 7. Mise en service, dans l'ordre

1. Créer les enregistrements DNS (§2), attendre la propagation.
2. Créer le projet Compose et coller `.env.staging` (§3, §4). **Ne pas déployer encore** si une sauvegarde manque.
3. Créer les 4 entrées *Domains* (§3).
4. Déployer ; suivre §5 et §6.
5. Ouvrir `https://app.staging.<d>/installation`, saisir `SETUP_SECRET`, créer l'administrateur, **retirer `SETUP_SECRET`** puis redéployer.
6. Administration → Paramètres → *Tester l'envoi d'e-mails*.
7. Dans SasPay (compte de staging) : webhook `https://api.staging.<d>/api/webhooks/saspay`, noter le secret de signature dans `SASPAY_WEBHOOK_SECRET`, envoyer `webhook.test`.
8. Dans Google Cloud : URI de redirection et origine JavaScript de staging.
9. Dérouler la checklist (§9 et §10).

## 8. Rollback

Principe : **ne jamais supprimer de volume** (`pgdata`, `redisdata`, `storage`) ; jamais `down -v`.

| Situation | Action |
|---|---|
| Un domaine ou un certificat ne répond pas | Corriger l'entrée *Domains* ou le DNS. Aucun redéploiement n'est nécessaire. En dernier recours, supprimer l'entrée fautive : les autres hôtes continuent de fonctionner. |
| Code défaillant, **sans migration** | Redéployer la révision précédente (commit ou `IMAGE_TAG` précédent). Les données ne sont pas touchées. |
| Migration appliquée, code défaillant | Les migrations Prisma sont **uniquement en avant** : ne pas essayer de les défaire à la main. Si la migration est rétro-compatible (ajout de colonne ou de table), redéployer le code précédent. Sinon, **restaurer la sauvegarde d'avant déploiement** dans une base propre, après accord explicite, puis redéployer la révision précédente. |
| Webhook SasPay défaillant sur la nouvelle URL | Remettre `https://app.<…>/api/webhooks/saspay` dans SasPay (l'ancienne URL est toujours servie). Les paiements manqués sont rattrapés par la réconciliation (toutes les 2 min). |
| Garde d'hôte refusant à tort (403 `SESSION_NOT_ALLOWED_ON_API_HOST`) | Redéployer la révision précédente, ou aligner `API_URL` si la valeur est erronée. |
| Problème de tâches de fond | Vérifier `RUN_PROCESSORS` (doit valoir `true` tant qu'aucun worker n'existe) ; consulter les journaux de l'API. |

Après tout rollback : refaire `ps`, `/api/health` sur les deux hôtes, et un parcours de connexion.

## 9. Checklist de recette staging

Cocher chaque ligne ; noter la date, l'environnement et la révision testée.

### Domaines et HTTPS
- [ ] `curl -I https://staging.<d>/` → 200, la landing ; `curl -I http://staging.<d>/` → redirection vers HTTPS.
- [ ] `https://staging.<d>/api/health` → **404** (le site public ne sert plus l'API).
- [ ] `https://app.staging.<d>/connexion` → page de connexion ; `https://app.staging.<d>/admin` sans session → redirection vers `/connexion`.
- [ ] `curl -s https://app.staging.<d>/api/health` → `{"status":"ok","database":"up",…}` (JSON, pas HTML) : reverse proxy et priorité de route corrects.
- [ ] `curl -s https://api.staging.<d>/api/health` → même JSON : accès direct.
- [ ] Certificats valides sur les trois hôtes : `curl -vI https://<hôte>/ 2>&1 | grep -E "subject:|expire|issuer:"` ; aucun avertissement dans le navigateur.
- [ ] Aucun quatrième hôte public n'est nécessaire ni configuré.

### Authentification et sessions
- [ ] Inscription et connexion par e-mail (code reçu par SMTP réel).
- [ ] Connexion Google de bout en bout, retour sur `app.staging.<d>` connecté.
- [ ] Cookie `yamboka_session` : `HttpOnly`, `Secure`, `SameSite=Lax`, **sans attribut Domain**, présent uniquement pour `app.staging.<d>` (outils du navigateur → Stockage).
- [ ] Déconnexion : le cookie est supprimé et `/app` redirige vers `/connexion`.
- [ ] Administration : un compte non administrateur reçoit un refus sur `/admin` et sur `/api/admin/*` ; l'administrateur accède au tableau de bord.

### Réseau interne
- [ ] `docker compose ps` : aucun port publié pour `postgres`, `redis`, `migrate`.
- [ ] Depuis une machine **extérieure** : `nc -zv <IP-serveur> 5432` et `nc -zv <IP-serveur> 6379` → refus ou délai dépassé. Idem pour `<IP-serveur> 4000/3000/3001`.
- [ ] Communications internes du §6 réussies.

### Stockage (Cloudflare R2)
- [ ] Téléverser une image de départ dans une création : succès.
- [ ] Télécharger le résultat (`/api/creations/<id>/file`) depuis un compte propriétaire : succès.
- [ ] Le bucket est **privé** : l'URL directe d'un objet R2 sans signature est refusée.

### Génération (fournisseurs réels, coûts réels)
- [ ] Une création vidéo de bout en bout : crédits débités, résultat visible et téléchargeable, notification reçue.
- [ ] Une création en échec : crédits restitués **une seule fois**.
- [ ] Génération d'images : **hors périmètre**, l'application est 100 % vidéo depuis la branche `feat/video-only` (la mission mentionnait « vidéo et image » ; confirmer que cette vérification est sans objet).

### Paiement SasPay (staging, argent réel)
- [ ] Initier l'achat d'un pack minimal ; payer ; le statut passe à *succès* ; les crédits sont ajoutés **une seule fois** (le solde et le journal le confirment).
- [ ] Le webhook de la nouvelle URL a été reçu : journaux de l'API, `webhook.test` en 200 dans le tableau de bord SasPay, ligne dans les événements de paiement.
- [ ] Le même webhook rejoué (bouton de SasPay) ne crédite pas une seconde fois.
- [ ] Paiement échoué ou annulé : aucun crédit.
- [ ] L'URL de retour après paiement ramène sur `https://app.staging.<d>/app/credits/paiement/<id>`.

## 10. Tests de sécurité

Utiliser deux comptes de recette, A et B, et un administrateur. Aucune donnée de production.

### Isolation entre utilisateurs
Chaque ligne : connecté en **B**, cibler une ressource de **A** ; attendre 404 ou 403, **jamais** les données de A.
- [ ] `GET /api/creations/<id-de-A>` et `/api/creations/<id-de-A>/file`
- [ ] `DELETE /api/creations/<id-de-A>` puis vérifier, côté A, que la création existe toujours
- [ ] `POST /api/creations/<id-de-A>/report` ne révèle rien sur A
- [ ] `GET /api/payments/<id-de-A>` et `/api/payments/<id-de-A>/receipt`
- [ ] Notifications de A : introuvables pour B
- [ ] `GET /api/admin/...` avec B → 403
- [ ] Sans cookie : toutes les routes précédentes → 401
- [ ] Les équivalents sont couverts en automatique par les e2e `Isolation` (`payments`, `saspay-payments`, `notifications`, `creations`) ; la recette confirme le comportement derrière Traefik.

### Callback ou webhook falsifié : aucun crédit
Noter le solde de A avant, comparer après chaque test.
- [ ] `curl -i -X POST https://api.staging.<d>/api/webhooks/saspay -H "Content-Type: application/json" -d '{"event":"transaction.success","data":{"id":"<réf. d'un paiement ouvert de A>"}}'` → **403** `WEBHOOK_SIGNATURE_INVALID`, solde inchangé.
- [ ] Même requête avec un en-tête `X-Webhook-Signature` aléatoire et un `X-Webhook-Timestamp` actuel → 403, solde inchangé.
- [ ] Même requête sur l'ancienne URL (`app.staging.<d>/api/webhooks/saspay`) → 403.
- [ ] `curl -i -X POST https://api.staging.<d>/api/webhooks/payment -H "Content-Type: application/json" -d '{"reference":"<réf.>"}'` → **404** (route du fournisseur simulé fermée dès que `PAYMENT_PROVIDER=saspay`), solde inchangé.
- [ ] Un webhook correctement signé annonçant un succès pour un paiement que SasPay ne confirme pas : le paiement reste ouvert, aucun crédit (le contenu n'est jamais cru ; vérifié par `saspay-payments.e2e-spec.ts`).
- [ ] Un paiement dont le montant ne correspond pas : aucun crédit, statut *échoué* « vérification manuelle requise » (e2e `montant incorrect`).

### Garde d'hôte API
- [ ] `curl -i https://api.staging.<d>/api/auth/me -H "Cookie: yamboka_session=<jeton valide de A>"` → **403** `SESSION_NOT_ALLOWED_ON_API_HOST`.
- [ ] Le même appel **sans** cookie → 401 ; `GET /api/health` → 200 ; le webhook `webhook.test` signé → 200.
- [ ] La même requête avec cookie sur `https://app.staging.<d>/api/auth/me` → 200.

### En-têtes et exposition
- [ ] `curl -sI https://app.staging.<d>/` : `Strict-Transport-Security` présent (si géré) ; aucune fuite de version de serveur.
- [ ] `/api/docs` (Swagger) → 404 en `NODE_ENV=production`.
- [ ] Aucun secret dans les journaux : `docker compose logs api | grep -Ei "sk_live|sk_test|signing|secret"` ne ramène rien d'autre que des noms de variables.

## 11. Passage en production (rappel)

Interdit sans accord explicite. Prérequis : recette staging intégralement cochée, sauvegarde de production restaurable, DNS `api` créé, entrée `/api/` du site supprimée, SasPay de production configuré (nouvelle URL **ajoutée** avant tout retrait de l'ancienne), `SETUP_SECRET` absent, rollback relu.
