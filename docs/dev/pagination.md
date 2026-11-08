# Pagination côté serveur

Les listes qui peuvent grossir sont paginées **par le serveur** : l'API ne lit que la page demandée, l'interface n'a jamais toute la table.

## Contrat

Requête : `?page=1&pageSize=20` (défaut 20 ; l'interface propose 10, 20, 50, 100 ; le serveur refuse plus de 100 ou moins de 1).
Filtres : `q`, `status`, `from`, `to`, `provider`, `country`, `method`, `userId`… selon la liste. Tri : `sort=<colonne>&dir=asc|desc`
(liste blanche par liste, sinon ignoré).

Réponse (type `Page<T>` de `@yamboka/shared`) :

```json
{ "items": [], "total": 543, "page": 2, "pageSize": 20, "totalPages": 28, "hasNextPage": true, "hasPreviousPage": true }
```

`items` joue le rôle de `data` et les champs de méta sont à plat (convention déjà en place dans le projet). Une `page` au-delà de la dernière
est ramenée à la dernière page valide (`clampPage`) : après une suppression, l'utilisateur n'arrive jamais sur une page vide.

## Méthode

Pagination par numéro de page (`skip` / `take` Prisma + `count`) : l'interface affiche le total, le nombre de pages et des numéros
accessibles, ce qu'un curseur ne permet pas. Tris **déterministes** : la colonne choisie puis l'identifiant (`orderBy` dans
`api/src/common/sort.ts`), pour qu'aucune ligne ne soit dupliquée ou oubliée entre deux pages. Les requêtes utilisent `select` : seuls
les champs affichés sont lus. Les notifications gardent un curseur (flux « Voir plus », sans numéros de page).

## Listes concernées

| Route | Endpoint | Filtres / tri |
|---|---|---|
| `/admin/utilisateurs` | `GET /admin/users` | recherche, statut, rôle ; tri date, e-mail, statut |
| `/admin/signalements` | `GET /admin/reports` | statut |
| `/admin/generations` | `GET /admin/generations` | statut, e-mail, période ; tri date, coût, statut |
| `/admin/packs` | `GET /admin/packs` | nom, actif / inactif ; synthèse sur tous les packs |
| `/admin/paiements` | `GET /admin/payments` | statut, fournisseur, pays, moyen, utilisateur, période ; tri date, montant, statut |
| `/admin/audit` | `GET /admin/audit` | recherche, période |
| `/admin/pays` | `GET /admin/countries` | nom / ISO / devise, statut |
| (filtres paiements) | `GET /admin/payment-methods` | nom, type |
| `/app/creations` | `GET /creations` | statut ; **toujours** limité à l'utilisateur connecté |
| `/app/historique` | `GET /credits/ledger`, `GET /payments` | famille d'opérations, période ; limité à l'utilisateur connecté |

## Interface

`app/components/pager.tsx` : ensemble de liens (taille de page, précédent / suivant, numéros avec « … »). Chaque lien conserve les filtres
et le tri, fonctionne sans JavaScript, retourne à la page 1 quand on change de taille. Les filtres sont des formulaires GET : un nouveau
filtre repart de la première page. Tri serveur : `ServerSortHeader` (en-tête qui change `sort` / `dir` dans l'adresse). Les pages d'administration sont
des composants serveur qui lisent `searchParams` ; la galerie des créations utilise TanStack Query avec `keepPreviousData` et l'adresse comme état.

## Index

`Payment` : `(createdAt, id)`, `(gateway, createdAt)`, `(country, createdAt)`, `(methodCode)` ; `Generation` : `(createdAt, id)`. Les autres listes
s'appuient sur les index existants (`User.createdAt`, `AuditLog.createdAt`, `Report(status, createdAt)`, `CreditLedger(userId, createdAt)`).

## Vérification

`api/test/pagination-volume.e2e-spec.ts` injecte plusieurs milliers de lignes, parcourt chaque liste page par page (aucun doublon, aucun
oubli, méta cohérente), contrôle filtres, tri, page hors limites, droits et isolement des données d'un client.
