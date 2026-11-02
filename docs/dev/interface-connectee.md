# Interface connectée (espace client et administration)

Les deux espaces partagent la même coque technique, construite sur le composant shadcn **sidebar-04** (barre latérale flottante), mais ont chacun leur identité et leur navigation (voir [administration.md](administration.md)).

| Élément | Comportement |
|---|---|
| Barre latérale | Flottante, **repliable en rail d'icônes** sur ordinateur (bouton dans l'en-tête, ou Ctrl/⌘ + B). L'état est mémorisé dans un cookie (`sidebar_state`) lu côté serveur : pas de « saut » au chargement. Infobulles sur les icônes quand elle est repliée. |
| Mobile | La barre devient un **tiroir** qui se referme après chaque navigation. Le bouton du menu mesure 40 px. |
| Barre du haut | Bouton du menu, **fil d'Ariane**, solde en crédits et équivalent FCFA (client) ou badge « Administrateur », puis **bouton de thème** et **menu du compte `UserNav`** (avatar, nom, e-mail, profil, déconnexion : l'unique endroit de la déconnexion). Un seul composant pour les deux espaces. |
| Pied de barre | Lien « Voir le site ». |
| Accessibilité | Lien « Aller au contenu » au clavier, page courante signalée (`aria-current`), tous les textes en français. |

## Où modifier quoi

| Besoin | Fichier |
|---|---|
| Ajouter une page au menu | `app/lib/nav.ts` (`USER_NAV` ou `ADMIN_NAV`) |
| Fil d'Ariane d'une page à identifiant | `app/lib/nav.ts` (`DETAIL_PAGES`) |
| Structure de la coque | `app/components/shell/` (`app-shell`, `app-sidebar`, `shell-header`) |
| Menu du compte (profil, déconnexion) | `app/components/shell/user-nav.tsx` (menu Radix `components/ui/dropdown-menu.tsx`) |
| Dialogue d'action d'administration (motif obligatoire, appel API) | `app/components/admin/action-dialog.tsx` |
| Tableaux, filtres, pagination, pastilles d'état | `app/components/admin/ui.tsx` |

La navigation est un module partagé (et non des props) parce que les icônes sont des composants : elles ne peuvent pas traverser la frontière serveur → client.

## Administration

Sept rubriques (Pilotage, Clients, Générations et modération, Offre, Finances, Configuration, Audit), toutes développées : voir [administration.md](administration.md). Les chiffres viennent de la base ; en l'absence de données (par exemple aucune génération), la page l'indique explicitement. L'accès à `/admin/*` exige le rôle ADMIN (vérifié côté serveur Next **et** par l'API).

## Pièges rencontrés (à ne pas reproduire)

- **`sr-only` dans un tableau défilant.** Un texte réservé aux lecteurs d'écran est positionné de façon absolue : sans ancêtre `relative`, il se place hors de l'écran et élargit toute la page (288 px de débordement sur mobile). Le conteneur `overflow-x-auto` doit être `relative`.
- **Composants shadcn générés.** Leur installation peut écraser les composants personnalisés (`button`, `input`) : sauvegarder avant, restaurer après. Les textes anglais générés (« Toggle Sidebar », « Close »…) ont été traduits.
- **Page courante du fil d'Ariane.** Le composant la rend avec `role="link" aria-disabled` : en test, cibler le lien du **menu latéral**, pas tous les liens du même nom.
