# Administration et Setup Wizard

## Séparation des espaces

| | Espace client (`/app/*`) | Administration (`/admin/*`) |
|---|---|---|
| Rôle | `USER` | `ADMIN` |
| Identité visuelle | Barre latérale claire | Barre latérale sombre, accent ambre (`[data-space="admin"]` dans `app/app/globals.css`) |
| Contenu | Solde, achats, historique, profil | Pilotage, clients, modération, offre, finances, configuration, audit |
| Après connexion | `/app` | `/admin` (sauf page demandée) |

- Un **administrateur qui ouvre `/app/*` est redirigé vers `/admin`** (`UserShell`) ; un **client qui ouvre `/admin/*` est redirigé vers `/app`** (`requireUser({ role: "ADMIN" })`).
- Ce contrôle est un confort. **La vraie protection est l'API** : `AdminController` porte `@Roles('ADMIN')` sur toute la classe (garde `RolesGuard`, côté serveur). Testé : 401 sans session, 403 pour un client, sur toutes les routes (`api/test/admin.e2e-spec.ts`).
- Le rôle `ADMIN` ne s'obtient **jamais** par l'inscription (le schéma public l'ignore ; testé). Il est accordé par le Setup Wizard (premier administrateur) ou par un administrateur à un compte **existant, actif, à e-mail vérifié** (« Administrateurs »).
- Barre du haut commune (`ShellHeader`) : fil d'Ariane, bouton de thème (persistant via `next-themes`, cookie/stockage local) et `UserNav` (menu déroulant Radix : avatar, nom, e-mail, profil, déconnexion — **seul endroit** de la déconnexion, qui révoque la session en base et efface le cookie).

## Rubriques de l'administration

| Rubrique | Page | Ce qui fonctionne |
|---|---|---|
| Pilotage | Tableau de bord | Utilisateurs (total, inscrits, actifs), chiffre d'affaires, volume et état des paiements, crédits vendus/consommés, générations par état, histogrammes journaliers, **alertes** (paiements en attente > 30 min, taux d'échec, solde Higgsfield bas, marge insuffisante, maintenance, e-mail non configuré en production), **estimation** du solde Higgsfield |
| Clients | Utilisateurs, fiche client | Recherche et filtres, fiche (paiements, générations, registre de crédits, modération), suspension / bannissement / réactivation (motif obligatoire, sessions coupées, e-mail au client), ajustement de crédits (motif obligatoire, jamais de solde négatif) |
| Clients | Réclamations | Liste filtrable et traitement des signalements |
| Générations et modération | Générations | Liste filtrable (client, statut, preset, dates), masquer / ré-afficher avec motif |
| Offre | Packs, Produits, Presets | Voir ci-dessous |
| Finances | Paiements | Journal filtrable, **vérification manuelle** (interroge le fournisseur), export CSV |
| Finances | Synthèse financière | Période, encaissé, crédits, **saisie des recharges Higgsfield et des retraits OpenPay**, export CSV |
| Configuration | Paramètres | Mode maintenance, marges, crédits, limites et seuils, conservation, sécurité de connexion ; test e-mail |
| Configuration | Textes légaux | Nouvelle version (les anciennes sont conservées), version majeure = nouvelle acceptation |
| Configuration | Administrateurs | Ajouter / retirer l'accès (jamais soi-même, jamais le dernier) |
| Audit | Journal d'audit | Acteur, date, entité, valeurs avant/après, motif, IP ; filtrable |

### Offre : trois offres publiques, flexibilité conservée

- Tous les packs restent en base (prix, crédits, bonus, activation, ordre) et **restent achetables dans l'espace client**.
- Le champ `CreditPack.publicVisible` choisit ceux des **pages publiques** : `GET /v1/catalog/packs/public` ne renvoie que les packs **actifs ET publiés**, **trois au maximum**. L'API refuse une quatrième publication (`422 TOO_MANY_PUBLIC`) ; une seule recommandation (en recommander une autre retire la précédente) ; désactiver un pack le retire du public.
- Migration : Découverte, Créateur et Pro sont publiés (entrée / recommandé / régulier). **Aucun tarif, crédit ou coût fournisseur n'est modifié.**
- **Rentabilité avant publication** : un pack actif doit respecter la marge minimale (`minMarginPercent`, 15 %) sur chaque produit actif (formule de `catalog/pricing.ts`). Toute modification qui la violerait est refusée (`422 MARGIN_TOO_LOW`) avec la marge calculée. Même règle quand on active un produit ou change son prix en crédits. Un nouveau pack naît inactif et non public.

### Journal d'audit

`AuditService.log(entrée, tx)` écrit dans **la même transaction** que l'opération (pas de modification sans trace, ni l'inverse). Toute opération sensible exige un **motif** (5 caractères minimum, validé par schéma partagé côté API). Actions journalisées : `user.suspend|ban|reactivate`, `credits.adjust`, `pack.create|update`, `product.update`, `preset.publish|unpublish`, `settings.update`, `legal.publish`, `admin.promote|demote`, `payment.manual_verify`, `finance.topup|payout`, `generation.hide|unhide`, `report.handle`, `setup.completed`.

### Limites connues

- **Génération et stockage ne sont pas encore développés** : listes de générations, signalements et estimation du solde fournisseur affichent des états vides explicites. Masquer une création ne supprime pas de fichier (pas de stockage).
- Le mode maintenance **s'annonce** (`GET /v1/catalog/status`) mais ne bloque rien encore : le blocage des nouvelles créations s'appliquera à l'ouverture de la génération.
- Les rapports d'abus côté client (« signaler un problème ») ne sont pas encore proposés : seul le traitement côté administration existe.
- L'estimation du solde Higgsfield n'est **pas** le solde réel du compte : recharges saisies moins coût des générations non échouées.

## Setup Wizard (premier administrateur)

Page publique `/installation` de l'application ; API `GET /v1/setup/status`, `POST /v1/setup/check`, `POST /v1/setup/complete`.

### Parcours

1. **Vérification** — saisie du secret d'installation, puis diagnostic : base de données, état de l'installation, e-mails (connexion SMTP testée), fournisseurs, secrets. Aucun nom d'hôte, identifiant ni secret n'est renvoyé.
2. **Administrateur** — prénom, nom, e-mail, mot de passe robuste (12 caractères, 3 types), confirmation, acceptation des CGU/charte. Crée le compte `ADMIN` (e-mail considéré vérifié : son détenteur possède `SETUP_SECRET`).
3. **Configuration** — la même opération initialise les données de base manquantes (devise, packs, produits, presets, paramètres, textes légaux) sans écraser l'existant, et affiche l'état des e-mails et des fournisseurs.
4. **Finalisation** — récapitulatif, session ouverte, redirection vers `/admin`.

### Sécurité

- **Secret** : `SETUP_SECRET` (24 caractères minimum), comparé en temps constant (hachage préalable). Sans lui, l'assistant est indisponible. **À retirer après l'installation.**
- **Atomicité** : tout se fait dans une transaction PostgreSQL protégée par un **verrou consultatif** (`pg_advisory_xact_lock`) ; la table `InstallState` est un singleton (`CHECK (id = 1)`). Six requêtes simultanées → **un seul** administrateur créé, les autres reçoivent `403 SETUP_LOCKED` (testé).
- **Verrou définitif et persistant** : l'état « installé » est en base. Il survit au redémarrage, au redéploiement et à une restauration : si la ligne manque mais qu'un administrateur existe, elle est recréée et l'assistant reste verrouillé (testé). La migration verrouille aussi les installations existantes.
- **Aucune réinitialisation par HTTP** : il n'existe aucune route de remise à zéro. Pour réinstaller, il faut intervenir sur la base elle-même.
- Une fois installé, la page `/installation` n'envoie même plus le formulaire au navigateur.
- D'autres administrateurs se créent ensuite dans « Administrateurs ».

### En développement

`pnpm --filter api db:seed` crée aussi l'administrateur `ADMIN_EMAIL` / `ADMIN_PASSWORD` s'ils sont définis, et verrouille l'assistant. **En production, ne pas définir `ADMIN_PASSWORD`** et utiliser le Setup Wizard.
