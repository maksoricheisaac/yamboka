# Audit UX/UI Yamboka — état au 1er novembre 2026

## Méthode et limites
- **Extension Chrome : non accessible** depuis cet environnement (aucun outil `mcp__claude-in-chrome__*` exposé). L'audit a été fait avec **Playwright + Chromium** (captures, mesure des débordements, interactions réelles).
- Pile de test isolée (API `yamboka_e2e` sur 4101, app en `next dev` sur 3101) : aucune donnée de développement touchée, aucun paiement réel.
- Non couvert : espace **client** audité uniquement par les tests e2e existants (pas de revue visuelle page par page) ; modes sombre et lecteurs d'écran non testés.

## Routes examinées
- Site public (12 pages + 404) : `/`, fonctionnalités, comment-ça-marche, tarifs, galerie, cas-utilisation, faq, a-propos, contact, 3 pages légales — 7 largeurs (360 → 1440) : **aucun débordement horizontal**.
- Admin (14 pages) à 1280 et 390 px : tableau de bord, utilisateurs (+ fiche), paiements, packs, produits, presets, générations, finances, signalements, audit, administrateurs, paramètres, textes légaux, profil.
- Client : `/app`, crédits, achats, profil (tests e2e uniquement).

## Problèmes et statut
| # | P | Type | Constat | Statut |
|---|---|---|---|---|
| 1 | P2 | Visuel/UX | Sélecteur de période : 7 contrôles visibles (5 raccourcis, plage, « personnalisée ») | **Corrigé** : un bouton affichant la période, menu à raccourcis + calendrier + « Appliquer » (`period-picker.tsx`) |
| 2 | P2 | UX | Colonne Actions des packs/produits/presets : 2-4 boutons par ligne, lignes irrégulières | **Corrigé** : menu ⋮ (`row-actions.tsx`), destructif séparé et en rouge, actions impossibles absentes |
| 3 | P1 | A11y | Après fermeture d'un dialogue ouvert depuis un menu, le focus était perdu (détecté par test) | **Corrigé** |
| 4 | P2 | UX | Aucun retour visible après une action admin réussie | **Corrigé** : toast (`ui/toaster.tsx`) |
| 5 | P2 | Visuel | Bordure basse supprimée sur la dernière *cellule* de chaque ligne (`last:border-b-0`) au lieu de la dernière ligne | **Corrigé** (`DataTable`, `ui.tsx`) |
| 6 | P1 | Responsive | Sur mobile, le nom de la ligne sortait de l'écran quand le tableau défilait | **Corrigé** : 1re colonne épinglée à gauche, actions à droite |
| 7 | P2 | A11y | Boutons « Masquer »/« Traiter »/« Retirer l'accès » identiques pour lecteur d'écran ; cibles tactiles de 28 px (filtres, pagination) | **Corrigé** (`triggerLabel`, cibles 40 px sur mobile) |
| 8 | P2 | Responsive | Badge « Administrateur » tronquait le fil d'Ariane sur mobile | **Corrigé** (libellé masqué visuellement < 640 px) |
| 9 | P3 | Visuel | Pas de survol de ligne dans les tableaux | **Corrigé** |
| 10 | P3 | Dev | Erreurs console en `next dev` (« uncached data… instant validation », badge « 1 Insight ») | **Non traité** : préexistant, propre au mode dev (cacheComponents) |
| 11 | P2 | UX | Actions à bouton unique (Masquer, Traiter, Retirer l'accès, Vérifier) | **Conservées volontairement** visibles : un menu à un seul item ajouterait un clic |
| 12 | P2 | UX | Tableaux de **cartes** sur mobile (au lieu du défilement) ; sélecteur de période du filtre Paiements/Audit (`FilterDateRange`) resté l'ancien composant | **Restant à traiter** |
| 13 | P3 | Visuel | Revue visuelle de l'espace client, mode sombre, régression visuelle par captures | **Restant** |

## Tests
- Nouveau `tests/e2e/app-admin-ux.spec.ts` (période, menu ⋮, notification) ; `app-admin.spec.ts` adapté (publication via le menu, période au calendrier — l'ancienne vérification « début > fin » n'a plus lieu d'être, le calendrier l'empêche).
- **Suite e2e complète, vraie config (`pnpm test:e2e`, builds de production)** : 198 réussis, 6 échecs, 2 ignorés. Causes des 6 échecs :
  - *Test de période (×2)* : **erreur de ma part** dans l'expression régulière (`` altéré à l'écriture). Corrigé ; le test passe ensuite.
  - *Barre du haut / barre latérale (×2)* : l'inscription restait sur `/inscription`. Ils passent à la relance ; cause de l'échec initial non établie (charge ou limitation de débit supposées, **non vérifié**).
  - *« ajuster les crédits » et « suspendre un client » (×2 en suite complète)* : **non résolu**. Le bouton reste sur « Envoi… » et la requête POST de l'admin n'obtient jamais de réponse (absente du journal réseau de la trace). Ils **passent seuls** (desktop, 2/2) et **échouent à 4/4 quand les projets desktop et mobile les exécutent en même temps**. Je n'ai pas pu établir si c'est préexistant : mes modifications n'agissent que côté navigateur, mais je n'ai pas de base de comparaison (pas de commit propre à rejouer) ni les journaux de l'API.
- `tsc --noEmit` : OK. ESLint sur les fichiers modifiés : OK (le lint global du dossier `app` échoue sur des dossiers de build générés, préexistant). `next build` de production : OK.


---

## Phase 2 — revue dans Chrome réel + Playwright (1er novembre 2026)
Cette fois l'extension Chrome était accessible : parcours dans le vrai navigateur (fenêtre 862 px, thème sombre), en complément du balayage Playwright (14 pages admin × 4 largeurs × thèmes clair/sombre ; espace client 862 px sombre et 360 px clair).

| # | P | Constat | Statut |
|---|---|---|---|
| 14 | P2 | Filet vertical (`border-l`) devant la colonne d'actions, ajouté par ma phase 1 | **Corrigé à la source** (`data-table.tsx`) ; vérifié dans Chrome et par test |
| 15 | P2 | En-tête de la colonne d'actions invisible ou libellé variable (« Fiche », « Vérifier », « Traiter »…) | **Corrigé** : « Actions », visible, aligné à droite, dans les 5 DataTables et les 3 tableaux simples |
| 16 | P1 | Barre latérale fixe dès 768 px : un tiers de l'écran à 862 px, colonnes cachées (« Insc… ») | **Corrigé** : tiroir sous 1024 px (`use-mobile.ts`, `sidebar.tsx`) |
| 17 | P1 | Messages de validation anglais bruts (« Invalid input: expected number, received undefined ») dans les dialogues admin et le paiement | **Corrigé** : normalisation dans `api-client.ts` + valeur initiale du téléphone (`purchase-form.tsx`) |
| 18 | P2 | Focus perdu à la fermeture de l'aperçu de la galerie publique (retombait sur `BODY`) | **Corrigé** (`gallery.tsx`), vérifié dans Chrome |
| 19 | P3 | Dates ISO brutes dans la synthèse financière | **Corrigé** |
| 20 | P2 | Page Paramètres : formulaire de 1 800 px, bouton d'enregistrement désactivé sans explication | **Corrigé** : barre d'enregistrement épinglée dès qu'il y a une modification + phrase explicative |
| 21 | P3 | Boutons de tri des en-têtes de 20 px de haut | **Corrigé** (zone de 36 px) |

Constats sans correction : période par défaut de la synthèse financière (2 oct.–31 oct.) différente de celle du tableau de bord (3 oct.–1 nov.) — à trancher côté métier ; erreurs console de `next dev` (déjà notées, #10) ; cases à cocher des paramètres de 20 px.

### Tests de cette phase
- Ajoutés dans `app-admin-ux.spec.ts` : colonne Actions (en-tête, absence de filet, menu dans la fenêtre), erreurs en français (dialogue admin et achat) ; dans `public-site.spec.ts` : focus rendu à la vignette.
- `pnpm test:e2e` (builds de production) : **204 réussis, 6 échecs, 2 ignorés**. Les 6 échecs sont tous sur le projet *desktop* et tous à l'étape d'inscription/validation du code (aide commune des tests), y compris dans `app-auth` que je n'ai pas modifié. **Relancés seuls (1 worker) : 6/6 réussis.** Cause supposée : lenteur sous charge (4 workers + 3 serveurs) ; **non prouvée**. Le projet mobile 360 px passe entièrement.
- `tsc` (app et web) et ESLint sur les dossiers modifiés : OK.

### Hauteurs des contrôles (retour utilisateur)
Constat : boutons `sm` à 28 px, champs à 36 / 40 / 44 px, bouton de thème à 36 px contre 40 px pour le menu du compte. **Règle fixée** : 40 px pour tous les contrôles de barre d'outils et de formulaire (`Input`, `PhoneInput`, listes, boutons par défaut, `icon-lg`), 36 px pour les boutons dans les lignes de tableau (`sm`). Mesuré par script sur les 14 pages admin à 1280 px : plus aucune rangée de hauteurs mélangées. Non mesuré : espace client et pages d'authentification (vérifiés seulement par les tests e2e, qui ne contrôlent pas les hauteurs).
Tests : 153 réussis / 5 échecs sur ma pile de dev (2 : délai de renvoi du code non réglé sur ma pile ; 3 : passent seuls, lenteur sous charge non prouvée).

### Paramètres en onglets et code OTP
- `admin/parametres` : 5 onglets (Général, Rentabilité, Génération, Fichiers, Sécurité) avec `Tabs` en variante `line`. Un seul formulaire, un seul motif, un seul bouton d'enregistrement ; un compteur sur l'onglet signale les modifications non enregistrées. Le test d'envoi d'e-mail est dans « Général ».
- `components/ui/tabs.tsx` (généré par shadcn pour Base UI) utilisait `data-active:` / `data-horizontal:` : sous Radix ces attributs n'existent pas (le soulignement de l'onglet actif ne s'affichait jamais). Corrigé en `data-[state=active]:` / `data-[orientation=…]:`.
- Code de vérification : `InputOTP` en cases 2-2-2 avec séparateurs (login et vérification d'e-mail). Longueur et durée viennent de l'API (`EMAIL_OTP_LENGTH`, `EMAIL_OTP_TTL_MINUTES`) et non plus d'un texte figé.
- Tests : `app-admin-ux` (onglets, compteur, motif, clavier ; OTP). Sur ma pile de dev : 106 réussis (bureau + 360 px), 0 échec après correction de mon test.
- Dépendance ajoutée : `input-otp` (via shadcn).
