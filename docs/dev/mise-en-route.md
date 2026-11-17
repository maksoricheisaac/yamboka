# Checklist de mise en route

Ce document est la seule chose qui sépare la plateforme d'une ouverture à la vente. Il ne contient aucune
tâche de développement : tout ce qui suit est une **mesure** à faire sur le réel, ou un **réglage** à
basculer dans l'administration.

Tant que `provisional` est vrai dans la configuration des calculs, la plateforme tarife avec le **scénario
pessimiste** (perte de circuit plancher de 14 %, marge de change 2 %, bonus compté à 100 %, frais entrants
du palier le moins favorable). C'est volontaire : mieux vaut vendre un peu trop cher que vendre à perte.
Les prix baisseront d'eux-mêmes quand les vraies mesures remplaceront les hypothèses.

> **Ordre important.** Les étapes 1 à 4 produisent les chiffres ; l'étape 7 les met en service. Ne basculez
> `provisional` à faux qu'à la fin.

---

## 1. Mesurer `r_out` sur un retrait réel

`r_out` est le seul chiffre qui dise combien coûte vraiment un dollar chez le fournisseur, tout le circuit
compris. Il se mesure, il ne se calcule pas.

Faites un vrai retrait, de bout en bout, et notez **chaque** montant au passage :

| À noter | Où le lire |
|---|---|
| FCFA **nets** sortis du portefeuille SasPay | relevé SasPay, après les frais de retrait |
| Frais de retrait SasPay | différence entre le montant demandé et le net sorti |
| FCFA reçus sur MoMo MTN | SMS ou application MTN |
| Frais MoMo → carte | différence entre le reçu MoMo et le chargé sur la carte |
| FCFA débités de la carte | relevé de la carte |
| Dollars **arrivés** sur le compte Higgsfield | console Higgsfield → Billing |

Puis, dans l'administration : **Finances → Saisir une recharge**. Renseignez les FCFA nets sortis de SasPay,
les FCFA débités de la carte, les dollars reçus, et les frais étape par étape.

`r_out` est calculé et **figé** à la saisie : `r_out = FCFA nets sortis ÷ dollars arrivés`.

**Le taux ne s'applique pas tout de suite.** La recharge apparaît « en attente » dans le journal. Cliquez
sur **En attente · voir l'effet** : l'aperçu montre, pour chaque modèle, chaque qualité et chaque durée, le
prix avant et après. Si les marges restent positives, appliquez avec un motif. Sinon, corrigez d'abord la
marge dans **Configuration des calculs**.

> Le retrait SasPay est supposé à 1 % : **cette valeur n'est pas mesurée**. Cette étape est précisément ce
> qui la remplace par la vraie. Les frais de retrait, MoMo, carte et change entrent tous dans `r_out` et
> **jamais** dans les frais entrants.

---

## 2. Relever le solde de départ chez Higgsfield

Le solde Higgsfield n'est pas lisible par l'API : la plateforme le suit dans son propre journal. Il faut
donc le caler une fois sur le réel.

1. Console Higgsfield → **Billing** → notez le solde affiché, en dollars.
2. Administration → **Finances → Relever le solde en console**. Saisissez cette valeur.

**Un seul mouvement de calibrage initial.** L'écart constaté est enregistré ; les calibrages suivants ne
servent qu'à corriger une dérive, pas à « remettre à zéro » régulièrement. Un écart qui se répète est un
signal (une dépense non journalisée), pas une routine.

---

## 3. Confirmer les frais entrants avec un second paiement test

Le premier paiement test à 500 F ne suffit pas : les frais d'encaissement sont par paliers, et un seul point
de mesure ne dit pas lequel s'applique.

1. Faites un second paiement réel à un montant **différent** de 500 F — par exemple 5 000 F, le prix du pack
   Starter, donc le palier qui compte vraiment.
2. Ouvrez **Finances → Paiements** et comparez, sur ce paiement, les frais observés et les frais attendus.
3. Si l'écart dépasse 0,5 point, l'administration lève une alerte critique. Relevez alors
   `GET /pricing/my-rates/` sur votre compte SasPay — **c'est cette grille qui fait foi**, pas la grille
   publique, qui n'annonce qu'un plancher (« dès X % ») — et corrigez le palier.

Palier MTN déjà observé : **5,7 %**. À confirmer sur ce second paiement.

---

## 4. Relever les prix réels du fournisseur avec `/estimate`

`/estimate` est gratuit et ne produit aucune vidéo. Il n'est jamais appelé depuis le parcours client : il
sert ici, et au contrôle périodique.

Dans **Configuration des calculs → Modèles** :

1. **Tester** le modèle en service. Vérifiez que l'`input` affiché est bien ce que vous attendez, et notez
   le prix annoncé.
2. **Calibrer** : lance `/estimate` sur toute la grille (720p, 1080p, chaque durée, chaque option payante)
   et propose un tableau de prix. Regardez les écarts, puis appliquez si vous les validez — le tarif est
   alors enregistré en source `ESTIMATE`.
3. Recommencez pour chaque option payante que vous comptez ouvrir.

Au-delà de 5 % d'écart vers le haut, les nouveaux devis retiennent **déjà** le prix le plus élevé des deux,
et l'administration alerte. Aucun tarif n'est jamais appliqué automatiquement.

---

## 5. Tester l'annulation sur la plus petite génération possible

Prenez la combinaison la moins chère (480p, durée minimale) et lancez une vraie génération, puis annulez-la
chez le fournisseur.

Ce que vous devez constater :

- la création passe en échec, avec un message clair pour le client ;
- les **crédits** sont restitués (journal de crédits : un mouvement `REFUND`) ;
- les **dollars** réservés sont restitués (journal du solde fournisseur : `GENERATION_RELEASE`) ;
- le solde fournisseur revient à sa valeur d'avant.

Il n'y a pas de bouton d'annulation côté client : l'annulation se fait chez le fournisseur, et la plateforme
en tire les conséquences.

---

## 6. Test manuel du chemin worker réel, en pré-production

Les tests automatiques couvrent le service ; ces deux cas-là passent par le worker réel et doivent être vus
au moins une fois.

**6.a — Génération échouée : crédits ET dollars restitués.**
Lancez une génération que le fournisseur refusera (une description volontairement refusée par le contrôle de
contenu fait l'affaire). Vérifiez les **deux** journaux : crédits restitués, dollars restitués. Une
restitution d'un seul des deux est une fuite.

**6.b — Faux 403 `not_enough_credits` : verrou et solde à zéro.**
Videz le solde Higgsfield (ou attendez qu'il soit bas), puis lancez une génération. Vérifiez que :

- le fournisseur répond 403 avec `not_enough_credits` ;
- la plateforme **bloque** les nouvelles créations (réglage `providerOutOfCreditsAt` posé) ;
- l'administration affiche l'alerte critique « solde épuisé » ;
- les crédits du client ont été restitués ;
- après une recharge, la première soumission acceptée **lève le verrou toute seule**.

Ce cas est celui qui distingue « nos identifiants sont refusés » de « notre compte prépayé est vide » : les
confondre envoie vérifier la mauvaise chose.

---

## 7. Paramètres à passer de `provisional` à faux, dans l'ordre

Dans **Configuration des calculs**. Chaque application demande un motif et garde son auteur ; un retour en
arrière est toujours possible en un clic.

| Ordre | Paramètre | Condition pour y toucher |
|---|---|---|
| 1 | **Frais de retrait SasPay** (1 % supposé) | étape 1 faite : remplacez par la valeur mesurée |
| 2 | **Frais MoMo → carte** et **frais de recharge** | étape 1 faite : relevés étape par étape |
| 3 | **Taux carte FCFA → $** | étape 1 faite ; ne sert plus qu'en repli une fois `r_out` appliqué |
| 4 | **Perte de circuit provisoire** | étape 1 faite **et** le taux mesuré appliqué : cette valeur ne sert plus. Ne l'ajoutez **jamais** à un `r_out` mesuré |
| 5 | **Frais entrants par moyen de paiement** | étape 3 faite : palier confirmé sur `GET /pricing/my-rates/` |
| 6 | **Tarifs des modèles** | étape 4 faite : tarifs en source `ESTIMATE` ou `MANUAL`, complets pour toutes les combinaisons |
| 7 | **Bonus compté (`bonusValuationPercent`)** | à laisser à **100 %** jusqu'à avoir mesuré la part réelle du bonus sur les ventes. L'abaisser trop tôt baisse les prix sur une hypothèse |
| 8 | **Marge visée** | une fois tout le reste mesuré : c'est le seul paramètre qui soit une décision commerciale, pas une mesure |
| 9 | **`provisional` → faux** | **en dernier.** Regardez l'aperçu : aucune marge négative, dans les deux scénarios |

Après la bascule, repassez sur le **Simulateur** : la colonne « Marge pessimiste » doit rester positive
partout. Si elle ne l'est plus, remettez `provisional` à vrai (retour en arrière en un clic) et reprenez.

---

## Ce qui reste volontairement hors de cette checklist

- **Image-to-video et autres modes** : le catalogue les prévoit, le parcours client non.
- **Bouton d'annulation côté client** : hors périmètre.
- **Repli automatique d'un modèle vers un autre** : jamais. Un modèle qui échoue alerte, il ne se remplace
  pas tout seul.
- **Les deux tests BullMQ en échec** (`pg` sous Jest avec `--experimental-vm-modules`) : traités à part, voir
  [tests.md](tests.md).
