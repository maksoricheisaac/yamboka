# Solde fournisseur, taux sortant et tarifs versionnés

Comptabilité en dollars du compte prépayé Higgsfield, et paramètres de tarification. Complète
[credits-et-paiements.md](credits-et-paiements.md) (crédits client, encaissement) : les deux comptabilités se
répondent mais ne se mélangent jamais.

## Principes

1. **Deux sources de frais, jamais mélangées.** Les frais ENTRANTS (encaissement) viennent de
   `GET /pricing/my-rates/` et sont calculés par [`billing/fees.ts`](../../api/src/billing/fees.ts), seul. Les
   frais SORTANTS (retrait → MoMo → carte → dollars) sont captés par le seul taux `r_out`, mesuré sur les
   recharges réelles. Additionner les deux compterait deux fois la même perte.
2. **Aucun flottant.** FCFA = entiers. Dollars = entiers en **micro-dollars** (1 $ = 1 000 000), en `BigInt`.
   Taux et marges = `Decimal`. Tout est dans [`billing/usd.ts`](../../api/src/billing/usd.ts).
3. **Arrondis du côté sûr.** Coûts, taux de tarification et valeurs attendues sont arrondis **au-dessus**.
4. **Journaux en ajout seul.** Un solde ne s'écrase pas : on ajoute un mouvement. Des triggers PostgreSQL
   refusent `UPDATE`, `DELETE` et `TRUNCATE` sur `ProviderLedger`, `PricingConfig` et `ModelPrice`.
5. **Rien ne se recalcule après coup.** Une génération fige son coût, son taux et sa marge. Changer un tarif
   demain ne change pas ce qui a été facturé hier.

## Tables

| Table | Rôle |
|---|---|
| `ProviderLedger` | Mouvements du solde prépayé, en micro-dollars signés. Le solde EST leur somme. |
| `ProviderTopUp` | Une recharge : FCFA nets retirés, dollars reçus, frais par étape, `r_out` figé. |
| `ProviderBalanceCalibration` | Un solde lu dans la console du fournisseur, avec l'écart constaté. |
| `PricingConfig` | Paramètres versionnés (marge, marge de change, plafonds, marge de sécurité). |
| `ModelPrice` | Tarif fournisseur d'un modèle à une date, avec sa source (`MANUAL` ou `ESTIMATE`). |

### Mouvements du journal

| Type | Signe | Quand |
|---|---|---|
| `TOPUP` | + | Recharge saisie par un administrateur. Porte le `r_out` mesuré. |
| `GENERATION_RESERVE` | − | À la création, dans la même transaction que la réservation des crédits. |
| `GENERATION_CAPTURE` | 0 | Création réussie : la dépense est définitive. |
| `GENERATION_RELEASE` | + | Création échouée : le fournisseur ne facture pas un échec. |
| `CALIBRATION` | ± | Recalage sur le solde lu en console, ou solde ramené à zéro sur refus du fournisseur. |
| `ADJUSTMENT` | ± | Correction manuelle motivée. |

Chaque mouvement porte une référence déterministe unique (`topup:<id>`, `hfreserve:<génération>`,
`hfcapture:…`, `hfrelease:…`, `calib:<id>`, `hfadjust:<uuid>`) : un événement rejoué n'écrit qu'une fois.

## Taux sortant (`r_out`) et taux de tarification

```
r_out (par recharge)  = FCFA NETS retirés ÷ dollars RÉELLEMENT arrivés        (figé à la saisie)
r_pricing             = max(r_out de la dernière recharge, r_out moyen pondéré du solde) × (1 + marge de change)
valeur attendue (FCFA) = coût $ × r_pricing × (1 + marge commerciale)          (arrondi au-dessus)
```

La moyenne pondérée consomme les recharges de la plus ancienne à la plus récente (FIFO), comme les lots de
crédits : chaque recharge pèse les dollars qu'il en reste.

**Tant qu'aucune recharge n'est mesurée**, `r_pricing` se rabat sur un taux provisoire
`taux carte ÷ (1 − perte de circuit)`, et tout ce qui en découle est marqué **« non mesuré »** dans
l'administration. Une fois une recharge mesurée, `r_out` **remplace** ce provisoire — il ne s'y ajoute pas.

## Verrous et concurrence

Le solde fournisseur est **partagé par tous les utilisateurs** : le verrou par utilisateur des crédits n'y
suffit pas. Chaque opération prend `lockProviderBalance` (`pg_advisory_xact_lock`, le temps de la transaction).
Deux créations simultanées dont le solde ne couvre qu'une seule : une passe, l'autre est refusée.

## Garde-fous à la création

Dans l'ordre, **avant** toute réservation de crédits :

1. Maintenance, puis verrou « solde fournisseur épuisé » (`Setting.providerOutOfCreditsAt`).
2. Tarif en vigueur + taux sortant + marge → coût figé.
3. Plafond quotidien global, puis plafond par utilisateur (`PricingConfig`).
4. Dans **une seule** transaction : création, réservation des crédits, engagement des dollars (avec la marge
   de sécurité déduite du solde disponible).

Si le fournisseur répond **403 `not_enough_credits`** : les crédits et les dollars de la création sont rendus,
**puis** le solde est ramené à zéro par un mouvement `CALIBRATION` (notre estimation était fausse), le verrou
est posé et une alerte critique s'affiche dans l'administration. Le verrou se lève seul dès qu'une soumission
repasse. Ce 403 est distingué d'un 401/403 d'identifiants refusés par la lecture du corps de la réponse.

## Valeur plancher du crédit et simulateur

Le prix d'une vidéo EN CRÉDITS se déduit de ce qu'un crédit a réellement rapporté, dans le cas le plus
défavorable de tout ce qui est en vente ([`billing/floor.ts`](../../api/src/billing/floor.ts)) :

```
plancher(pack, moyen de paiement) = net reçu ÷ crédits reçus (bonus compris)
plancher                          = le plus petit de tous
crédits à facturer                = ⌈ valeur attendue en FCFA ÷ plancher ⌉
```

Le net reçu vient de `fees.ts` (prix affiché moins les frais d'encaissement). Le bonus de premier achat est
compté **sur chaque crédit** au lancement (`bonusValuationPercent = 100`, prudent) ; le paramètre existe pour
descendre plus tard vers la part réellement observée sur les ventes. Le plancher est arrondi vers le BAS et
les crédits facturés vers le HAUT : les deux protègent la plateforme.

`/admin/simulateur` montre, pour un scénario (perte de circuit, marge, part du bonus, durées), le coût de
chaque vidéo en dollars et en FCFA, ce qu'elle doit rapporter, les crédits qu'il **faudrait** facturer, ceux
que la grille facture, et la marge qui en résulte — en rouge si elle est négative. Il ne modifie rien : il
appelle les mêmes fonctions que la facturation réelle avec d'autres paramètres d'entrée. La synthèse
financière affiche en regard le coût des crédits offerts sur la période.

## Administration

`/admin/finances` : solde estimé, part engagée, taux de tarification (avec la mention « non mesuré » le cas
échéant), date et écart du dernier relevé, saisie d'un relevé, saisie d'une recharge (FCFA nets retirés,
dollars reçus, montant carte, date), historique des recharges et des relevés.

Routes : `GET/POST /admin/finance/topups`, `GET/POST /admin/finance/calibrations`,
`GET /admin/finance/provider-balance`.

## Tests

| Fichier | Couvre |
|---|---|
| [`billing/usd.spec.ts`](../../api/src/billing/usd.spec.ts) | Conversions, `r_out`, moyenne pondérée, taux provisoire, propriété « jamais sous le coût ». |
| [`test/provider-balance.e2e-spec.ts`](../../api/test/provider-balance.e2e-spec.ts) | Ajout seul, signes, calibrage, idempotence, **concurrence** (une seule des deux passe), restitution. |
| [`test/pricing-versions.e2e-spec.ts`](../../api/test/pricing-versions.e2e-spec.ts) | Versions de paramètres et de tarifs, antériorité, refus de modification sur place. |
| [`test/generation-reliability.e2e-spec.ts`](../../api/test/generation-reliability.e2e-spec.ts) | Coût figé, engagement et restitution des dollars, solde insuffisant, 403 solde épuisé. |

Les tests du solde et des tarifs ont leur **propre base** (`yamboka_provider_test`, `yamboka_pricing_test`) :
ils écrivent un état global. Lancer la suite d'intégration avec `--maxWorkers=2` (au-delà, les suites qui
partagent `yamboka_test` se gênent). Les tests BullMQ exigent un Redis **accessible depuis l'hôte**.

## Reste à faire

- Tarification des générations **en crédits** par la formule : le simulateur la calcule déjà et signale les
  écarts, mais la facturation réelle utilise encore `GenerationProduct.creditsPerUnit`, saisi à la main.
- Enregistrement du net réellement reçu par paiement et alerte d'écart de frais (> 0,5 point).
- Comparaison périodique avec `POST /estimate/{modèle}` et alerte au-delà de 5 % d'écart.
- Tableau de bord (engagement, couverture, jours d'autonomie), simulateur, bilan hebdomadaire réel, alertes
  par e-mail derrière une interface « canal de notification ».
