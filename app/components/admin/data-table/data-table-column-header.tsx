"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

/**
 * Ce dont l'en-tête a besoin de la colonne. Une interface structurelle évite de propager les deux paramètres de
 * type de TanStack dans chaque définition de colonne.
 */
interface SortableColumn {
  getCanSort: () => boolean;
  getIsSorted: () => false | "asc" | "desc";
  toggleSorting: (desc?: boolean, multi?: boolean) => void;
  clearSorting: () => void;
}

/**
 * En-tête de colonne : clic croissant, décroissant, puis retour au tri par défaut.
 *
 * Le même composant sert aux deux modes. Il ne connaît que l'API du tableau : c'est `onSortingChange` qui décide
 * où va l'état. Tableau client : l'état de tri du tableau. Liste paginée par l'API : l'adresse, et le tri porte
 * alors sur la liste entière. Une colonne que l'API ne sait pas trier déclare `enableSorting: false` et s'affiche
 * en texte simple.
 */
export function DataTableColumnHeader({ column, title }: { column: SortableColumn; title: string }) {
  if (!column.getCanSort()) return <>{title}</>;
  const dir = column.getIsSorted();
  const Icon = dir === "asc" ? ArrowUp : dir === "desc" ? ArrowDown : ArrowUpDown;
  return (
    <button
      type="button"
      className="-mx-1 -my-2 inline-flex min-h-9 items-center gap-1.5 rounded px-1 font-medium hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"
      onClick={() => (dir === "desc" ? column.clearSorting() : column.toggleSorting(dir === "asc"))}
    >
      {title}
      <Icon className={`size-3.5 ${dir ? "text-primary" : "opacity-60"}`} aria-hidden />
    </button>
  );
}

/** Valeur `aria-sort` portée par la cellule d'en-tête. */
export function ariaSort(dir: false | "asc" | "desc") {
  return dir === "asc" ? "ascending" : dir === "desc" ? "descending" : undefined;
}
