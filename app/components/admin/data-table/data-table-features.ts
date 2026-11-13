import {
  columnFilteringFeature,
  columnVisibilityFeature,
  constructFilterFn,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_equalsString,
  filterFn_includesString,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
  type ReactTable,
  type RowData,
} from "@tanstack/react-table";

/** Sans accent ni casse : « congo » trouve « Congo-Brazzaville », « reussi » trouve « Réussi ». */
const fold = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** Variante d'`includesString` insensible aux accents : seules les résolutions de valeur changent. */
const filterFn_includesText = constructFilterFn({
  ...filterFn_includesString,
  resolveFilterValue: fold,
  resolveDataValue: fold,
});

/**
 * Jeu de fonctionnalités UNIQUE et stable de tous les tableaux d'administration (TanStack Table v9).
 * Il est défini une seule fois, hors rendu : les modèles de lignes ne sont jamais invalidés inutilement.
 *
 * Il ne contient que ce dont les tableaux du produit se servent réellement. Les listes paginées par l'API
 * déclarent `manualFiltering`, `manualSorting` et `manualPagination` : les étapes clientes sont alors
 * court-circuitées, sans qu'il faille un second jeu de fonctionnalités.
 *
 * Volontairement absent : `columnFacetingFeature` (les décomptes par valeur ne sont pas calculables sur une
 * liste paginée par le serveur), ainsi que la sélection de lignes, faute d'action groupée dans ce produit.
 */
export const features = tableFeatures({
  columnVisibilityFeature,
  columnFilteringFeature,
  globalFilteringFeature,
  rowSortingFeature,
  rowPaginationFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  filterFns: { includesText: filterFn_includesText, equalsString: filterFn_equalsString },
  sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic, datetime: sortFn_datetime, text: sortFn_text },
});

export type DataTableFeatures = typeof features;

/** Table React d'administration : évite de réécrire les deux paramètres de type dans chaque sous-composant. */
export type AdminTable<TData extends RowData> = ReactTable<DataTableFeatures, TData>;

/** Recherche globale : `includesText` sur toutes les colonnes porteuses de données. */
export const GLOBAL_FILTER_FN = "includesText" as const;

/** Les colonnes d'actions et d'ouverture ne portent aucune donnée : les exclure de la recherche globale. */
export const NON_DATA_COLUMNS = new Set(["actions", "open", "verify", "select"]);

export function canGlobalFilter(column: { id: string }): boolean {
  return !NON_DATA_COLUMNS.has(column.id);
}

/** Pagination « tout afficher » : les sous-tableaux d'une fiche montrent la liste entière. */
export const ALL_ROWS = 10_000;
