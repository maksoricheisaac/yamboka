# Crédits et paiements (mode simulation)

Aucun appel réel n'est fait vers un opérateur ou un agrégateur : le paiement passe par un **fournisseur simulé**. L'intégration OpenPay n'est pas codée ; son point d'accrochage est décrit en fin de document.

## Registre de crédits et lots

Table `CreditLedger`, en **ajout seul** (RG-02) : un trigger PostgreSQL interdit `UPDATE`, `DELETE` et `TRUNCATE`, même en SQL direct. Le solde est toujours `SUM(amount)` ; il n'existe aucune colonne « solde ». Une correction passe par un nouveau mouvement. Aucune clé étrangère ne pointe vers cette table (sinon `TRUNCATE` échouerait avant le trigger).

| Type | Signe | Référence (unique) | Quand |
|---|---|---|---|
| `PURCHASE` | + | `pay:<réf. fournisseur>` | Achat confirmé (crédits du pack) |
| `FIRST_PURCHASE_BONUS` | + | `firstbonus:<réf. fournisseur>` | Premier achat réussi du compte (lot distinct) |
| `RESERVE` | − | `reserve:<generationId>` | Lancement d'une création |
| `CAPTURE` | 0 | `capture:<generationId>` | Création réussie : la réservation devient définitive |
| `RELEASE` | + | `release:<generationId>` | Échec technique, annulation ou délai dépassé |
| `ADMIN_ADJUST` | ± | `adjust:<uuid>` | Geste commercial ou correction (motif obligatoire) |
| `EXPIRE` | − | `expire:<id du lot>` (suffixe `:n` si le lot expire de nouveau) | Lot échu |
| `WELCOME` | + | — | **Hérité** : plus jamais produit ; des lignes anciennes peuvent subsister |

**Aucun crédit n'est offert à l'inscription** (ni à la vérification de l'e-mail) : les comptes multiples ne rapportent rien.

La contrainte `credit_ledger_amount_sign` vérifie le signe de chaque type. La référence unique rend chaque opération **idempotente**.

### Lots (`CreditLot`)

Chaque entrée de crédits (`PURCHASE`, `FIRST_PURCHASE_BONUS`, `ADMIN_ADJUST` positif) crée **un lot** avec son échéance, dans la même transaction que le mouvement du journal. Le lot porte `remaining` (ce qui reste à dépenser). Invariant : **la somme des `remaining` égale le solde du journal** (testé après des rafales d'opérations concurrentes). Contrainte SQL : `0 ≤ remaining ≤ initialAmount`.

- **Consommation FIFO** : une réservation prélève d'abord le lot qui expire le plus tôt (puis le plus ancien). Fonction pure `allocateFifo` (`src/credits/fifo.ts`). Un lot échu n'est jamais dépensé.
- **Allocations** (`LotAllocation`) : pour chaque réservation, ce qui a été pris sur chaque lot. La libération restitue chaque lot pour ce qu'il avait donné. Une réservation antérieure aux lots (sans détail) revient dans un lot neuf.
- **Expiration** : le job nocturne (3 h, Brazzaville) et chaque réservation, libération ou ajustement expirent les lots échus d'un utilisateur (`EXPIRE`, montant = reste du lot). Des crédits libérés dans un lot devenu échu expirent aussitôt.
- **Validité** : 12 mois pour un achat et son bonus (même échéance) ; 12 mois par défaut pour un ajout administratif. Un retrait administratif est pris sur les lots comme une consommation.

### Bonus de premier achat

- Pourcentage : `CreditPack.firstPurchaseBonusPercent` (`null` = valeur globale `firstPurchaseBonusDefaultPercent`, 20 par défaut ; `0` = aucun bonus pour ce pack), activable globalement par `firstPurchaseBonusEnabled`.
- Le pourcentage promis est **figé sur le paiement à sa création** ; l'éligibilité est jugée à la **confirmation** : premier paiement réussi du compte, jamais sur un paiement en attente ou échoué.
- Accordé **une seule fois par compte**, même avec des confirmations simultanées : le verrou utilisateur sérialise les transactions, la seconde voit le premier achat déjà réussi ; un index unique partiel sur `CreditLedger` en est le filet.
- Bonus arrondi à l'inférieur (2 600 crédits à 20 % : 520). Le lot de bonus a la même échéance que le pack.

### Concurrence

Toute opération qui lit le solde puis écrit (`reserve`, `capture`, `release`, `adjust`, expiration, `grantPurchase`) prend d'abord un verrou de ligne sur l'utilisateur (`SELECT … FOR UPDATE`, `lockUserRow`). Deux requêtes simultanées pour un même utilisateur s'exécutent donc l'une après l'autre : cinq réservations de 40 crédits avec 100 crédits n'en acceptent que deux. Une capture et une libération simultanées : une seule gagne (les deux sont exclusives).

## Paiement d'un pack

```
POST /v1/payments {packId, operator, phone}
  → Payment INITIATED → provider.initiate → PENDING (référence fournisseur)
Le client confirme sur son téléphone
  → callback  POST /v1/webhooks/payment {reference}   (réponse 200 immédiate, toujours la même)
  → tâche verify-payment → provider.getStatus(reference)
  → SUCCESS uniquement si le fournisseur dit « succès » ET que montant et devise correspondent
  → dans une transaction (verrou utilisateur d'abord) : Payment SUCCESS + lot PURCHASE, et lot FIRST_PURCHASE_BONUS s'il s'agit du premier achat réussi
```

Règles de sécurité :

- **Un callback n'est jamais cru.** Il ne fait que déclencher une vérification du statut réel auprès du fournisseur (RG-04). Un corps qui affirme « succès » n'a aucun effet.
- **Montant et crédits sont calculés côté serveur** à partir du pack. Tout champ envoyé par le client est ignoré.
- **Un seul crédit par paiement** (RG-05) : le passage à `SUCCESS` est « réclamé » par un `UPDATE` conditionnel, et les références `pay:` / `bonus:` sont uniques.
- **Double envoi** : un même pack, opérateur et numéro dans les 2 minutes renvoient le paiement déjà créé (création sérialisée par un verrou utilisateur).
- **Montant incohérent** chez le fournisseur : jamais crédité, paiement marqué « vérification manuelle requise ».
- **Fournisseur en panne ou réponse invalide** : aucune conclusion, le paiement reste en attente et sera revérifié.
- **Rattrapage** toutes les 2 minutes : revérifie les paiements ouverts (callback perdu). Au bout de 24 h sans confirmation : `FAILED` (motif « Délai de confirmation dépassé »). Un succès **tardif** confirmé par le fournisseur après ce délai est tout de même crédité, une fois.

## Fournisseur simulé (`PAYMENT_PROVIDER=mock`)

L'état « côté opérateur » est stocké dans la table `MockPaymentTransaction`, comme le serait celui d'un vrai fournisseur.

| Scénario | Comment le déclencher | Résultat attendu |
|---|---|---|
| Succès | Écran d'attente → « Confirmer le paiement » | Crédité une fois |
| Échec / annulation | « Refuser » / « Annuler » | Aucun crédit, message clair |
| Callbacks dupliqués | « Succès avec 3 callbacks » | Crédité une seule fois |
| Callback falsifié | « Faux callback » | Rien (le fournisseur dit toujours « en attente ») |
| Panne du fournisseur | « Panne du fournisseur » | Reste en attente, aboutit au retour du service |
| Réponse invalide | « Réponse invalide » | Idem |
| Fournisseur indisponible dès le départ | Numéro payeur `242099999999` | Erreur 503 claire, paiement échoué, rien débité |

Le panneau « Mode simulation » n'apparaît que si le paiement est simulé ; avec un vrai fournisseur, la route `POST /payments/:id/simulate` renvoie 404.

## Tâches asynchrones

BullMQ + Redis (`REDIS_URL`). En test (`NODE_ENV=test`) la file est désactivée et les tâches s'exécutent en direct ; `QUEUE_ENABLED=true` la force.

| File | Tâche | Déclencheur |
|---|---|---|
| `payments` | `verify-payment` | Callback (une tâche par paiement tant qu'elle n'est pas terminée ; 5 tentatives, attente exponentielle) |
| `payments` | `reconcile-payments` | Toutes les 2 minutes |
| `credits` | `expire-credits` | Chaque nuit à 3 h (Africa/Brazzaville) : expire les lots échus |

Les processeurs tournent dans le processus de l'API pour l'instant ; un processus `worker` séparé est prévu au déploiement.

## Brancher OpenPay plus tard (non fait)

À réception de la documentation officielle, et seulement alors :

1. Créer `OpenPayProvider extends PaymentProvider` (`initiate`, `getStatus`) dans `src/payments/`.
2. L'ajouter dans `PaymentProviders.forCountry('CG')` / `byName` ; la valeur `PAYMENT_PROVIDER` passe à `openpay`.
3. Adapter `WebhooksController` au format de callback réel. Le principe ne change pas : répondre 200 tout de suite, puis déclencher la vérification du statut.
4. Points à confirmer auprès d'OpenPay (cf. `docs/04`, §5) : environnement de test, adresses IP sources des callbacks, taux de commission appliqué.

Rien d'autre ne change : registre, paiements, rattrapage et interface utilisent l'interface `PaymentProvider`.
