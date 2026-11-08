# Catalogue international des pays et moyens de paiement

Yamboka connaît dès maintenant les 21 pays de la page SasPay et une zone « International » (`XX`). **Aucun n'est ouvert
automatiquement** (hormis Congo-Brazzaville et Cameroun, ouverts avant le catalogue) : l'administrateur choisit, sans modifier le code.

## Modèle de données

| Table | Contenu |
|---|---|
| `Country` | `iso` (clé), nom, indicatif, devise, **statut**, frais indicatifs (`indicativeFeePercent`, `indicativeFeeNote`) |
| `PaymentMethod` | `code` (`MTN_MOMO`, `WAVE`, `CARD`, `SWIFT`…), nom, type (`MOBILE_MONEY`, `CARD`, `BANK_TRANSFER`) |
| `CountryPaymentMethod` | association pays ↔ moyen : **statut propre**, `saspayNetwork` (code réseau SasPay, null si inconnu), `limitation`, frais indicatifs, note |
| `CurrencySetting` | prix du crédit et bornes d'un achat libre dans une devise hors franc CFA |
| `Payment` | instantané `countryName`, `methodCode`, `methodName`, `currency` : l'historique ne change jamais |

Statuts (pays et moyens) : `ACTIVE` (ouvert), `COMING_SOON` (affiché « Bientôt disponible », non sélectionnable), `DISABLED` (jamais
proposé). Un pays qui n'est pas `ACTIVE` rend tous ses moyens inutilisables, quel que soit leur propre statut.

## Initialiser le catalogue

Le catalogue est chargé par `seedCountryCatalog` (`api/src/payments/catalog/catalog-seed.ts`, données dans `catalog-data.ts`), appelée par
`pnpm --filter api db:seed` et par le Setup Wizard.

```bash
pnpm --filter api db:deploy    # applique les migrations (20261108134418_international_payment_catalog…)
pnpm --filter api db:seed      # charge ou complète le catalogue
```

Le seed est **idempotent** : relancé, il ne crée aucun doublon et **ne modifie jamais un statut** choisi par l'administrateur ; il
rafraîchit seulement les données techniques (noms, indicatifs, codes réseau, frais indicatifs, limitations). Il renseigne aussi
l'instantané pays / moyen des anciens paiements qui n'en ont pas. À la première exécution, seuls les pays de l'ancien réglage
`paymentEnabledCountries` (par défaut CG, CM) et leurs moyens activables sont `ACTIVE`.

## Ouvrir un pays ou un opérateur (administration → Pays et paiements)

1. **Tarification** : un pays ne s'ouvre que si sa devise est vendable. Franc CFA (XAF, XOF) : prix du crédit dans Paramètres et packs
   en XAF. Autre devise : fiche du pays → « Configurer la tarification » (prix d'un crédit en entier, achat minimum et maximum). Aucun
   taux de change n'est inventé ; sans tarification, l'activation est refusée (`CURRENCY_NOT_CONFIGURED`).
2. **Pays** : statut `ACTIVE`, `COMING_SOON` ou `DISABLED`, avec un motif (journal d'audit).
3. **Moyens** : statut propre à chaque moyen. Activer MTN MoMo au Rwanda et laisser Airtel Money en `COMING_SOON` est possible.

Un moyen ne s'active pas (`PAYMENT_METHOD_NOT_ACTIVATABLE`) tant que sa `limitation` n'est pas levée :

| Limitation | Sens |
|---|---|
| `NOT_IN_SASPAY` | aucun réseau correspondant dans la documentation SasPay (ex. Gabon, Éthiopie, Mozambique, Lesotho, Sierra Leone, MTN au Togo, SWIFT) |
| `OTP_BEFORE` / `OTP_AFTER` | code OTP non géré (Orange Money CI et BF) |
| `INACTIVE_AT_SASPAY` | réseau désactivé chez SasPay |
| `CARD_FLOW_NOT_INTEGRATED` | carte Visa / Mastercard : USD uniquement et page hébergée, parcours non intégré |

## Côté client et contrôles serveur

`GET /api/catalog/pricing` renvoie les pays `ACTIVE`, leurs moyens (`status: ACTIVE` ou `COMING_SOON`) et la liste `upcomingCountries`.
Les pays `DISABLED` ne sont jamais exposés. `POST /api/payments` refuse (422) un pays non `ACTIVE` (`COUNTRY_NOT_SUPPORTED`) et un moyen
non `ACTIVE` (`PAYMENT_METHOD_UNAVAILABLE`), et exige un numéro de l'indicatif du pays. Le navigateur ne décide de rien.

## Frais

Les frais du catalogue sont des **informations tarifaires de SasPay** (affichées en administration). Ils ne sont **jamais ajoutés** au
prix payé par le client. Le coût réel vient de `GET /pricing/my-rates/` et de la surcharge `FeeRateOverride`. À vérifier avec le contrat
marchand avant tout usage contractuel.

## Zone International

Visa, Mastercard et virement SWIFT sont gérés à part (`XX`, USD). Visa et Mastercard correspondent au réseau SasPay `card` (USD, page
hébergée) : non activables tant que ce parcours n'est pas intégré. Aucun virement SWIFT n'existe dans la documentation SasPay.
