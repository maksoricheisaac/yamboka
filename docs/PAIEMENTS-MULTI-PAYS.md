# Paiements multi-pays et achat de crédits sur mesure

Document de référence de la refonte de l'espace client (novembre 2026). Il décrit ce qui est réellement géré,
ce qui ne l'est pas, et comment ouvrir un pays.

## 1. Où se trouve chaque information (source unique)

| Information | Source unique | Qui la modifie |
|---|---|---|
| Pays, devises, indicatifs, réseaux (opérateurs) | `api/src/payments/payment-countries.ts` | Développeur (une entrée par pays ou réseau) |
| Pays **ouverts à la vente** | Réglage `paymentEnabledCountries` (ex. `CG,CM`) | Administration → Paramètres |
| Prix d'un crédit en FCFA (XAF et XOF) | Réglage `creditValueFcfa` | Administration → Paramètres |
| Prix d'un crédit dans une autre devise | Table `CurrencySetting` (`active`, `creditValue`) | Base de données (pas d'écran) |
| Packs et leurs prix | Table `CreditPack` | Administration → Packs |
| Tarifs de création (crédits par seconde et par qualité) | Table `GenerationProduct` | Administration → Produits |
| Bornes d'un paiement par devise | `PAYMENT_LIMITS` dans `payment-countries.ts` | Développeur |

Le site public, la page Crédits, le studio de création et la facturation lisent ces mêmes données. L'endpoint
`GET /api/catalog/pricing` (public) les expose ; il n'y a plus aucun tarif écrit en dur dans le site (le fichier
`web/content/offer.ts` ne garde que les prix des packs d'une offre de secours si l'API est injoignable, sans nombre de vidéos).

## 2. Achat sur mesure

- Montant = ⌈ crédits × prix du crédit ⌉ (calcul en centièmes entiers, une seule fonction : `customPurchaseAmount`
  dans `@yamboka/shared`, rejouée par le serveur).
- **Le serveur recalcule tout** : `POST /api/payments` accepte `credits` (ou `packId`), `country`, `network`, `phone`.
  Un montant envoyé par le navigateur est ignoré. `POST /api/payments/quote` renvoie ce que le serveur facturerait.
- Aucun bonus de pack sur un achat sur mesure (`firstPurchaseBonusPercent = 0`) ; les packs gardent leur bonus.
- Bornes : minimum `PAYMENT_LIMITS[devise].min`, maximum `PAYMENT_LIMITS[devise].max` (convertis en crédits).
- **Jamais à perte** (devises FCFA) : après les frais d'encaissement absorbés et la perte du circuit
  (`circuitLossPercent`), l'argent restant doit couvrir `crédits × hfCostFcfaPerCredit`. Sinon `AMOUNT_TOO_LOW`.
- Le paiement n'a plus de pack obligatoire (`Payment.packId` est facultatif) ; il porte son propre montant et ses crédits.

## 3. Ce que l'agrégateur (SasPay) permet — et ce qui n'est pas géré

Source : `docs/SASPAY_INTEGRATION_GUIDE.md` (catalogue du 1er novembre 2026). **Cette liste est une photo de la
documentation, pas un état en direct.**

Gérés : encaissement mobile money par `POST /payments/softpay/` avec un `network` et un `country`, avec redirection
(`checkout_url`) quand le réseau l'exige, idempotence, vérification serveur avant tout crédit.

Non gérés (réseaux décrits dans la configuration mais **non proposés** aux clients) :

- Réseaux à **code avant paiement** (Orange Money Côte d'Ivoire `orange_ci`, Orange Money Burkina `orange_bf`) :
  il faudrait un champ `otp` dans la requête et une interface de saisie.
- Réseaux à **code après paiement** (Wizall Sénégal `wizall_sn`) : il faudrait `POST /payments/{id}/confirm-otp/`.
- Réseaux **inactifs** chez SasPay (`eu_mobile_cm`, `orange_gn`, `e_money_sn`).
- Paiement par **carte** et **crypto** (USD uniquement, pays technique `XX`) : non intégré.

Points à confirmer avec SasPay (non vérifiables sans paiement réel) :

1. **Congo-Brazzaville** : le guide indique qu'aucun réseau mobile money (`mtn_cg`, `airtel_cg`) n'apparaît dans le
   catalogue du 1er novembre ; le code les utilise pourtant depuis le lancement et le commentaire de
   `saspay.mapper.ts` dit les avoir relevés dans `GET /networks/`. Le fonctionnement actuel n'a pas été modifié ;
   à revérifier par un paiement réel.
2. **Montant minimum** par paiement : non publié. `PAYMENT_LIMITS` contient un minimum commercial prudent (500) à confirmer.
3. **Cameroun** (`mtn_cm`, `orange_cm`) et pays de la zone XOF : listés comme opérationnels, **jamais testés en réel**.
   Si un réseau n'est pas disponible pour notre compte, le paiement est refusé avant tout débit
   (`PAYMENT_METHOD_UNAVAILABLE`), car les tarifs d'encaissement sont lus dans `GET /pricing/my-rates/`.

## 4. Ouvrir un nouveau pays

1. Vérifier le pays et ses réseaux dans `payment-countries.ts` (ajouter l'entrée si absente).
2. Devise **XAF ou XOF** : rien d'autre (même prix, parité fixe). Ajouter le code ISO au réglage
   `paymentEnabledCountries` dans l'administration.
3. **Autre devise** (CDF, GHS, KES…) : aucun taux de change n'est inventé. Il faut (a) une ligne `CurrencySetting`
   active avec le prix du crédit dans cette devise, (b) idéalement des packs dans cette devise
   (`CreditPack.currency`), (c) une borne dans `PAYMENT_LIMITS`. Sans (a) ni packs, le pays n'est pas proposé.
   La garde « jamais à perte » ne peut pas être évaluée hors FCFA : le prix doit être validé par l'équipe.
4. Faire un premier paiement réel de faible montant avant d'ouvrir au public.

## 5. Reçus, historique et montants

Le reçu et l'historique affichent le pays, le moyen de paiement réel (`methodLabel`) et le montant dans la devise
du paiement (`currency`). Le champ d'API `amountFcfa` garde son nom historique pour ne pas casser les clients : il
contient le montant dans `currency`. Le solde reste en crédits ; son équivalent affiché est en FCFA.
