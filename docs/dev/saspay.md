# SasPay — intégration du paiement

SasPay est le **seul fournisseur de paiement réel** de Yamboka (`PAYMENT_PROVIDER=saspay`). OpenPay a été supprimé : plus de
code, de réglage ni de variable d'environnement, et **aucun repli silencieux** vers un autre fournisseur. Les paiements déjà
enregistrés ne sont jamais supprimés : leur fournisseur reste lisible dans `Payment.gateway` et dans le journal des paiements.

Référence : `docs/SASPAY_INTEGRATION_GUIDE.md` (photo de la documentation officielle du 1er novembre 2026) et https://docs.saspay.me.
**Clés de test (`sk_test_…`)** : d'après `docs/SKILL_SASPAY.md`, SasPay propose une clé de test (sandbox) en plus de la clé `sk_live_…`. Cette
information n'a **pas encore été vérifiée** sur notre compte : la clé actuellement configurée est une `sk_live_…`, qui déclenche de vrais paiements.
Où la trouver : tableau de bord `app.saspay.me`, section Développeur (génération d'une clé de test). Tant qu'elle n'est pas obtenue, les tests
automatiques utilisent un faux fournisseur fidèle à la documentation ; ils ne prouvent pas qu'un paiement réel aboutit. Avec une clé `sk_test_…`,
mettre `SASPAY_API_KEY=sk_test_…` en développement (le format est déjà accepté) puis rejouer : paiement réussi, échoué, webhook `webhook.test`.

## Architecture

| Élément | Fichier | Rôle |
|---|---|---|
| Client HTTP | `api/src/payments/saspay/saspay.provider.ts` | initiation, vérification, tarifs du compte ; clé uniquement dans l'en-tête `Authorization` |
| Traduction | `saspay.mapper.ts` | statuts SasPay → `INITIATED / PENDING / SUCCESS / FAILED / CANCELLED`, montants entiers |
| Webhook | `saspay.webhook.ts`, `webhooks.controller.ts` | signature HMAC, anti-rejeu, déduplication |
| Cycle de vie | `payments.service.ts` | devis, création, vérification, crédit idempotent, rattrapage |
| Catalogue | `api/src/payments/catalog/` | pays et moyens autorisés (voir [catalogue-international.md](catalogue-international.md)) |

## Endpoints SasPay utilisés

| Appel | Usage |
|---|---|
| `POST /payments/softpay/` | initier un paiement (pays, réseau, montant, devise, client, `metadata`, `return_url`), avec `Idempotency-Key` |
| `GET /payments/{id}/verify/` | statut réel, interrogé avant tout crédit |
| `GET /pricing/my-rates/` | tarif d'encaissement du compte par pays et réseau (cache 1 h) ; un réseau absent fait refuser le paiement avant tout débit |

Remboursements : non pris en charge par notre intégration (aucun endpoint documenté utilisé). Un remboursement client se fait hors ligne.

## Sécurité du paiement

- **Jamais de crédit sur la foi d'un webhook** : le webhook ne fait que déclencher une vérification `GET /payments/{id}/verify/`.
- La vérification compare l'identifiant, le montant envoyé (`sentAmount`) et la devise ; une différence bloque le crédit.
- **Idempotence** : une `Idempotency-Key` par paiement ; un timeout rejoue la même clé et le même corps ; le crédit passe par une
  référence unique du registre (`pay:<référence>`), donc deux notifications ou deux vérifications ne créditent qu'une fois.
- **Webhook** `POST /api/webhooks/saspay` : signature HMAC-SHA256 du corps **brut** (`x-webhook-signature`) avec horodatage
  (`x-webhook-timestamp`, tolérance 300 s) ; signature fausse → 403 sans effet ; événements dédupliqués (`PaymentWebhookEvent`).
- Le pays, le moyen et la devise sont **revalidés par le serveur** à chaque paiement (catalogue) : rien ne vient du navigateur.
- Traçabilité : référence fournisseur, requête figée (`providerRequest`, sans secret), tarif appliqué (`feeSnapshot`), instantané
  pays / moyen (`countryName`, `methodCode`, `methodName`), chronologie dans `/admin/paiements/[id]`.

## Variables d'environnement

| Variable | Rôle |
|---|---|
| `PAYMENT_PROVIDER` | `mock` (développement, tests) ou `saspay` |
| `SASPAY_API_BASE_URL` | `https://api.saspay.me/api/v1` par défaut (HTTPS obligatoire) |
| `SASPAY_API_KEY` | clé `sk_live_…` de scope PAYIN, **serveur uniquement** |
| `SASPAY_WEBHOOK_SECRET` | `signing_secret` du webhook (≥ 16 caractères), obligatoire en production |
| `SASPAY_TIMEOUT_MS` | délai d'un appel (15 000 par défaut) |

## Configurer le webhook

Dans le tableau de bord SasPay : URL publique `https://<api>/api/webhooks/saspay`, événements de transaction, puis copier le
`signing_secret` (affiché une seule fois) dans `SASPAY_WEBHOOK_SECRET`. En développement, un tunnel (ngrok) change d'adresse à
chaque redémarrage de sa version gratuite : mettre à jour l'URL chez SasPay.

## Limites connues, à confirmer avec SasPay

- Montant minimum par paiement non publié (`PAYMENT_LIMITS` : 500, minimum commercial prudent).
- Durée de validité de l'`Idempotency-Key` non documentée.
- Réseaux exigeant un code OTP (Orange Money CI et BF, Wizall SN) et paiement **par carte** (USD, page hébergée) : non intégrés,
  donc non activables dans le catalogue.
- Congo-Brazzaville (`mtn_cg`, `airtel_cg`) : le guide du 1er novembre ne les liste pas, le code les utilise depuis le lancement.
  À confirmer par un paiement réel.
- Les frais affichés dans le catalogue sont **indicatifs** ; le coût réel vient de `GET /pricing/my-rates/` et du contrat marchand.

## Frais d'encaissement : le pourcentage porte sur le montant DÉBITÉ

Mesure du 1er novembre 2026 (MTN Congo, palier 5,7 % `ADD_ON`) : montant envoyé 473 F, frais facturés 28 F,
client débité **501 F** pour un prix affiché à 500 F. Appliquer 5,7 % au montant envoyé donnait 27 F, soit une
sous-estimation d'un franc — le client payait un franc de trop. 501 × 5,7 % = 28,56 → 28, et 501 − 28 = 473 :
le pourcentage porte sur le montant débité.

`fees.ts` calcule donc `frais = A × p ÷ (1 − p) + fixe`, arrondi au-dessus. La prévision MAJORE toujours les
frais réels (29 prévus contre 28 facturés sur la mesure), donc le client ne paie jamais plus que le prix
affiché ; Yamboka absorbe environ 2 F de plus pour 500 F. Conséquence sur la grille : un pack à 5 000 F
rapporte 4 715 F nets, contre 4 730 estimés auparavant.

SasPay n'expose **aucun calcul de frais exact** avant paiement : seulement la grille `/pricing/my-rates/`
(dont la formule n'est pas documentée) et, après coup, `client_fee`, `debited_amount` et le bloc `amounts` de
la transaction. L'écart entre frais prévus et frais constatés doit donc être surveillé sur chaque paiement
(alerte au-delà de 0,5 point) : c'est le prochain lot.
