# SasPay — Guide d'intégration complet (développeur)

> Document compilé le 1er novembre 2026 à partir de la documentation officielle (`https://docs.saspay.me`), de sa spécification OpenAPI (`https://docs.saspay.me/api-reference/openapi.json`) et de l'endpoint public `GET /countries/`.
> En cas de doute, **la spécification OpenAPI fait foi**. Les incohérences repérées dans la doc officielle sont listées en [§ 14](#14-incohérences-et-pièges-repérés-dans-la-doc).

---

## Sommaire

1. [Présentation](#1-présentation)
2. [Base URL, environnements, authentification, scopes](#2-base-url-environnements-authentification-scopes)
3. [Création du compte et première clé API (onboarding)](#3-création-du-compte-et-première-clé-api-onboarding)
4. [Ce qui est accessible par clé API vs dashboard uniquement](#4-ce-qui-est-accessible-par-clé-api-vs-dashboard-uniquement)
5. [Conventions transverses (réponses, erreurs, idempotence, pagination, montants, téléphone, rate limit)](#5-conventions-transverses)
6. [Pays, devises, réseaux (opérateurs)](#6-pays-devises-réseaux-opérateurs)
7. [OTP : pré-paiement et confirmation](#7-otp--pré-paiement-et-confirmation)
8. [Frais : `fee_charge_mode` et lecture des montants](#8-frais--fee_charge_mode-et-lecture-des-montants)
9. [Référence des endpoints](#9-référence-des-endpoints)
10. [Webhooks](#10-webhooks)
11. [Modèles de données (objets)](#11-modèles-de-données-objets)
12. [Flux d'intégration recommandés](#12-flux-dintégration-recommandés)
13. [Checklist de mise en production](#13-checklist-de-mise-en-production)
14. [Incohérences et pièges repérés dans la doc](#14-incohérences-et-pièges-repérés-dans-la-doc)
15. [Annexes (codes d'erreur, référentiel complet des 202 pays, ressources)](#15-annexes)

---

## 1. Présentation

SasPay est un agrégateur de paiement (API REST unique) pour l'Afrique de l'Ouest, du Centre et de l'Est. Il permet :

| Capacité | Description | Groupe d'API |
|---|---|---|
| **Encaisser (payin)** | Mobile money ou carte, via **softpay** (push direct sur le téléphone) ou **checkout hébergé** (page SasPay) | Paiements |
| **Liens de paiement** | Liens réutilisables à partager (email, SMS, site, réseaux sociaux) | Liens de paiement |
| **Payer un bénéficiaire (payout)** | Envoyer de l'argent depuis votre solde vers un numéro mobile money | Retraits |
| **Suivre les opérations** | Historique unifié, tentatives de routage, journal des statuts, export CSV, facture PDF | Transactions |
| **Gérer les soldes** | Un wallet par pays, taux de change, transferts entre wallets | Wallet |
| **Être notifié** | Webhooks signés HMAC-SHA256 | Webhooks |
| **Catalogue & tarifs** | Pays, réseaux, vos tarifs par réseau, exigences OTP | Référence |

SasPay route chaque paiement vers un **gateway** (fournisseur) choisi par son moteur de routage ; si une route échoue, il peut en essayer une autre (voir `transaction-attempts`). Vous ne voyez jamais l'identité du gateway (sauf dans certains champs bruts, cf. § 14).

Liens utiles :
- Tableau de bord : https://app.saspay.me
- Support : https://app.saspay.me/dashboard/support
- Doc : https://docs.saspay.me — version LLM : https://docs.saspay.me/llms-full.txt
- OpenAPI : https://docs.saspay.me/api-reference/openapi.json

---

## 2. Base URL, environnements, authentification, scopes

### Base URL

```
https://api.saspay.me/api/v1
```

Toutes les routes se terminent par un **slash final** (`/payments/softpay/`, pas `/payments/softpay`).

### Authentification par clé API

```http
Authorization: Bearer sk_live_xxxxxxxxxxxxxxxxxxxx
Content-Type: application/json
```

| Préfixe | `environment` | Usage |
|---|---|---|
| `sk_test_...` | `SANDBOX` | Tests, pas d'argent réel |
| `sk_live_...` | `LIVE` | Production, argent réel |

**Règles absolues :**
- La clé est **secrète** et donne accès à l'encaissement, aux retraits et au solde. **Uniquement côté backend.** Jamais dans un frontend, une app mobile, des logs ou Git.
- La clé complète (`secret`) n'est affichée **qu'une seule fois**, à sa création. Perdue = à régénérer.
- Stockage : gestionnaire de secrets ou variable d'environnement.

### Scopes de clé

| `scope` | Autorise |
|---|---|
| `PAYIN` | Encaissement (softpay, checkout, liens de paiement, retry) |
| `PAYOUT` | Retraits, création de transferts interwallet |
| `BOTH` (défaut) | Tout |

Un scope insuffisant renvoie `403`. Bonne pratique : une clé `PAYIN` pour le service qui encaisse, une clé `PAYOUT` séparée (et mieux protégée) pour le service qui décaisse.

### Deux types de jetons à ne pas confondre

| Jeton | Format | Sert à |
|---|---|---|
| **Clé API** | `sk_live_...` / `sk_test_...` | Toute l'intégration (paiements, retraits, lecture…) |
| **JWT de session** | `eyJhbGciOi...` (obtenu via `/auth/login/`) | Uniquement l'onboarding : création marchand, KYC, création de clés API, gestion webhooks… (= ce que fait le dashboard) |

Header optionnel côté JWT : `X-Merchant-Id` (choisir le marchand quand un compte en gère plusieurs). Ignoré avec une clé API (une clé = un marchand).

---

## 3. Création du compte et première clé API (onboarding)

> Ces étapes se font **avec un JWT**, pas une clé API (la clé n'existe pas encore). On peut les faire depuis le dashboard ou les automatiser en API.

| # | Étape | Appel | Auth |
|---|---|---|---|
| 1 | Créer l'utilisateur | `POST /users/` `{full_name, email, country (uuid), password}` — envoie un code par email | Public |
| 2 | Vérifier l'email | `POST /auth/verify-email/` `{email, code}` | Public |
| 3 | Se connecter | `POST /auth/login/` `{email, password}` → `data.tokens.access` / `refresh` | Public |
| 4 | Créer le marchand (la « boutique ») | `POST /merchants/` `{name, website_url, category}` → `kyc_status: "NONE"`, `is_active: false` | JWT |
| 5a | Créer le dossier KYC | `POST /merchant-kyc/` `{merchant, kyc_type: "BUSINESS", first_name, last_name, company_name, rccm_number, ifu_number}` | JWT |
| 5b | Uploader chaque pièce | `POST /merchant-kyc/upload/` (multipart `file`, image ou PDF, 10 Mo max) → `data.url` | JWT |
| 5c | Attacher la pièce au dossier | `POST /merchant-kyc/{id}/documents/` `{document_type, file_url}` | JWT |
| 6 | Attendre la validation admin | Email envoyé ; `kyc_status` → `VERIFIED`, `is_active` → `true` | — |
| 7 | Créer la clé API | `POST /merchant-api-keys/` `{name, environment: "LIVE"|"SANDBOX", scope: "PAYIN"|"PAYOUT"|"BOTH"}` → `data.secret` (**une seule fois**) | JWT |

Détails :
- Étape 3 : si `403 email_not_verified`, l'étape 2 n'est pas faite. Si la 2FA est active, la réponse contient `pending_2fa_token` au lieu de `tokens` → étape `POST /auth/login/verify-2fa/` (non documentée).
- `country` à l'étape 1 = **UUID** du pays (récupéré via `GET /countries/`), pas le code ISO.
- Un utilisateur peut posséder **plusieurs marchands**.
- `document_type` (5c) : `ID_CARD`, `PASSPORT`, `SELFIE`, `BUSINESS_REGISTRATION`, `FISCAL`, `OTHER`.
- Réponse de l'étape 7 :

```json
{
  "success": true,
  "data": {
    "id": "d4e5...", "merchant": "8a2f...", "name": "Backend production",
    "key_prefix": "sk_live_AbCdEfGh", "environment": "LIVE", "scope": "BOTH",
    "is_active": true, "expires_at": null, "last_used_at": null,
    "secret": "sk_live_<secret-complet-affiché-une-seule-fois>"
  },
  "code": 201
}
```

### 3.1 KYC particulier (compte non-entreprise) — non documenté mais existant

La doc officielle ne montre que `kyc_type: "BUSINESS"` (RCCM, IFU, nom de société). **Il existe pourtant un KYC pour particulier**, constaté en pratique :

- **Pièces demandées** : photo de la pièce d'identité **recto et verso** + **selfie** du titulaire de la pièce. Aucun document d'entreprise (RCCM, IFU, statuts).
- **C'est le type de compte utilisé pour Yamboka** : le compte SasPay de Riche Isaac Makso est un compte particulier, validé avec ces seules pièces, et il peut **générer des clés API** et **créer des liens de paiement**. L'accès à l'API documentée dans ce guide est donc le même que pour un compte entreprise.
- La valeur exacte de `kyc_type` pour ce parcours (ex. `INDIVIDUAL`, `PERSONAL`) et la façon d'envoyer le recto/verso (deux documents `ID_CARD` ou un seul fichier) ne sont pas documentées. Sans importance si l'onboarding se fait depuis le dashboard, ce qui est notre cas.

Points **à vérifier** pour un compte particulier (la doc ne dit rien de différent, mais rien ne garantit l'égalité avec un compte entreprise) :

| Point | Comment vérifier |
|---|---|
| Retraits (payouts) autorisés | Appel `POST /payouts/initialize/` en sandbox → `403 payout_not_enabled` si désactivé ; ou dashboard |
| Plafonds (montant par transaction, volume mensuel) | Dashboard / support SasPay |
| Réseaux et tarifs ouverts pour ce compte (dont Congo-Brazzaville) | `GET /pricing/my-rates/` avec la clé du compte |

---

## 4. Ce qui est accessible par clé API vs dashboard uniquement

| Domaine | Accès clé API |
|---|---|
| Paiements, retraits (payouts), transactions, liens de paiement | **Complet** |
| Soldes wallet, taux de change | **Lecture seule** |
| Transferts interwallet | Lecture + création (`PAYOUT`/`BOTH` pour créer) |
| Webhooks (points de réception, abonnements, historique de livraison) | **Lecture seule** |
| Pays, réseaux, mes tarifs | Lecture |
| Compte marchand, KYC, clés API, méthodes de retrait, demandes de retrait (settlements), relevé détaillé du wallet, création/modification/suppression de webhooks et abonnements, renvoi manuel d'un webhook, rotation du secret webhook | **Aucun — dashboard uniquement** |

Une clé API ne peut **jamais** gérer les clés API (ni se révoquer elle-même) ni lire/modifier le profil marchand.

Exception notable mentionnée par la doc : la whitelist IP serait gérable via `POST /merchant-ip-whitelist-entries/` « accessible par clé API » (endpoint absent de l'OpenAPI, cf. § 14).

---

## 5. Conventions transverses

### 5.1 Enveloppe de réponse (toujours)

```json
// Succès
{ "success": true, "data": { ... }, "code": 200 }

// Erreur métier
{ "success": false, "error": { "message": "Solde disponible insuffisant.", "code": "insufficient_balance" }, "code": 422 }

// Erreur de validation (une entrée par champ invalide)
{ "success": false, "error": { "amount": ["Ce champ est obligatoire."], "currency": ["..."] }, "code": 400 }
```

➡️ Le contenu utile est **toujours dans `data`**. Les exemples de réponses de ce guide montrent le contenu de `data`.
➡️ Pour distinguer les deux formes d'erreur : si `error.code` est une chaîne → erreur métier (testable), sinon → objet `champ → [messages]`.
➡️ Exceptions : `/transactions/export/` (CSV binaire) et `/transactions/{id}/invoice/` (PDF binaire).

### 5.2 Codes HTTP

| Code | Signification |
|---|---|
| `200` / `201` / `204` | Succès / créé / supprimé |
| `400` | Corps invalide (champ manquant, format) ou opération non applicable (`otp_not_applicable`, `invalid_flow` sur retry) |
| `401` | Clé API manquante, invalide ou expirée |
| `403` | Ressource d'un autre compte, compte suspendu, scope insuffisant, `ip_not_whitelisted`, `payout_not_enabled` |
| `404` | Ressource introuvable |
| `409` | Conflit d'état (Idempotency-Key réutilisée avec un autre corps / requête en cours, transaction déjà terminale, session non PENDING…) |
| `410` | Ressource expirée (lien de paiement, session de checkout) |
| `422` | Requête valide mais inexécutable (solde insuffisant, pas de route…) |
| `429` | Rate limit dépassé |

Liste complète des codes métier : [§ 15.1](#151-codes-derreur-métier).

### 5.3 Idempotence (`Idempotency-Key`)

```http
Idempotency-Key: 3fa85f64-5717-4562-b3fc-2c963f66afa6
```

| Situation | Résultat |
|---|---|
| Pas de header | Chaque appel = nouvelle opération |
| Même clé + même corps | La réponse du 1er appel est renvoyée à l'identique, rien n'est recréé |
| Même clé + corps différent | `409 Conflict` |
| Même clé, 1er appel encore en cours | `409 Conflict` |

**Supportée et à envoyer SYSTÉMATIQUEMENT** sur les routes qui déplacent de l'argent :
- `POST /payments/softpay/`
- `POST /payments/{payment_id}/retry/`
- `POST /payouts/initialize/`
- `POST /wallet-transfers/`
- (`POST /settlements/` — dashboard)

**Non supportée** : `POST /checkout-sessions/`, `POST /payment-links/` (un doublon est sans conséquence financière).

Règle : **une nouvelle clé par intention** (ex. par commande + tentative), **la même clé pour chaque retry réseau** de cette intention. Un timeout ne prouve pas l'échec : la requête a pu aboutir.

Implémentation conseillée : stocker la clé en base avec la commande avant l'appel (`payment_attempts.idempotency_key`).

### 5.4 Rate limit

- **300 requêtes / minute / compte** par défaut (clé API ou dashboard).
- Dépassement : `429` → backoff exponentiel.
- Mettre en cache ce qui bouge peu : `/countries/`, `/networks/`, `/pricing/my-rates/`, `/exchange-rates/`.

### 5.5 Pagination — deux systèmes différents

**a) Pagination par numéro de page** (`StandardResultsPagination`) — `?page=` & `?page_size=` :

```json
{ "count": 37, "next": "https://...?page=2", "previous": null, "results": [ ... ] }
```

Utilisée par : `/checkout-sessions/`, `/payment-links/`, `/payment-links/{id}/transactions/`, `/networks/` (page_size ≤ 100), `/exchange-rates/`, `/merchant-balances/`, `/merchant-webhooks/`, `/merchant-webhook-subscriptions/`, `/webhook-logs/`, `/wallet-transfers/`.

**b) Pagination par curseur** — `?cursor=` & `?page_size=` (défaut 50, max 200), **pas de `count`** :

```json
{ "next": "https://api.saspay.me/api/v1/transactions/?cursor=cD0yMDI2LTA4LTEy", "previous": null, "results": [ ... ] }
```

Utilisée par : `/transactions/`, `/transaction-attempts/`, `/transaction-status-logs/`. Suivre `next` tel quel jusqu'à `null`.

**c) Non paginé** : `GET /countries/` (tableau brut), `GET /pricing/my-rates/` (tableau).

### 5.6 Montants et devises

- Montants = **chaînes décimales** : `"2500.00"`. Jamais de float JS/JSON.
- Devises : code ISO 4217 3 lettres (`XOF`, `XAF`, `USD`…).
- Pays : code ISO 3166-1 alpha-2 (`BJ`, `CI`…) dans les requêtes de paiement/retrait.
- **Payin** : si `currency` ≠ devise du `country`, **conversion automatique** au taux courant (ou `422 no_exchange_rate`).
- **Payout** : mismatch **rejeté** (`422 currency_country_mismatch`), aucune conversion.

### 5.7 Format du téléphone (`customer.phone`, `recipient.msisdn`)

Trois écritures équivalentes, normalisées côté serveur :

| Forme | Exemple (Bénin) |
|---|---|
| Locale (telle que composée dans le pays) | `0197505050` (10 chiffres, le `0` fait partie du numéro au Bénin depuis 2021) |
| Internationale sans `+` | `2290197505050` |
| Internationale avec `+` | `+2290197505050` |

⚠️ Le serveur **ajoute l'indicatif** s'il manque, mais **ne corrige rien d'autre**. Mauvaise longueur ou mauvais préfixe opérateur = détecté seulement au rejet par le gateway → **validez le format côté application** (ex. `libphonenumber`).

Indicatifs : voir le tableau du § 6.2.

### 5.8 Identifiants

Tous les IDs sont des **UUID v4** (chaînes). Les transactions ont aussi une `reference` lisible (`TXN-20260812-000512`) et une `external_reference` (référence côté gateway).

---

## 6. Pays, devises, réseaux (opérateurs)

### 6.1 Modèle

```
Country (pays)  ── iso_code ("BJ"), default_currency ("XOF")
 └── Network (réseau) ── code ("mtn_bj")  ← valeur à envoyer dans `network` (payin) / `method` (payout)
```

- La valeur à envoyer est **toujours le `code` technique** du réseau (ex. `mtn_bj`), jamais son nom.
- Seuls les pays ayant au moins un réseau actif peuvent recevoir un softpay ou un payout.
- Un réseau *inactif* existe au catalogue mais n'est routé nulle part → `422 invalid_method`.
- L'état réel et à jour est donné par `GET /networks/` (`is_active`) et `GET /pricing/my-rates/` (disponibilité payin/payout **pour votre compte**).

### 6.2 Catalogue des pays opérationnels et de leurs réseaux

| Pays | ISO | Devise | Indicatif | Réseaux (`code` — nom) |
|---|---|---|---|---|
| Burkina Faso | `BF` | XOF | +226 | `moov_bf` — Moov Burkina Faso · `orange_bf` — Orange Burkina Faso |
| Bénin | `BJ` | XOF | +229 | `celtiis_bj` — Celtiis Cash Bénin · `moov_bj` — Moov Money Benin · `mtn_bj` — MTN MoMo Benin |
| RD Congo | `CD` | CDF | +243 | `airtel_cd` — Airtel Congo · `orange_cd` — Orange Congo · `vodacom_cd` — Vodacom Congo |
| Côte d'Ivoire | `CI` | XOF | +225 | `moov_ci` — Moov Money CI · `mtn_ci` — MTN MoMo CI · `orange_ci` — Orange Money CI · `wave_ci` — Wave CI |
| Cameroun | `CM` | XAF | +237 | `eu_mobile_cm` — EU Mobile Money Cameroon *(inactif)* · `mtn_cm` — MTN MoMo Cameroon · `orange_cm` — Orange Money Cameroon |
| Ghana | `GH` | GHS | +233 | `mtn_gh` — MTN MoMo Ghana · `tigo_gh` — Airtel/Tigo Ghana · `vodafone_gh` — Vodafone Ghana |
| Guinée | `GN` | GNF | +224 | `mtn_gn` — MTN MoMo Guinea · `orange_gn` — Orange Money Guinea *(inactif)* |
| Kenya | `KE` | KES | +254 | `mpesa_ke` — M-Pesa Kenya |
| Mali | `ML` | XOF | +223 | `mobi_cash_ml` — Mobi Cash Mali · `moov_ml` — Moov Money Mali · `orange_ml` — Orange Money Mali |
| Malawi | `MW` | MWK | +265 | `airtel_mw` — Airtel Money Malawi · `tnm_mw` — TNM Mpamba Malawi |
| Niger | `NE` | XOF | +227 | `airtel_ne` — Airtel Niger |
| Nigeria | `NG` | NGN | +234 | `airtel_ng` — Airtel Money Nigeria · `mtn_ng` — MTN Nigeria |
| Rwanda | `RW` | RWF | +250 | `airtel_rw` — Airtel Rwanda · `mtn_rw` — MTN MoMo Rwanda |
| Sénégal | `SN` | XOF | +221 | `e_money_sn` — E-Money Senegal *(inactif)* · `freemoney_sn` — Free Money Senegal · `orange_sn` — Orange Money Senegal · `wave_sn` — Wave Senegal · `wizall_sn` — Wizall Senegal |
| Togo | `TG` | XOF | +228 | `moov_tg` — Moov Money Togo · `togocel` — Togocel Money |
| Tanzanie | `TZ` | TZS | +255 | `airtel_tz` — Airtel Tanzania · `halopesa_tz` — Halopesa · `mpesa_tz` — Vodacom Tanzania · `tigo_tz` — Tigo Tanzania |
| Ouganda | `UG` | UGX | +256 | `airtel_ug` — Airtel Uganda · `mtn_ug` — MTN MoMo Uganda |
| Zambie | `ZM` | ZMW | +260 | `airtel_zm` — Airtel Zambia · `mtn_zm` — MTN MoMo Zambia · `zamtel_zm` — Zamtel Kwacha |

**Total : 18 pays, 47 codes réseau (dont 3 inactifs, donc 44 utilisables) + 2 réseaux globaux (`card`, `crypto`).**

Liste brute des codes (pour un enum / une validation) :

```ts
export const SASPAY_NETWORKS = {
  BF: ["moov_bf", "orange_bf"],
  BJ: ["celtiis_bj", "moov_bj", "mtn_bj"],
  CD: ["airtel_cd", "orange_cd", "vodacom_cd"],
  CI: ["moov_ci", "mtn_ci", "orange_ci", "wave_ci"],
  CM: ["mtn_cm", "orange_cm" /* , "eu_mobile_cm" (inactif) */],
  GH: ["mtn_gh", "tigo_gh", "vodafone_gh"],
  GN: ["mtn_gn" /* , "orange_gn" (inactif) */],
  KE: ["mpesa_ke"],
  ML: ["mobi_cash_ml", "moov_ml", "orange_ml"],
  MW: ["airtel_mw", "tnm_mw"],
  NE: ["airtel_ne"],
  NG: ["airtel_ng", "mtn_ng"],
  RW: ["airtel_rw", "mtn_rw"],
  SN: ["freemoney_sn", "orange_sn", "wave_sn", "wizall_sn" /* , "e_money_sn" (inactif) */],
  TG: ["moov_tg", "togocel"],
  TZ: ["airtel_tz", "halopesa_tz", "mpesa_tz", "tigo_tz"],
  UG: ["airtel_ug", "mtn_ug"],
  ZM: ["airtel_zm", "mtn_zm", "zamtel_zm"],
  GLOBAL: ["card", "crypto"],
} as const;

export const SASPAY_COUNTRY_INFO = {
  BF: { currency: "XOF", dial: "226" }, BJ: { currency: "XOF", dial: "229" },
  CD: { currency: "CDF", dial: "243" }, CI: { currency: "XOF", dial: "225" },
  CM: { currency: "XAF", dial: "237" }, GH: { currency: "GHS", dial: "233" },
  GN: { currency: "GNF", dial: "224" }, KE: { currency: "KES", dial: "254" },
  ML: { currency: "XOF", dial: "223" }, MW: { currency: "MWK", dial: "265" },
  NE: { currency: "XOF", dial: "227" }, NG: { currency: "NGN", dial: "234" },
  RW: { currency: "RWF", dial: "250" }, SN: { currency: "XOF", dial: "221" },
  TG: { currency: "XOF", dial: "228" }, TZ: { currency: "TZS", dial: "255" },
  UG: { currency: "UGX", dial: "256" }, ZM: { currency: "ZMW", dial: "260" },
} as const;
```

> Ce catalogue est la photo de la doc au 01/11/2026. **Ne le figez pas en dur** comme source de vérité : rafraîchissez-le via `GET /pricing/my-rates/` (mise en cache quelques heures).

### 6.3 Réseaux globaux : `card` et `crypto`

| `network` | Moyen | Devise | Pays technique |
|---|---|---|---|
| `card` | Carte Visa/Mastercard (via Stripe) | **USD uniquement** | `XX` — International (USD) |
| `crypto` | Stablecoins/crypto (via IziChange), actif choisi sur la page hébergée | **USD uniquement** | `XX` (le référentiel contient aussi `XY` — Crypto (USD)) |

Règles :
- `country` est **ignoré** : la transaction est toujours créée en USD sur le pays technique `XX`. Si `amount`/`currency` ne sont pas en USD → conversion automatique.
- `customer.phone` reste **requis** par la validation (non utilisé) → envoyer une valeur valide quelconque.
- `return_url` est **obligatoire** (sinon `422` immédiat) : ces réseaux fonctionnent uniquement via page hébergée.
- Toujours une `checkout_url` à suivre.

### 6.4 Comportement par opérateur (push vs redirection)

| Mode | Opérateurs concernés (d'après la doc) | Ce que vous devez faire |
|---|---|---|
| **Push USSD / notification** | La plupart (MTN, Moov, Airtel, etc.) | Afficher « validez sur votre téléphone », puis attendre webhook / vérifier |
| **Redirection (`checkout_url` non vide)** | **Wave, Orange Money, Djamo, carte, crypto** | Rediriger le client vers `checkout_url` |
| **OTP pré-paiement** | Orange Money **CI** (`#144*82#`) et **BF** | Collecter `otp` avant l'appel |
| **OTP de confirmation** | Ex. **Wizall SN**, **Coris BJ** (non exhaustif) | Appeler `confirm-otp` après le push |

⚠️ Un même réseau peut **basculer** d'un mode à l'autre sans préavis selon la route choisie. **Testez toujours `checkout_url` dans la réponse**, ne déduisez jamais le mode à partir du nom de l'opérateur.

### 6.5 Référentiel `GET /countries/`

L'endpoint public renvoie **202 pays** (référentiel mondial), dont la plupart sans réseau. Il sert surtout à peupler un formulaire (ex. inscription, `country` en UUID). Le référentiel complet est en [§ 15.2](#152-référentiel-complet-get-countries-202-pays).

> ⚠️ **Congo-Brazzaville (`CG`, XAF)** figure dans le référentiel mais **n'a aucun réseau mobile money** dans le catalogue au 01/11/2026 (ni MTN CG ni Airtel CG). Pour un client au Congo-Brazzaville, seuls `card` et `crypto` (USD) sont utilisables aujourd'hui. À confirmer auprès du support SasPay et à revérifier via `GET /pricing/my-rates/`.
> Autres pays présents dans le référentiel sans réseau (exemples régionaux) : Gabon `GA`, Centrafrique `CF`, Tchad `TD` (inactif), Guinée Équatoriale `GQ` (inactif), Guinée-Bissau `GW` (inactif). `XC` — « RDC (USD) » existe aussi (wallet USD pour la RDC).

---

## 7. OTP : pré-paiement et confirmation

Deux mécanismes **indépendants**, jamais sur le même réseau :

### 7.1 OTP pré-paiement (AVANT l'appel)

- Réseaux : **Orange Money Côte d'Ivoire** (`orange_ci`) et **Orange Money Burkina Faso** (`orange_bf`).
- Le client compose un code USSD sur son téléphone pour obtenir un code de paiement (CI : `#144*82#`, puis option 2 ; BF : code différent, voir `otp_instructions`).
- Vous envoyez ce code dans le champ `otp` de `POST /payments/softpay/`.
- Sans lui : `422 prepayment_otp_missing` (aucun push n'est envoyé).
- Pour savoir **à l'avance** : `GET /pricing/my-rates/` → `payin.otp_required` et `payin.otp_instructions` (texte à afficher tel quel au client).
- `otp_required` suit la route la plus prioritaire : il peut repasser à `false` si un autre fournisseur reprend le réseau → toujours lire la valeur dynamique.
- Sur le **checkout hébergé**, c'est géré automatiquement par la page SasPay.

### 7.2 OTP de confirmation (APRÈS le push)

- Réseaux : par ex. **Wizall Sénégal** (`wizall_sn`), **Coris Bénin** (liste non exhaustive).
- Après `POST /payments/softpay/`, le client reçoit un code (SMS) et vous le communique.
- Vous l'envoyez via `POST /payments/{payment_id}/confirm-otp/` `{ "otp": "123456" }`.
- Réseau non concerné : `400 otp_not_applicable`.

UX recommandée : si `otp_required` → afficher `otp_instructions` + champ de saisie avant paiement ; pour les réseaux à confirmation, afficher un champ « code reçu par SMS » après le push (en cas d'erreur `otp_not_applicable`, simplement masquer le champ).

---

## 8. Frais : `fee_charge_mode` et lecture des montants

| Mode | Le payeur débourse | Vous recevez |
|---|---|---|
| `ADD_ON` | montant + frais | montant demandé |
| `DEDUCTED` | montant demandé | montant − frais |

- Défaut : configuration du compte (Dashboard → Paramètres → Frais).
- Surcharge par requête : champ `fee_charge_mode` sur `/payments/softpay/`, `/checkout-sessions/`, `/payouts/initialize/` — **pris en compte uniquement** si l'option « Autoriser le choix du mode de frais par l'API » (`ALLOW_CLIENT_OVERRIDE`) est activée. Sinon **silencieusement ignoré**.

Champs d'une transaction :

| Champ | Sens |
|---|---|
| `requested_amount` | Montant demandé |
| `client_fee` | Frais facturés |
| `gateway_fee` | Coût du fournisseur |
| `platform_fee` | Frais plateforme |
| `debited_amount` | Ce que le payeur a réellement déboursé |
| `net_amount` | Ce que vous recevez |
| `amounts` | Bloc prêt à afficher : `requested`, `fee`, `charged`, `net`, `currency`, `fee_charge_mode` |

```json
"amounts": { "requested": "25000.00", "fee": "625.00", "charged": "25625.00", "net": "25000.00", "currency": "XOF", "fee_charge_mode": "ADD_ON" }
```

➡️ Pour la comptabilité/rapprochement : utilisez **`charged`** (ou `debited_amount`) et **`net`** (`net_amount`), jamais `requested` seul.

Grille tarifaire : `GET /pricing/my-rates/` → par réseau et par sens, des `tiers` (`min_amount`, `max_amount`, `percent`, `fixed`, `floor_amount`, `cap_amount`, `fee_charge_mode`). Calcul indicatif : `frais = clamp(montant × percent/100 + fixed, floor_amount, cap_amount)` sur le palier correspondant (formule déduite des champs, non documentée explicitement — à valider avec une transaction de test).

---

## 9. Référence des endpoints

Légende : 🔓 public · 🔑 clé API · **Idem.** = `Idempotency-Key` supportée.

### Vue d'ensemble (43 opérations, 37 chemins)

| Groupe | Méthode | Endpoint | Scope | Idem. |
|---|---|---|---|---|
| Paiements | POST | `/payments/softpay/` | PAYIN | ✅ |
| | POST | `/payments/{payment_id}/confirm-otp/` | PAYIN | — |
| | POST | `/payments/{payment_id}/retry/` | PAYIN | ✅ |
| | GET | `/payments/{payment_id}/verify/` | tout | — |
| Checkout | POST | `/checkout-sessions/` | PAYIN | ❌ |
| | GET | `/checkout-sessions/` | tout | — |
| | GET | `/checkout-sessions/{id}/` | tout | — |
| | GET | `/checkout-sessions/{id}/status/` | tout | — |
| | POST | `/checkout-sessions/{id}/cancel/` | PAYIN | — |
| Retraits | POST | `/payouts/initialize/` | PAYOUT + IP whitelistée | ✅ |
| | GET | `/payouts/{payout_id}/verify/` | tout | — |
| Transactions | GET | `/transactions/` | tout | — |
| | GET | `/transactions/{id}/` | tout | — |
| | GET | `/transactions/export/` | tout | — |
| | GET | `/transactions/{id}/invoice/` | tout | — |
| | GET | `/transaction-attempts/` | tout | — |
| | GET | `/transaction-attempts/{id}/` | tout | — |
| | GET | `/transaction-status-logs/` | tout | — |
| | GET | `/transaction-status-logs/{id}/` | tout | — |
| Liens | POST | `/payment-links/` | PAYIN | ❌ |
| | GET | `/payment-links/` | tout | — |
| | GET | `/payment-links/{id}/` | tout | — |
| | PATCH | `/payment-links/{id}/` | PAYIN | — |
| | PUT | `/payment-links/{id}/` | PAYIN | — |
| | DELETE | `/payment-links/{id}/` | PAYIN | — |
| | GET | `/payment-links/{id}/transactions/` | tout | — |
| Wallet | GET | `/merchant-balances/` | tout | — |
| | GET | `/merchant-balances/{id}/` | tout | — |
| | GET | `/exchange-rates/` | tout | — |
| | GET | `/wallet-transfers/` | tout | — |
| | POST | `/wallet-transfers/` | PAYOUT | ✅ |
| | GET | `/wallet-transfers/{id}/` | tout | — |
| Webhooks | GET | `/merchant-webhooks/` | tout | — |
| | GET | `/merchant-webhooks/{id}/` | tout | — |
| | GET | `/merchant-webhook-subscriptions/` | tout | — |
| | GET | `/merchant-webhook-subscriptions/{id}/` | tout | — |
| | GET | `/webhook-logs/` | tout | — |
| | GET | `/webhook-logs/{id}/` | tout | — |
| Référence | GET | `/countries/` | 🔓 public | — |
| | GET | `/countries/{id}/` | 🔑 | — |
| | GET | `/networks/` | 🔑 | — |
| | GET | `/networks/{id}/` | 🔑 | — |
| | GET | `/pricing/my-rates/` | 🔑 | — |

---

### 9.1 Paiements — choisir entre softpay et checkout

```
Vous connaissez déjà le réseau + le numéro du client ?
   ├── OUI → POST /payments/softpay/
   │          ├── checkout_url vide     → push sur le téléphone (USSD/notif)
   │          └── checkout_url non vide → REDIRIGER le client (Wave, Orange, Djamo, carte, crypto…)
   └── NON → POST /checkout-sessions/ → rediriger vers checkout_url (le client choisit réseau + numéro)
                      │
                      ▼
      Transaction (PENDING → SUCCESS / FAILED)
                      │
                      ▼
      Webhook transaction.success / .failed  +  GET /payments/{id}/verify/ avant de livrer
```

| | Softpay | Checkout hébergé |
|---|---|---|
| UI de choix réseau/numéro | La vôtre | Celle de SasPay |
| OTP pré-paiement | À gérer vous-même | Géré par SasPay |
| Idempotence | ✅ | ❌ |
| Cas d'usage | App/site avec son propre tunnel de paiement, app mobile | Lien envoyé par email/SMS, bouton « Payer », intégration rapide, multi-pays sans connaître l'opérateur |

Statuts d'un paiement : `PENDING` (poussé, en attente) → `SUCCESS` (confirmé, crédité) ou `FAILED` (refusé/échoué). `CANCELLED` existe mais n'est atteint par aucun flux actuellement.

---

#### `POST /payments/softpay/` — Initier un paiement softpay

**Description** : pousse une demande de paiement sur le téléphone du client, ou renvoie une `checkout_url` vers laquelle rediriger le client, selon la route choisie.
**Cas d'usage** : votre interface a déjà collecté le pays, l'opérateur et le numéro (ex. écran « Payer avec MTN MoMo »).
**Scope** : `PAYIN` / `BOTH`. **Idempotency-Key** : fortement recommandée.

Headers : `Authorization`, `Content-Type: application/json`, `Idempotency-Key` (recommandé).

| Champ | Type | Requis | Description |
|---|---|---|---|
| `amount` | string (décimal) | ✅ | Ex. `"2500.00"` |
| `currency` | string (3) | ✅ | Ex. `XOF`. Converti automatiquement si ≠ devise du pays |
| `country` | string (2) | ✅ | ISO2 du pays du réseau (ignoré pour `card`/`crypto`) |
| `network` | string | ✅ | Code réseau (`mtn_bj`, `wave_sn`, `card`…) |
| `customer` | object | ✅ | |
| `customer.email` | string (email) | ✅ | |
| `customer.first_name` | string | ✅ | |
| `customer.last_name` | string | ✅ | |
| `customer.phone` | string | ✅ | Numéro à débiter (requis même pour `card`/`crypto`) |
| `description` | string | — | Libellé |
| `metadata` | object | — | Données libres (ex. `{ "order_id": "..." }`) |
| `fee_charge_mode` | `ADD_ON`\|`DEDUCTED`\|null | — | Voir § 8 |
| `preferred_gateway` | string | — | Gateway à privilégier si plusieurs éligibles |
| `otp` | string | — | OTP **pré-paiement** (orange_ci, orange_bf) |
| `return_url` | string (URI) | conditionnel | Retour après page hébergée. **Obligatoire pour `card`/`crypto`** |
| `merchant` | uuid | — | Ignoré avec une clé API |

Exemple :

```bash
curl -X POST https://api.saspay.me/api/v1/payments/softpay/ \
  -H "Authorization: Bearer sk_test_xxx" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 3fa85f64-5717-4562-b3fc-2c963f66afa6" \
  -d '{
    "amount": "2500.00",
    "currency": "XOF",
    "country": "BJ",
    "network": "mtn_bj",
    "description": "Abonnement mensuel",
    "customer": { "email": "client@example.com", "first_name": "Awa", "last_name": "Sossou", "phone": "+2290197505050" },
    "metadata": { "order_id": "ORD-1042" },
    "return_url": "https://votre-site.com/paiement/retour"
  }'
```

Réponse `201` (`data`) :

```json
{ "message": "Payment pushed successfully", "id": "9c3f2a10-...", "status": "PENDING", "checkout_url": "", "instructions": "" }
```

- `id` = **ID de transaction** → à stocker, sert pour `verify`, `retry`, `confirm-otp`.
- `checkout_url` non vide → **rediriger le client**, sinon le paiement n'aura jamais lieu.
- `instructions` (vu dans le quickstart, absent de l'exemple OpenAPI) : texte à afficher au client en mode push s'il est présent.

Erreurs :

| Code | Cas |
|---|---|
| `400` | Validation (champ manquant/format) |
| `403` | Scope insuffisant (PAYIN requis) |
| `409` | Idempotency-Key réutilisée avec un corps différent / en cours |
| `422` | `missing_method`, `invalid_country`, `no_exchange_rate`, `invalid_customer`, `invalid_method`, `prepayment_otp_missing`, `no_route_available` ; `return_url` manquant pour card/crypto |

---

#### `POST /payments/{payment_id}/confirm-otp/` — Confirmer un paiement par OTP

**Description** : 2ᵉ étape pour les réseaux qui envoient un code au client **après** le push.
**Cas d'usage** : Wizall SN, Coris BJ…

Body : `{ "otp": "123456" }` (requis).

Réponse `200` : `{ "message": "OTP confirmé", "id": "9c3f...", "status": "SUCCESS" }`

| Code | Cas |
|---|---|
| `400 otp_not_applicable` | Le réseau n'utilise pas ce mécanisme |
| `404` | Paiement introuvable |
| `409` | `not_pending`, `no_gateway`, `no_attempt` |
| `422 otp_confirmation_failed` | Échec (message volontairement générique) |

---

#### `POST /payments/{payment_id}/retry/` — Relancer un paiement échoué

**Description** : rejoue le routage **sur la même transaction** (même `id`), sans en créer une nouvelle. Uniquement pour les paiements entrants (`INBOUND`).
**Cas d'usage** : le client a laissé expirer le push, a changé d'opérateur, ou veut réessayer avec un autre numéro. **Idempotency-Key** recommandée (nouvelle clé par nouvelle tentative de relance).

| Champ | Type | Description |
|---|---|---|
| `methods` | string[] | Codes réseau à essayer dans l'ordre. Défaut : réseau d'origine |
| `customer` | object | Nouvelles infos client (optionnel) : `email`, `first_name`, `last_name`, `phone` |
| `preferred_gateway` | string | Optionnel |

```json
{ "methods": ["moov_bj"], "customer": { "phone": "+2290196000000" } }
```

Réponse `200` : `{ "message": "Payment retried successfully", "id": "9c3f...", "checkout_url": "" }` → même règle : tester `checkout_url`.

| Code | Cas |
|---|---|
| `400 invalid_flow` | Transaction sortante (payout) |
| `404` | Introuvable |
| `409` | Transaction déjà terminale (ex. déjà `SUCCESS`) |
| `422` | Mêmes codes que l'initialisation |

---

#### `GET /payments/{payment_id}/verify/` — Vérifier le statut d'un paiement

**Description** : si le statut connu est `PENDING`, SasPay **revérifie en direct auprès du gateway** avant de répondre.
**Cas d'usage** : **obligatoire avant de livrer** un produit/activer un accès ; polling de secours si le webhook n'arrive pas ; réconciliation.

Réponse `200` : objet Transaction complet + `message` :

```json
{
  "message": "Payment transaction fetched successfully",
  "id": "9c3f2a10-...", "reference": "TXN-20260812-000512",
  "transaction_type": "PAIEMENT", "flow_direction": "INBOUND",
  "requested_amount": "2500.00", "fee_charge_mode": "ADD_ON", "client_fee": "37.50",
  "debited_amount": "2537.50", "net_amount": "2500.00", "currency": "XOF",
  "status": "SUCCESS", "external_reference": "PWP-8827311", "...": "..."
}
```

➡️ Livrer **uniquement** si `status === "SUCCESS"` **et** montant/devise conformes à la commande.

---

### 9.2 Checkout hébergé

#### `POST /checkout-sessions/` — Créer une session de checkout

**Description** : génère une page de paiement SasPay (`checkout_url`) où le client choisit son réseau et saisit son numéro. Session **à usage unique**.
**Cas d'usage** : bouton « Payer » qui redirige, lien envoyé par SMS/WhatsApp/email, intégration rapide sans UI de paiement. **Pas d'idempotence** (doublon sans impact financier).

| Champ | Type | Requis | Description |
|---|---|---|---|
| `amount` | string (décimal) | ✅ | |
| `currency` | string (3) | ✅ | |
| `customer_email` | string (email) | ✅ | |
| `customer_name` | string | ✅ | |
| `customer_phone` | string | — | |
| `description` | string | — | |
| `country` | string (2) | — | Présélectionne le pays sur la page |
| `return_url` | string (URI) | — (fortement recommandé) | Redirection 3 s après un paiement **réussi** |
| `metadata` | object | — | |
| `fee_charge_mode` | `ADD_ON`\|`DEDUCTED`\|null | — | Voir § 8 |
| `expires_at` | datetime ISO 8601 | — | Expiration de la session |

```bash
curl -X POST https://api.saspay.me/api/v1/checkout-sessions/ \
  -H "Authorization: Bearer sk_test_xxx" -H "Content-Type: application/json" \
  -d '{ "amount": "5000.00", "currency": "XOF", "description": "Facture #1042",
        "customer_email": "client@example.com", "customer_name": "Awa Sossou",
        "country": "BJ", "return_url": "https://votre-site.com/merci",
        "metadata": { "order_id": "1042" } }'
```

Réponse `201` (objet CheckoutSession, cf. § 11.2) :

```json
{ "id": "c9a17e2c-...", "slug": "kZ2v9rT4bQxL8mNpYw==", "checkout_url": "https://pay.saspay.me/checkout/kZ2v9rT4bQxL8mNpYw==",
  "amount": "5000.00", "currency": "XOF", "status": "PENDING", "transaction": null, "paid_at": null, "...": "..." }
```

Comportement de `return_url` :
- Succès → redirection automatique 3 s après la confirmation.
- Échec/annulation → **pas de redirection** : le client voit « Réessayer » et doit fermer l'onglet → prévoir côté app un statut « en attente » et un bouton de reprise.
- Sans `return_url` → le client reste sur la page de succès SasPay.
- ⚠️ Le retour sur `return_url` **ne prouve pas** le paiement : vérifier via webhook / `status` / `verify`.

Erreurs : `400` validation, `403` scope.

#### `GET /checkout-sessions/` — Lister ses sessions

Query : `status` (`PENDING`|`PAID`|`EXPIRED`|`CANCELLED`), `currency`, `page`, `page_size`. Pagination par page.
**Cas d'usage** : back-office, relance des sessions non payées.

#### `GET /checkout-sessions/{id}/` — Détail d'une session

Lecture seule (pas de PATCH/DELETE). `404` si introuvable.

#### `GET /checkout-sessions/{id}/status/` — Statut d'une session

**Description** : raccourci léger qui **revérifie l'état réel côté gateway**.
**Cas d'usage** : page « paiement en cours » qui poll côté backend, filet de sécurité si le webhook n'arrive pas.

```json
{ "id": "c9a17e2c-...", "slug": "kZ2v9rT4bQxL8mNpYw==", "status": "PAID",
  "transaction_id": "9c3f2a10-...", "transaction_status": "SUCCESS", "transaction_reference": "b1f2c3d4-..." }
```

Statuts de session : `PENDING`, `PAID`, `EXPIRED`, `CANCELLED`.

#### `POST /checkout-sessions/{id}/cancel/` — Annuler une session

Corps vide. Seulement si `PENDING` → `200` (session avec `status: "CANCELLED"`). Sinon `409 not_pending`. `404` si introuvable.
**Cas d'usage** : commande annulée/modifiée côté marchand, panier changé (créer une nouvelle session ensuite).

---

### 9.3 Retraits (payouts)

Un payout envoie des fonds **depuis votre wallet du pays** vers un numéro mobile money. Produit une Transaction `transaction_type: "RETRAIT"`, `flow_direction: "OUTBOUND"`.

Prérequis :
1. Clé avec scope `PAYOUT` ou `BOTH`.
2. **IP du serveur whitelistée** pour le marchand (dashboard, ou `POST /merchant-ip-whitelist-entries/`), sinon `403 ip_not_whitelisted`. → Prévoir une **IP sortante fixe** (VPS, NAT gateway…). Pas de serverless à IP variable.
3. Fonctionnalité payout activée (`403 payout_not_enabled` sinon).
4. Solde suffisant sur le wallet du pays, wallet non gelé.

#### `POST /payouts/initialize/` — Initier un payout

**Cas d'usage** : remboursement client, paiement de vendeurs/créateurs/livreurs, cashback, gains. **Idempotency-Key** : indispensable.

| Champ | Type | Requis | Description |
|---|---|---|---|
| `amount` | string (décimal) | ✅ | |
| `currency` | string (3) | ✅ | **Doit correspondre** au pays (pas de conversion) |
| `country` | string (2) | ✅ | |
| `method` | string | ✅ | Code réseau du bénéficiaire (`mtn_cm`…) |
| `recipient` | object | ✅ | |
| `recipient.msisdn` | string | ✅ | Numéro à créditer |
| `customer` | object | ✅ | Objet requis ; sous-champs optionnels : `email`, `first_name`, `last_name`, `phone` |
| `description` | string | — | |
| `metadata` | object | — | |
| `fee_charge_mode` | `ADD_ON`\|`DEDUCTED`\|null | — | |
| `preferred_gateway` | string | — | |
| `merchant` | uuid | — | Ignoré avec clé API |

```bash
curl -X POST https://api.saspay.me/api/v1/payouts/initialize/ \
  -H "Authorization: Bearer sk_live_xxx" -H "Content-Type: application/json" \
  -H "Idempotency-Key: 7d3b1c2e-...-refund-778" \
  -d '{ "amount": "10000.00", "currency": "XAF", "country": "CM", "method": "mtn_cm",
        "recipient": { "msisdn": "+237670000000" },
        "customer": { "first_name": "Jean", "last_name": "Mbarga", "email": "jean@example.com" },
        "description": "Remboursement commande #778" }'
```

Réponse `201` : `{ "message": "Payout transaction initialized successfully", "id": "a4b5c6d7-..." }`

| Code | Cas |
|---|---|
| `403` | `payout_not_enabled`, `ip_not_whitelisted`, scope insuffisant |
| `409` | Idempotence |
| `422` | `currency_country_mismatch`, `invalid_country`, `invalid_customer`, `invalid_method`, `no_route_available`, `wallet_frozen` (et a priori `insufficient_balance`) |

Statuts : `PENDING` → `SUCCESS` | `FAILED`. **Un payout échoué ne se relance pas via `/retry/`** : refaire `POST /payouts/initialize/` avec une **nouvelle** Idempotency-Key.

#### `GET /payouts/{payout_id}/verify/` — Vérifier un payout

Même mécanique que `verify` paiement (revérification gateway si `PENDING`). Renvoie la Transaction complète + `message`.

---

### 9.4 Transactions (lecture seule)

Une Transaction est créée par softpay, checkout ou payout. Pas de création directe.

| `transaction_type` | `flow_direction` | Origine |
|---|---|---|
| `PAIEMENT` | `INBOUND` | softpay / checkout |
| `RECHARGE` | `INBOUND` | Recharge de solde |
| `RETRAIT` | `OUTBOUND` | Payout |
| `TRANSFERT` | `OUTBOUND` | Transfert interwallet |

`flow_direction` est dérivé de `transaction_type` (lecture seule). Statuts : `PENDING`, `SUCCESS`, `FAILED` (`CANCELLED` jamais atteint en pratique).

#### `GET /transactions/` — Lister

Pagination **curseur** (`page_size` défaut 50, max 200 ; pas de `count`).

| Query | Valeurs |
|---|---|
| `status` | `PENDING`\|`SUCCESS`\|`FAILED`\|`CANCELLED` |
| `transaction_type` | `RECHARGE`\|`PAIEMENT`\|`RETRAIT`\|`TRANSFERT` |
| `flow_direction` | `INBOUND`\|`OUTBOUND` |
| `currency`, `country`, `network`, `merchant` | filtres exacts |
| `created_at__gte`, `created_at__lte` | plage de dates (ISO 8601) |
| `search` | référence, référence gateway, nom/email/téléphone client, slug de lien, slug de session |
| `page_size`, `cursor` | pagination |

**Cas d'usage** : back-office, réconciliation quotidienne (ex. toutes les `PENDING` de plus de 30 min → `verify`).

#### `GET /transactions/{id}/` — Détail

Champs de base + `attempts[]` + `status_logs[]` + raccourcis `country_code`, `network_code`, `operation_msisdn`, `amounts` (cf. § 11.1).

#### `GET /transactions/export/` — Export CSV

Mêmes filtres que la liste, **sans pagination** (tout le résultat, en streaming). Réponse `text/csv`, `Content-Disposition: attachment; filename="transactions.csv"`.
Colonnes (doc) : `reference, external_reference, merchant, customer_name, customer_email, customer_phone, country, network, transaction_type, flow_direction, requested_amount, client_fee, gateway_fee, platform_fee, debited_amount, net_amount, currency, status, operation_msisdn, ip_address, created_at`.
**Cas d'usage** : export comptable mensuel.

#### `GET /transactions/{id}/invoice/` — Facture PDF

Uniquement pour un paiement **`INBOUND` + `SUCCESS`**. PDF (`facture-<reference>.pdf`) contenant `requested_amount`, `client_fee`, `debited_amount` (jamais `gateway_fee`/`platform_fee`).
Erreurs : `404`, `409 invalid_flow` (payout), `409 not_success`.
**Cas d'usage** : reçu à envoyer au client final.

#### `GET /transaction-attempts/` et `/{id}/` — Tentatives de routage

Lecture seule (créées par le moteur de routage). Pagination curseur. Filtres : `status` (`SUCCESS`|`FAILED`|`TIMEOUT`), `gateway`, `transaction`.
**Cas d'usage** : diagnostiquer pourquoi un paiement a échoué (`error_message` générique).

#### `GET /transaction-status-logs/` et `/{id}/` — Journal des statuts

Append-only. Pagination curseur. Filtres : `to_status` (`PENDING`|`SUCCESS`|`FAILED`|`CANCELLED`), `triggered_by` (`SYSTEM`|`ADMIN`|`CLIENT`|`WEBHOOK_CALLBACK`), `transaction`.
**Cas d'usage** : audit, litiges (« qui a changé le statut et quand »).

---

### 9.5 Liens de paiement

Un lien est **réutilisable** (contrairement à une session de checkout) : il génère autant de Transactions que de paiements, illimité ou plafonné par `usage_limit`.

#### `POST /payment-links/` — Créer

**Cas d'usage** : lien en bio Instagram/TikTok, paiement de cotisations, dons, facture récurrente, produit unique vendu sur WhatsApp. Pas d'idempotence.

| Champ | Type | Requis | Défaut | Description |
|---|---|---|---|---|
| `name` | string (≤150) | ✅ | | Nom du lien |
| `currency` | string (3) | ✅ | | |
| `description` | string (≤255) | — | | |
| `amount_type` | `FIXED`\|`FREE` | — | `FIXED` | Montant imposé ou libre |
| `amount` | décimal | — (logiquement requis si FIXED) | | ⚠️ aucune validation croisée serveur |
| `min_amount` | décimal | — | | Plancher si `FREE` |
| `is_active` | bool | — | `true` | |
| `expires_at` | datetime | — | | Après expiration : `410` |
| `usage_limit` | int ≥ 1 | — | illimité | Nombre max de paiements |
| `require_phone` | bool | — | `false` | Rend le téléphone obligatoire au checkout (même card/crypto) |
| `facebook_pixel_id` | string (≤32) | — | | Tracking |
| `google_ads_id` | string (≤32) | — | | Tracking |
| `custom_fields` | array | — | `[]` | Champs demandés au client : `{key, label, required}` — `key` et `label` obligatoires, `key` unique ; les valeurs saisies vont dans `Transaction.metadata` |
| `show_confirmation_page` | bool | — | `true` | Page de confirmation SasPay après paiement |
| `redirect_url` | URI | si `show_confirmation_page=false` | | Sinon `400` |

```json
{
  "name": "Pack 50 crédits", "description": "Crédits de génération", "amount_type": "FIXED",
  "amount": "5000.00", "currency": "XOF", "usage_limit": 100,
  "custom_fields": [ { "key": "pseudo", "label": "Pseudo", "required": true } ],
  "show_confirmation_page": false, "redirect_url": "https://votre-site.com/merci"
}
```

Réponse `201` : objet PaymentLink (cf. § 11.3) avec `slug` (ex. `kx7f2q1a`), `usage_count`.
⚠️ L'URL publique du lien n'est pas renvoyée dans l'exemple : elle se construit à partir du `slug` (format à confirmer dans le dashboard).

#### `GET /payment-links/` — Lister
Query : `merchant`, `is_active`, `page`, `page_size`.

#### `GET /payment-links/{id}/` — Détail · `404` si introuvable.

#### `PATCH /payment-links/{id}/` — Mise à jour partielle
Mêmes champs, tous optionnels. `merchant` non réassignable. **Cas d'usage** : désactiver (`{"is_active": false}`), changer le prix, prolonger.

#### `PUT /payment-links/{id}/` — Remplacement complet
Requis : `name`, `amount_type`, `currency` (+ autres champs à renvoyer intégralement).

#### `DELETE /payment-links/{id}/` — Supprimer
`204`. Les transactions existantes restent. Préférez `is_active: false` si vous voulez garder l'historique lisible.

#### `GET /payment-links/{id}/transactions/` — Transactions d'un lien
Pagination **par page** (≠ `/transactions/`), **aucun filtre ni recherche**. Pour filtrer : `GET /transactions/?search=<slug>`.

---

### 9.6 Wallet

Un wallet par **(marchand, pays)** — pas par devise (Bénin XOF ≠ Sénégal XOF). Créé automatiquement au premier mouvement.

#### `GET /merchant-balances/` et `/{id}/` — Soldes

```json
{ "id": "d3a2...", "merchant": "8a1f...", "country": "BJ", "currency": "XOF",
  "available_amount": "1450300.00", "pending_amount": "150000.00", "is_frozen": false,
  "created_at": "...", "updated_at": "..." }
```

- `available_amount` : utilisable (payout, transfert).
- `pending_amount` : en attente.
- `is_frozen: true` : **entrées acceptées, sorties bloquées** (payout/transfert → `422 wallet_frozen`). Décidé par la plateforme.
- Pas de filtre `?country=` → lister et filtrer côté client.
**Cas d'usage** : afficher le solde dans votre back-office, vérifier avant un payout.

#### `GET /exchange-rates/` — Taux de change

```json
{ "id": "aa11...", "from_currency": "XOF", "to_currency": "XAF", "rate": "0.00984000", "auto_update": true, "created_at": "...", "updated_at": "..." }
```

Pas de filtre par paire. Utilisés pour les transferts interwallet (et conversions payin).

#### `GET /wallet-transfers/` — Lister les transferts
Query : `status` (`PENDING`|`COMPLETED`|`REJECTED`), `from_country`, `to_country`, `page`, `page_size`. Lecture : tout scope.

#### `POST /wallet-transfers/` — Transfert interwallet

**Description** : déplace des fonds entre deux wallets pays **du même marchand**, avec conversion si besoin. L'argent ne quitte jamais la plateforme.
**Cas d'usage** : regrouper des encaissements XOF pour payer des bénéficiaires au Cameroun en XAF. Scope `PAYOUT`/`BOTH`, **Idempotency-Key** recommandée.

| Champ | Type | Requis | Description |
|---|---|---|---|
| `from_country` | ISO2 | ✅ | Wallet débité |
| `to_country` | ISO2 | ✅ | Wallet crédité |
| `from_amount` | décimal | ✅ | Montant réservé, en devise source |
| `merchant` | uuid | — | Ignoré avec clé API |

Réponse `201` : objet WalletTransfer (§ 11.6). `status` = `COMPLETED` si auto-approbation (`WALLET_TRANSFER_AUTO_APPROVE`), sinon `PENDING` (validation admin).
Erreurs `422` : `same_country`, `transfer_already_pending` (un seul PENDING à la fois), `wallet_frozen`, `insufficient_balance`. `403` si scope `PAYIN` seul.

#### `GET /wallet-transfers/{id}/` — Détail · `404` si introuvable ou pas à vous.

---

### 9.7 Webhooks (lecture via API)

Création/modification/suppression/renvoi/rotation du secret = **dashboard uniquement** (Développeur → Webhooks).

| Endpoint | Contenu |
|---|---|
| `GET /merchant-webhooks/` · `/{id}/` | Points de réception : `id, merchant, payment_link, url, description, environment, is_active, created_by_member, created_at, updated_at` (jamais `signing_secret`) |
| `GET /merchant-webhook-subscriptions/` · `/{id}/` | Abonnements : `id, webhook, event_type, created_at, updated_at` |
| `GET /webhook-logs/` · `/{id}/` | Historique de livraison : `id, webhook, transaction, settlement, wallet_transfer, event_type, url, payload, http_status, attempt, status, sent_at, response_body, next_retry_at, exhausted_at, created_at` |

Pagination par page, aucun filtre. `payment_link` renseigné = webhook scopé à un lien (reçoit en plus des webhooks globaux, jamais à leur place).
**Cas d'usage** : outil de diagnostic interne (« pourquoi mon endpoint n'a pas reçu l'event ? »).

---

### 9.8 Référence

#### `GET /countries/` 🔓
Public, non paginé, tableau brut. Champs : `id` (uuid), `iso_code`, `name`, `default_currency`, `is_active`, `created_at`, `updated_at`.
**Cas d'usage** : formulaire d'inscription (UUID requis par `POST /users/`), sélecteur de pays.

#### `GET /countries/{id}/` 🔑 — Détail (authentifié contrairement à la liste).

#### `GET /networks/` 🔑
Paginé (`page_size` ≤ 100), **pas de filtre `?country=`** → filtrer côté client sur `country` (UUID du pays). Champs : `id, country, code, name, is_active, created_at, updated_at`.

#### `GET /networks/{id}/` 🔑 — Détail.

#### `GET /pricing/my-rates/` 🔑 — Mes tarifs et disponibilités

**Description** : pour chaque (pays, réseau) actif, le tarif payin/payout **réellement applicable à votre compte**, la disponibilité, et l'exigence d'OTP pré-paiement.
**Cas d'usage** : **source de vérité pour construire le sélecteur d'opérateurs** de votre UI, afficher les frais au client, savoir s'il faut demander l'OTP.
Query : `merchant` (ignoré avec clé API).

```json
[
  {
    "country_code": "CI", "country_name": "Côte d'Ivoire", "currency": "XOF",
    "network_code": "orange_ci", "network_name": "Orange Money",
    "payin": {
      "available": true, "is_custom": false, "otp_required": true,
      "otp_instructions": "Sur votre téléphone, composez #144*82# puis choisissez l'option 2 pour obtenir votre code de paiement.",
      "tiers": [ { "min_amount": "0.00", "max_amount": "500000.00", "currency": "XOF", "percent": "2.500", "fixed": "0.00",
                   "floor_amount": "50.00", "cap_amount": null, "fee_charge_mode": "ADD_ON" } ]
    },
    "payout": {
      "available": true, "is_custom": false, "otp_required": false, "otp_instructions": "",
      "tiers": [ { "min_amount": "0.00", "max_amount": "500000.00", "currency": "XOF", "percent": "1.800", "fixed": "0.00",
                   "floor_amount": null, "cap_amount": "5000.00", "fee_charge_mode": "DEDUCTED" } ]
    }
  }
]
```

- `is_custom: true` = tarif négocié propre à vous.
- Seuls les (pays, réseau) avec au moins un sens disponible apparaissent.

---

## 10. Webhooks

### 10.1 Mise en place

1. Dashboard → Développeur → Webhooks → créer un point de réception (URL HTTPS publique, environnement `LIVE` ou `SANDBOX`).
2. **Copier le `signing_secret` immédiatement** (affiché une seule fois — sinon « Changer le secret »).
3. Abonner le webhook aux events (un abonnement par couple webhook/event ; un doublon renvoie une erreur serveur générique).
4. Déclencher `webhook.test` depuis le dashboard pour valider.

### 10.2 Catalogue d'events

| Event | Déclenchement |
|---|---|
| `transaction.created` | Transaction (payin ou payout) initiée |
| `transaction.success` | Transaction confirmée |
| `transaction.failed` | Transaction échouée |
| `transaction.cancelled` | Transaction annulée |
| `settlement.requested` | Retrait (settlement dashboard) demandé |
| `settlement.approved` | Retrait approuvé par un admin |
| `settlement.success` | Retrait exécuté |
| `settlement.failed` | Retrait échoué |
| `settlement.cancelled` | Retrait annulé / refusé |
| `wallet_transfer.requested` | Transfert interwallet demandé |
| `wallet_transfer.completed` | Transfert complété |
| `wallet_transfer.rejected` | Transfert rejeté |
| `webhook.test` | Test manuel |

⚠️ `settlement.*` : payload `data` pas encore stabilisé — ne pas en dépendre.

Minimum recommandé : `transaction.success`, `transaction.failed` (+ `transaction.created` si utile, `wallet_transfer.*` si vous faites des transferts).

### 10.3 Requête reçue

```http
POST https://votre-api.com/webhooks/saspay
Content-Type: application/json
X-Webhook-Signature: <hex sha256 HMAC, minuscules>
X-Webhook-Timestamp: <timestamp Unix en secondes>
X-Webhook-Event: transaction.success

{ "event": "transaction.success", "data": { ... } }
```

Payload `transaction.*` :

```json
{
  "event": "transaction.success",
  "data": {
    "id": "7c1a...", "reference": "TXN-2026-000456", "type": "PAIEMENT", "status": "SUCCESS",
    "amount": "25000.00", "fee": "625.00", "charged": "25625.00", "net_amount": "25000.00",
    "fee_charge_mode": "ADD_ON", "currency": "XOF",
    "country": "BJ", "network": "mtn_bj", "msisdn": "22990000000"
  }
}
```

- `data.id` = ID de la transaction (= `id` renvoyé par softpay / `transaction_id` d'une session).
- `type` : `PAIEMENT` dans la doc ; l'exemple de log montre `PAYIN` → traiter les deux (cf. § 14).
- `msisdn` vide pour les transactions antérieures au 17/08/2026.
- Le payload webhook ne contient **pas** `metadata` → retrouver la commande via `data.id` (stocké en base à l'initiation).

Payload `wallet_transfer.completed` :

```json
{ "event": "wallet_transfer.completed",
  "data": { "id": "1a2b...", "reference": "f4e5d6c7...", "status": "COMPLETED",
            "from_country": "BJ", "from_amount": "100000.00", "from_currency": "XOF",
            "to_country": "CM", "to_amount": "984.00", "to_currency": "XAF" } }
```

### 10.4 Vérification de la signature (obligatoire)

```
signed   = `${X-Webhook-Timestamp}.${corps_brut}`
expected = hex( HMAC_SHA256(signing_secret, signed) )
```

Deux contrôles :
1. **Âge** : rejeter si `|now − timestamp| > 300 s` (anti-rejeu). Serveur synchronisé NTP.
2. **Signature** : calculée sur le **corps brut** (jamais re-sérialisé), comparaison **en temps constant**.

**Node.js / NestJS** (nécessite le raw body : `NestFactory.create(AppModule, { rawBody: true })` puis `req.rawBody`) :

```ts
import * as crypto from "crypto";
const TOLERANCE_SECONDS = 300;

export function isValidSaspayWebhook(rawBody: Buffer | string, signature: string, timestamp: string, secret: string): boolean {
  const now = Math.floor(Date.now() / 1000);
  if (!timestamp || Math.abs(now - Number(timestamp)) > TOLERANCE_SECONDS) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const a = Buffer.from(signature ?? "");
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

**Next.js Route Handler** :

```ts
export async function POST(req: Request) {
  const raw = await req.text(); // corps BRUT
  const ok = isValidSaspayWebhook(raw, req.headers.get("x-webhook-signature") ?? "",
    req.headers.get("x-webhook-timestamp") ?? "", process.env.SASPAY_WEBHOOK_SECRET!);
  if (!ok) return new Response("invalid signature", { status: 403 });
  const evt = JSON.parse(raw);
  // enqueue / traitement idempotent…
  return new Response("OK", { status: 200 });
}
```

**PHP** :

```php
$body = file_get_contents('php://input');
$sig  = $_SERVER['HTTP_X_WEBHOOK_SIGNATURE'] ?? '';
$ts   = $_SERVER['HTTP_X_WEBHOOK_TIMESTAMP'] ?? '0';
if (abs(time() - (int)$ts) > 300) { http_response_code(403); exit; }
$expected = hash_hmac('sha256', $ts . '.' . $body, $secret);
if (!hash_equals($expected, $sig)) { http_response_code(403); exit; }
$payload = json_decode($body, true);
http_response_code(200);
```

**Python** :

```python
import hashlib, hmac, time
def is_valid(raw_body: bytes, signature: str, timestamp: str, secret: str) -> bool:
    if abs(int(time.time()) - int(timestamp)) > 300:
        return False
    expected = hmac.new(secret.encode(), f"{timestamp}.".encode() + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)
```

### 10.5 Fiabilité et bonnes pratiques de traitement

- **5 tentatives** : immédiat, +30 s, +5 min, +30 min, +2 h. **Timeout 15 s** par tentative. Après 5 échecs → `FAILED` définitif (renvoi manuel uniquement depuis le dashboard).
- L'horodatage est régénéré à chaque tentative.
- Répondre **2xx rapidement** (< 15 s) : valider la signature, enregistrer l'event, mettre en file, répondre 200 ; traiter en asynchrone.
- **Traitement idempotent** : un même event peut arriver plusieurs fois → dédupliquer (ex. table `webhook_events` avec contrainte unique sur `(data.id, event)`), et ne jamais créditer deux fois.
- **Ne pas faire confiance aveuglément au payload** : avant de livrer, appeler `GET /payments/{id}/verify/` et comparer montant/devise avec la commande.
- **Filet de sécurité** : un job (cron) qui `verify` les transactions restées `PENDING` au-delà de X minutes.

---

## 11. Modèles de données (objets)

### 11.1 Transaction

| Champ | Type | Description |
|---|---|---|
| `id` | uuid | ID de transaction (= `payment_id` / `payout_id`) |
| `reference` | string | Référence lisible SasPay (`TXN-20260812-000512`) |
| `external_reference` | string | Référence côté gateway |
| `merchant` | uuid | |
| `customer` | uuid | Client SasPay |
| `country` / `country_code` | uuid / ISO2 | |
| `network` / `network_code` | uuid / code | |
| `transaction_type` | enum | `PAIEMENT`, `RECHARGE`, `RETRAIT`, `TRANSFERT` |
| `flow_direction` | enum | `INBOUND`, `OUTBOUND` (lecture seule) |
| `description` | string | |
| `requested_amount` | décimal | Montant demandé |
| `fee_charge_mode` | enum | `ADD_ON`, `DEDUCTED` |
| `client_fee`, `gateway_fee`, `platform_fee` | décimal | Frais |
| `debited_amount` | décimal | Débité au payeur |
| `net_amount` | décimal | Reçu par vous |
| `amounts` | object | `requested`, `fee`, `charged`, `net`, `currency`, `fee_charge_mode` |
| `currency` | string | |
| `status` | enum | `PENDING`, `SUCCESS`, `FAILED`, (`CANCELLED`) |
| `operation_msisdn` | string | Numéro débité/crédité (vide avant le 17/08/2026) |
| `pricing_rule`, `merchant_pricing_rule` | uuid\|null | Règles tarifaires |
| `current_gateway` | uuid | Gateway (cf. § 14) |
| `ip_address` | string | |
| `metadata` | object | Vos métadonnées + valeurs `custom_fields` d'un lien |
| `created_at`, `updated_at` | datetime | |
| `attempts[]` | array | (détail uniquement) cf. 11.4 |
| `status_logs[]` | array | (détail uniquement) cf. 11.5 |

### 11.2 CheckoutSession

`id, merchant, created_by_member, slug, checkout_url, amount, currency, description, country, customer_email, customer_name, customer_phone, return_url, metadata, fee_charge_mode, status (PENDING|PAID|EXPIRED|CANCELLED), expires_at, transaction (uuid|null), payment_link (uuid|null), paid_at, created_at, updated_at`

### 11.3 PaymentLink

`id, merchant, created_by_member, name, description, amount_type (FIXED|FREE), amount, min_amount, currency, slug, is_active, expires_at, usage_limit, usage_count, require_phone, facebook_pixel_id, google_ads_id, custom_fields[{key,label,required}], show_confirmation_page, redirect_url, created_at, updated_at`

### 11.4 TransactionAttempt

`id, transaction, gateway, priority, status (SUCCESS|FAILED|TIMEOUT), error_code, error_message, started_at, ended_at, created_at, updated_at` (la doc mentionne aussi `msisdn`)

### 11.5 TransactionStatusLog

`id, transaction, from_status, to_status, reason, triggered_by (SYSTEM|ADMIN|CLIENT|WEBHOOK_CALLBACK), created_at`

### 11.6 WalletTransfer

`id, reference, merchant, requested_by_member, from_country, to_country, from_amount, from_currency, to_amount, to_currency, exchange_rate, fee_amount, fee_percent_applied, status (PENDING|COMPLETED|REJECTED), approved_by_admin, approved_at, completed_at, rejection_reason, created_at, updated_at`

### 11.7 MerchantBalance

`id, merchant, country, currency, available_amount, pending_amount, is_frozen, created_at, updated_at`

### 11.8 ExchangeRate

`id, from_currency, to_currency, rate, auto_update, created_at, updated_at`

### 11.9 Country / Network

- Country : `id, iso_code, name, default_currency, is_active, created_at, updated_at`
- Network : `id, country (uuid), code, name, is_active, created_at, updated_at`

### 11.10 MerchantWebhook / Subscription / WebhookLog

- Webhook : `id, merchant, payment_link, url, description, environment (LIVE|SANDBOX), is_active, created_by_member, created_at, updated_at`
- Subscription : `id, webhook, event_type, created_at, updated_at`
- WebhookLog : `id, webhook, transaction, settlement, wallet_transfer, event_type, url, payload, http_status, attempt, status (ex. DELIVERED, FAILED), sent_at, response_body, next_retry_at, exhausted_at, created_at`

### 11.11 MyRate (`/pricing/my-rates/`)

`country_code, country_name, currency, network_code, network_name, payin{available, is_custom, otp_required, otp_instructions, tiers[]}, payout{…}` ; tier : `min_amount, max_amount, currency, percent, fixed, floor_amount, cap_amount, fee_charge_mode`.

---

## 12. Flux d'intégration recommandés

### 12.1 Modèle de données côté application (suggestion)

```sql
CREATE TABLE payments (
  id                 uuid PRIMARY KEY,
  order_id           uuid NOT NULL,
  provider           text NOT NULL DEFAULT 'saspay',
  idempotency_key    uuid NOT NULL UNIQUE,
  saspay_tx_id       uuid UNIQUE,          -- id renvoyé par softpay / transaction_id d'une session
  saspay_session_id  uuid,                 -- si checkout hébergé
  network            text,
  country            char(2),
  amount             numeric(18,2) NOT NULL,
  currency           char(3) NOT NULL,
  status             text NOT NULL DEFAULT 'PENDING', -- PENDING|SUCCESS|FAILED
  checkout_url       text,
  raw_last_response  jsonb,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now()
);

CREATE TABLE saspay_webhook_events (
  id           bigserial PRIMARY KEY,
  event        text NOT NULL,
  tx_id        text NOT NULL,
  payload      jsonb NOT NULL,
  received_at  timestamptz DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (event, tx_id)
);
```

### 12.2 Flux A — Softpay (UI maison)

```
1. Front : le client choisit pays + opérateur (liste issue de /pricing/my-rates/, cachée) + saisit son numéro
   └─ si payin.otp_required → afficher otp_instructions + champ OTP
2. Back : créer la ligne `payments` (PENDING) + Idempotency-Key (UUID)
3. Back : POST /payments/softpay/  (retry réseau = même clé)
4. Back : stocker data.id (saspay_tx_id)
5. Si data.checkout_url non vide → renvoyer l'URL au front → redirection
   Sinon → écran "Validez le paiement sur votre téléphone" (+ data.instructions si présent)
   └─ si le réseau exige une confirmation OTP → champ "code reçu" → POST /payments/{id}/confirm-otp/
6. Webhook transaction.success / .failed → vérification signature → dédup → GET /payments/{id}/verify/
7. Si verify.status == SUCCESS et montant/devise OK → marquer payé, livrer
8. Front : polling de VOTRE backend (pas de SasPay) toutes les 3-5 s, timeout ~3 min
9. Échec → proposer "Réessayer" → POST /payments/{id}/retry/ (nouvelle Idempotency-Key, éventuellement autre réseau/numéro)
10. Cron toutes les 5 min : verify les paiements PENDING > 10 min
```

Exemple TypeScript (client minimal) :

```ts
const BASE = "https://api.saspay.me/api/v1";

async function saspay<T>(path: string, init: RequestInit & { idempotencyKey?: string } = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.SASPAY_API_KEY}`,
      "Content-Type": "application/json",
      ...(init.idempotencyKey ? { "Idempotency-Key": init.idempotencyKey } : {}),
      ...init.headers,
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) {
    const err = body?.error ?? {};
    throw Object.assign(new Error(typeof err.message === "string" ? err.message : "SasPay error"), {
      status: res.status, code: typeof err.code === "string" ? err.code : "validation_error", details: err,
    });
  }
  return body.data as T;
}

// Initier
const data = await saspay<{ id: string; status: string; checkout_url: string; instructions?: string }>(
  "/payments/softpay/",
  { method: "POST", idempotencyKey: payment.idempotencyKey, body: JSON.stringify({
      amount: "2500.00", currency: "XOF", country: "BJ", network: "mtn_bj",
      customer: { email, first_name, last_name, phone },
      metadata: { order_id: order.id },
      return_url: `${APP_URL}/paiement/retour?pid=${payment.id}`,
  }) },
);
if (data.checkout_url) { /* rediriger */ } else { /* attendre push */ }

// Vérifier avant livraison
const tx = await saspay<{ status: string; net_amount: string; currency: string; requested_amount: string }>(
  `/payments/${payment.saspayTxId}/verify/`, { method: "GET" });
```

### 12.3 Flux B — Checkout hébergé

```
1. Back : POST /checkout-sessions/ { amount, currency, customer_email, customer_name, return_url, metadata:{order_id} }
2. Stocker session.id ; rediriger le client vers session.checkout_url
3. Retour sur return_url (succès uniquement) → afficher "vérification…" → GET /checkout-sessions/{id}/status/
4. Webhook transaction.success → data.id == session.transaction_id → verify → livrer
5. Pas de retour (échec / onglet fermé) → la commande reste "en attente" ; cron qui interroge /status/ ;
   pour abandonner : POST /checkout-sessions/{id}/cancel/
```

Comme `metadata` n'est pas dans le payload webhook, faites la jointure via `GET /checkout-sessions/{id}/status/` (→ `transaction_id`) ou via `GET /transactions/{id}/` → `metadata.order_id`.

### 12.4 Flux C — Lien de paiement

`POST /payment-links/` une fois → partager le lien → chaque paiement crée une Transaction (webhook global ou webhook scopé au lien) → suivi via `GET /payment-links/{id}/transactions/` ; les réponses aux `custom_fields` sont dans `metadata`.

### 12.5 Flux D — Payout

```
1. Vérifier GET /merchant-balances/ (available_amount du pays, is_frozen=false)
2. Vérifier payout.available pour le réseau (my-rates)
3. POST /payouts/initialize/ (Idempotency-Key stockée, depuis le serveur à IP whitelistée)
4. Webhook transaction.success/failed + GET /payouts/{id}/verify/
5. FAILED → nouvelle demande avec nouvelle Idempotency-Key (pas de retry)
```

### 12.6 Gestion des erreurs (classification)

| HTTP | Action |
|---|---|
| 400 | Bug d'intégration/validation → corriger, afficher les erreurs de champ |
| 401 | Clé invalide/expirée → alerte ops, ne pas retenter |
| 403 | Scope/IP/compte → alerte ops ; `ip_not_whitelisted` → whitelist |
| 404 | ID erroné |
| 409 | Idempotence ou état terminal → relire l'état (`verify`), ne pas recréer |
| 410 | Lien/session expiré → en recréer un |
| 422 | Erreur métier → message utilisateur adapté (§ 15.1) |
| 429 | Backoff exponentiel |
| 5xx / timeout | Retenter **avec la même Idempotency-Key**, puis `verify` |

---

## 13. Checklist de mise en production

- [ ] KYC marchand `VERIFIED`, compte `is_active`.
- [ ] Clés séparées SANDBOX/LIVE, scopes minimaux (`PAYIN` / `PAYOUT` séparées), stockées en secret manager.
- [ ] Aucun appel SasPay depuis le front ou l'app mobile.
- [ ] Montants en chaînes décimales, jamais en float.
- [ ] `Idempotency-Key` persistée et envoyée sur softpay, retry, payout, wallet-transfer.
- [ ] `checkout_url` systématiquement testée après softpay et retry.
- [ ] `return_url` fournie (obligatoire pour card/crypto).
- [ ] OTP pré-paiement géré (orange_ci, orange_bf) via `otp_required`/`otp_instructions`.
- [ ] Confirmation OTP gérée (wizall_sn, etc.) avec repli sur `otp_not_applicable`.
- [ ] Livraison **uniquement** après `verify` = `SUCCESS` + contrôle montant/devise.
- [ ] Webhook HTTPS, signature HMAC vérifiée sur corps brut, tolérance 300 s, comparaison temps constant, réponse < 15 s, traitement idempotent.
- [ ] `signing_secret` sauvegardé.
- [ ] Cron de réconciliation des `PENDING`.
- [ ] IP serveur whitelistée (si payouts), IP sortante fixe.
- [ ] Gestion `429` (backoff) et cache des référentiels.
- [ ] Validation du format téléphone côté app (indicatif + longueur + préfixe opérateur).
- [ ] Logs sans clé API ni secret webhook.
- [ ] Test de bout en bout en SANDBOX (succès, échec, timeout, webhook.test) puis bascule `sk_live_`.

---

## 14. Incohérences et pièges repérés dans la doc

| # | Constat | Recommandation |
|---|---|---|
| 1 | L'intro cite `POST /payments/softpay/initialize/` pour l'idempotence, alors que l'endpoint réel (OpenAPI) est `POST /payments/softpay/`. | Utiliser `/payments/softpay/`. |
| 2 | Le snippet JS de la page softpay dit « sondez `GET /payments/{id}/` », endpoint inexistant. | Utiliser `GET /payments/{id}/verify/`. |
| 3 | `return_url` sur `/payments/softpay/` est documenté dans le texte mais **absent du schéma OpenAPI** du body. | L'envoyer quand même (indispensable pour card/crypto). |
| 4 | Le champ `instructions` apparaît dans la réponse softpay du quickstart mais pas dans l'exemple OpenAPI. | Le traiter comme optionnel. |
| 5 | Webhook `data.type` : `PAIEMENT` dans la page webhooks, `PAYIN` dans l'exemple de `webhook-logs`. | Accepter les deux valeurs. |
| 6 | Export CSV : l'OpenAPI liste une colonne `gateway`, la page dit `operation_msisdn` et « gateway jamais exporté ». | Parser le CSV par nom de colonne (header), pas par position. |
| 7 | La page Transactions affirme que `current_gateway` / `pricing_rule` ne sont jamais renvoyés, mais les exemples les contiennent. | Ne pas en dépendre. |
| 8 | `POST /merchant-ip-whitelist-entries/` est cité comme « accessible par clé API » mais n'est pas dans l'OpenAPI. | Gérer la whitelist depuis le dashboard. |
| 9 | `POST /settlements/` cité dans l'idempotence, mais les retraits vers vos comptes (settlements) sont dashboard-only. | Ignorer côté API. |
| 10 | Exemples de numéros au format pré-2021 du Bénin (`+22997505050`, 8 chiffres) alors que le format actuel est 10 chiffres (`01…`). | Utiliser le format actuel. |
| 11 | Pas de validation croisée `amount_type`/`amount` sur les liens. | Valider côté app. |
| 12 | Deux paginations différentes (page vs curseur) et `/payment-links/{id}/transactions/` sans filtre. | Abstraire la pagination dans le client. |
| 13 | `/networks/` sans filtre `?country=`, `/merchant-balances/` sans filtre. | Filtrer côté client, mettre en cache. |
| 14 | `return_url` du checkout non utilisée en cas d'échec. | Prévoir l'état « en attente » et une reprise. |
| 15 | `settlement.*` : payload non stabilisé. | Ne pas en dépendre. |
| 16 | Abonnement webhook en double → erreur serveur générique. | Vérifier via `GET /merchant-webhook-subscriptions/` avant. |
| 17 | `insufficient_balance` n'est pas listé dans les 422 de `/payouts/initialize/` (mais l'est ailleurs). | Le gérer quand même. |
| 18 | Congo-Brazzaville (`CG`) présent au référentiel mais sans réseau mobile money. | Voir § 6.5 — confirmer avec le support. |
| 19 | Le KYC particulier (pièce d'identité recto/verso + selfie) n'est pas documenté : seul `kyc_type: "BUSINESS"` apparaît. | Il existe bien : c'est le type du compte Yamboka (cf. § 3.1). |

---

## 15. Annexes

### 15.1 Codes d'erreur métier

| Code | HTTP | Endpoint(s) | Signification / action |
|---|---|---|---|
| `email_not_verified` | 403 | `/auth/login/` | Vérifier l'email d'abord |
| `missing_method` | 422 | softpay, retry | `network` absent |
| `invalid_country` | 422 | softpay, retry, payout | Pays inconnu/non supporté |
| `no_exchange_rate` | 422 | softpay, retry | Pas de taux pour convertir la devise |
| `invalid_customer` | 422 | softpay, retry, payout | Données client invalides |
| `invalid_method` | 422 | softpay, retry, payout | Réseau inconnu, inactif ou non disponible |
| `prepayment_otp_missing` | 422 | softpay | OTP pré-paiement requis (orange_ci/orange_bf) |
| `no_route_available` | 422 | softpay, retry, payout | Aucun gateway disponible → réessayer plus tard / autre réseau |
| `otp_not_applicable` | 400 | confirm-otp | Réseau sans confirmation OTP |
| `otp_confirmation_failed` | 422 | confirm-otp | OTP refusé (message générique) |
| `not_pending` | 409 | confirm-otp, checkout cancel | Plus en `PENDING` |
| `no_gateway` | 409 | confirm-otp | Pas de gateway associé |
| `no_attempt` | 409 | confirm-otp | Pas de tentative en cours |
| `invalid_flow` | 400 / 409 | retry (400), invoice (409) | Transaction sortante (payout) |
| `not_success` | 409 | invoice | Transaction pas `SUCCESS` |
| `payout_not_enabled` | 403 | payout | Fonctionnalité désactivée → support |
| `ip_not_whitelisted` | 403 | payout | Whitelister l'IP du serveur |
| `currency_country_mismatch` | 422 | payout | Devise ≠ devise du pays |
| `wallet_frozen` | 422 | payout, wallet-transfer | Sorties bloquées |
| `insufficient_balance` | 422 | wallet-transfer (payout probable) | Solde insuffisant |
| `same_country` | 422 | wallet-transfer | Source = cible |
| `transfer_already_pending` | 422 | wallet-transfer | Un transfert attend déjà validation |
| `merchant_suspended` | 403 | toutes | Compte suspendu → support |
| *(validation)* | 400 | toutes | Objet `{champ: [messages]}` |

### 15.2 Référentiel complet `GET /countries/` (202 pays)

Format : `ISO | Nom | Devise | is_active`. ✅ = au moins un réseau mobile money dans le catalogue SasPay (cf. § 6.2). `XX`/`XY` = pays techniques pour `card`/`crypto`.

```
AD|Andorre|EUR|true
AE|Émirats Arabes Unis|AED|true
AF|Afghanistan|AFN|true
AG|Antigua-et-Barbuda|XCD|true
AL|Albanie|ALL|true
AM|Arménie|AMD|true
AO|Angola|AOA|true
AR|Argentine|ARS|true
AT|Autriche|EUR|false
AU|Australie|AUD|true
AZ|Azerbaïdjan|AZN|true
BA|Bosnie-Herzégovine|BAM|true
BB|Barbade|BBD|true
BD|Bangladesh|BDT|true
BE|Belgique|EUR|true
BF|Burkina Faso|XOF|true          ✅
BG|Bulgarie|EUR|false
BH|Bahreïn|BHD|true
BI|Burundi|BIF|true
BJ|Bénin|XOF|true                 ✅
BN|Brunei|BND|true
BO|Bolivie|BOB|true
BR|Brésil|BRL|true
BS|Bahamas|BSD|true
BT|Bhoutan|BTN|true
BW|Botswana|BWP|true
BY|Biélorussie|BYN|true
BZ|Belize|BZD|true
CA|Canada|CAD|true
CD|République Démocratique du Congo|CDF|true   ✅
CF|République Centrafricaine|XAF|true
CG|Congo|XAF|true                 (aucun réseau)
CH|Suisse|CHF|true
CI|Côte d'Ivoire|XOF|true         ✅
CL|Chili|CLP|true
CM|Cameroun|XAF|true              ✅
CN|Chine|CNY|true
CO|Colombie|COP|true
CR|Costa Rica|CRC|true
CU|Cuba|CUP|true
CV|Cap-Vert|CVE|true
CY|Chypre|EUR|false
CZ|République Tchèque|EUR|false
DE|Allemagne|EUR|true
DJ|Djibouti|DJF|true
DK|Danemark|EUR|true
DM|Dominique|XCD|true
DO|République Dominicaine|DOP|true
DZ|Algérie|DZD|true
EC|Équateur|USD|true
EE|Estonie|EUR|false
EG|Égypte|EGP|true
ER|Érythrée|ERN|true
ES|Espagne|EUR|true
ET|Éthiopie|ETB|true
FI|Finlande|EUR|false
FJ|Fidji|FJD|true
FM|Micronésie|USD|true
FR|France|EUR|true
GA|Gabon|XAF|true
GB|Royaume-Uni|GBP|true
GD|Grenade|XCD|true
GE|Géorgie|GEL|true
GH|Ghana|GHS|true                 ✅
GM|Gambie|GMD|true
GN|Guinée|GNF|true                ✅
GQ|Guinée Équatoriale|XAF|false
GR|Grèce|EUR|false
GT|Guatemala|GTQ|true
GW|Guinée-Bissau|XOF|false
GY|Guyana|GYD|true
HK|Hong Kong|HKD|true
HN|Honduras|HNL|true
HR|Croatie|EUR|false
HT|Haïti|HTG|true
HU|Hongrie|EUR|false
ID|Indonésie|IDR|true
IE|Irlande|EUR|false
IL|Israël|ILS|true
IN|Inde|INR|true
IQ|Irak|IQD|true
IR|Iran|IRR|true
IS|Islande|ISK|true
IT|Italie|EUR|false
JM|Jamaïque|JMD|true
JO|Jordanie|JOD|true
JP|Japon|JPY|true
KE|Kenya|KES|true                 ✅
KG|Kirghizistan|KGS|true
KH|Cambodge|KHR|true
KI|Kiribati|AUD|true
KM|Comores|KMF|true
KN|Saint-Christophe-et-Niévès|XCD|true
KP|Corée du Nord|KPW|true
KR|Corée du Sud|KRW|true
KW|Koweït|KWD|true
KZ|Kazakhstan|KZT|true
LA|Laos|LAK|true
LB|Liban|LBP|true
LC|Sainte-Lucie|XCD|true
LI|Liechtenstein|CHF|true
LK|Sri Lanka|LKR|true
LR|Libéria|LRD|true
LS|Lesotho|LSL|false
LT|Lituanie|EUR|false
LU|Luxembourg|EUR|false
LV|Lettonie|EUR|false
LY|Libye|LYD|true
MA|Maroc|MAD|true
MC|Monaco|EUR|true
MD|Moldavie|MDL|true
ME|Monténégro|EUR|true
MG|Madagascar|MGA|true
MH|Îles Marshall|USD|true
MK|Macédoine du Nord|MKD|true
ML|Mali|XOF|true                  ✅
MM|Myanmar|MMK|true
MN|Mongolie|MNT|true
MO|Macao|MOP|true
MR|Mauritanie|MRU|true
MT|Malte|EUR|false
MU|Maurice|MUR|true
MV|Maldives|MVR|true
MW|Malawi|MWK|true                ✅
MX|Mexique|MXN|true
MY|Malaisie|MYR|true
MZ|Mozambique|MZN|true
NA|Namibie|NAD|true
NE|Niger|XOF|true                 ✅
NG|Nigeria|NGN|true               ✅
NI|Nicaragua|NIO|true
NL|Pays-Bas|EUR|false
NO|Norvège|NOK|true
NP|Népal|NPR|true
NR|Nauru|AUD|true
NZ|Nouvelle-Zélande|NZD|true
OM|Oman|OMR|true
PA|Panama|PAB|true
PE|Pérou|PEN|true
PG|Papouasie-Nouvelle-Guinée|PGK|true
PH|Philippines|PHP|true
PK|Pakistan|PKR|true
PL|Pologne|EUR|false
PS|Palestine|ILS|true
PT|Portugal|EUR|false
PW|Palaos|USD|true
PY|Paraguay|PYG|true
QA|Qatar|QAR|true
RO|Roumanie|EUR|false
RS|Serbie|RSD|true
RU|Russie|RUB|true
RW|Rwanda|RWF|true                ✅
SA|Arabie Saoudite|SAR|true
SB|Îles Salomon|SBD|true
SC|Seychelles|SCR|true
SD|Soudan|SDG|true
SE|Suède|EUR|false
SG|Singapour|SGD|true
SI|Slovénie|EUR|false
SK|Slovaquie|EUR|false
SL|Sierra Leone|SLE|true
SM|Saint-Marin|EUR|true
SN|Sénégal|XOF|true               ✅
SO|Somalie|SOS|true
SR|Suriname|SRD|true
SS|Soudan du Sud|SSP|true
ST|Sao Tomé-et-Principe|STN|true
SV|Salvador|USD|true
SY|Syrie|SYP|true
SZ|Eswatini|SZL|true
TD|Tchad|XAF|false
TG|Togo|XOF|true                  ✅
TH|Thaïlande|THB|true
TJ|Tadjikistan|TJS|true
TL|Timor Oriental|USD|true
TM|Turkménistan|TMT|true
TN|Tunisie|TND|true
TO|Tonga|TOP|true
TR|Turquie|TRY|true
TT|Trinité-et-Tobago|TTD|true
TV|Tuvalu|AUD|true
TW|Taïwan|TWD|true
TZ|Tanzanie|TZS|true              ✅
UA|Ukraine|UAH|true
UG|Ouganda|UGX|true               ✅
US|États-Unis|USD|false
UY|Uruguay|UYU|true
UZ|Ouzbékistan|UZS|true
VA|Vatican|EUR|true
VC|Saint-Vincent-et-les-Grenadines|XCD|true
VE|Venezuela|VES|true
VN|Vietnam|VND|true
VU|Vanuatu|VUV|true
WS|Samoa|WST|true
XC|RDC (USD)|USD|true
XK|Kosovo|EUR|true
XX|International (USD)|USD|true   (card / crypto)
XY|Crypto (USD)|USD|true
YE|Yémen|YER|true
ZA|Afrique du Sud|ZAR|false
ZM|Zambie|ZMW|true                ✅
ZW|Zimbabwe|ZWL|true
```

### 15.3 Ressources officielles

| Ressource | URL |
|---|---|
| Doc | https://docs.saspay.me |
| Référence API | https://docs.saspay.me/api-reference/introduction |
| OpenAPI | https://docs.saspay.me/api-reference/openapi.json |
| Doc complète pour LLM | https://docs.saspay.me/llms-full.txt (index : `/llms.txt`) |
| Démarrage rapide | https://docs.saspay.me/quickstart |
| Création de compte | https://docs.saspay.me/account-setup |
| Skill SasPay pour assistants IA | https://docs.saspay.me/ai/skill |
| Règles AGENTS.md | https://docs.saspay.me/ai/agents-md |
| Plugin WooCommerce (v1.0.0) | https://docs.saspay.me/plugins/woocommerce |
| Dashboard | https://app.saspay.me |
| Support | https://app.saspay.me/dashboard/support |

### 15.4 Bloc `AGENTS.md` officiel (à coller dans le repo si vous utilisez un assistant de code)

```markdown
## Intégration de l'API SasPay

- Utilisez la documentation officielle : /llms.txt de la documentation SasPay.
- Utilisez la spécification OpenAPI : /api-reference/openapi.json.
- Utilisez l'URL de base `https://api.saspay.me/api/v1`.
- Effectuez toutes les requêtes SasPay depuis le backend.
- Stockez la clé API dans un gestionnaire de secrets ou une variable d'environnement.
- Ne placez jamais la clé API dans le frontend, les logs ou le dépôt Git.
- Envoyez la clé avec `Authorization: Bearer sk_test_...` en développement, `sk_live_...` en production.
- Montants : chaînes décimales (`"2500.00"`), jamais de flottants.
- Envoyez un `Idempotency-Key` sur `POST /payments/softpay/`, `POST /payouts/initialize/`, `POST /wallet-transfers/` et `POST /payments/{payment_id}/retry/`.
- Ne livrez un produit ou n'activez un accès que lorsque `GET /payments/{payment_id}/verify/` renvoie `SUCCESS`.
- Si `checkout_url` est non vide après un softpay, redirigez le client vers cette URL.
- Vérifiez la signature des webhooks (`X-Webhook-Signature`, `X-Webhook-Timestamp`) sur le corps brut, et rejetez un horodatage de plus de 300 secondes.
- Pour un retrait, whitelistez l'IP du serveur ; sinon l'appel renvoie `403 ip_not_whitelisted`.
- Gérez les réponses `401`, `403`, `404`, `409`, `422` et `429` selon l'endpoint ; en cas de `429`, espacez les appels.
- N'inventez aucun endpoint, champ, statut ou événement absent de la spécification OpenAPI.
```

### 15.5 Plugin WooCommerce (pour info)

Prérequis : WordPress ≥ 5.6, WooCommerce ≥ 5.8, PHP ≥ 7.4, HTTPS. Installation : téléverser le ZIP → activer → WooCommerce → Réglages → Paiements → SasPay → coller la clé → copier l'URL webhook (`https://votre-site.com/?wc-api=saspay_wc_webhook`) et le Webhook Secret → les déclarer dans le dashboard (events `transaction.success`, `transaction.failed`, secret identique via « Changer le secret ») → tester avec `sk_test_` et `webhook.test`. Journaux : WooCommerce → Statut → Journaux → `saspay-for-woocommerce`.
