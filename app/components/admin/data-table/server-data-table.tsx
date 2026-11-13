"use client";

import { useTable, type ColumnDef, type ColumnVisibilityState, type RowData, type SortingState } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { features, type DataTableFeatures } from "./data-table-features";
import { DataTablePagination } from "./data-table-pagination";
import { DataTableShell } from "./data-table-shell";
import { DataTableToolbar } from "./data-table-toolbar";
import { DataTableViewOptions } from "./data-table-view-options";
import { useUrlTableState } from "./use-url-table-state";

/** Métadonnées de pagination renvoyées par l'API (convention du projet : `items` + méta). */
export interface ServerPageMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Filtre servi par l'API : la valeur choisie part dans le paramètre d'adresse `param`. */
export interface ServerFilterDef {
  param: string;
  label: string;
  options: { value: string; label: string }[];
  all?: string;
}

/**
 * Liste paginée PAR L'API. L'adresse est la source unique de vérité des critères : recherche (`q`), filtres,
 * période (`from`/`to`), tri (`sort`/`dir`), page et taille de page. Un rafraîchissement ou un lien partagé
 * retrouve exactement la même vue.
 *
 * Côté TanStack, les trois étapes de traitement sont déclarées manuelles : `data` est DÉJÀ la page voulue, déjà
 * filtrée et déjà triée par la base. Le tableau ne refait rien sur place — un tri client ne verrait que la page
 * affichée et donnerait un ordre faux. `rowCount` apporte le total réel pour le pied de tableau.
 *
 * Les rappels `onSortingChange` et `onPaginationChange` écrivent dans l'adresse : l'en-tête de colonne et le pied
 * de tableau restent les mêmes composants que pour un tableau client, et c'est le propriétaire de l'état qui change.
 */
export function ServerDataTable<TData extends RowData>({
  caption,
  columns,
  items,
  meta,
  search,
  filters = [],
  dateFilter,
  columnLabels = {},
  emptyMessage = "Aucun résultat.",
  minWidth = "44rem",
}: {
  caption: string;
  columns: ColumnDef<DataTableFeatures, TData>[];
  items: TData[];
  meta: ServerPageMeta;
  /** Recherche servie par l'API (paramètre `q`), transmise après une courte pause de frappe. */
  search?: { label: string; placeholder: string };
  filters?: ServerFilterDef[];
  /** Filtre de période sur `from`/`to`. */
  dateFilter?: { label: string };
  columnLabels?: Record<string, string>;
  emptyMessage?: string;
  minWidth?: string;
}) {
  const { pending, patch, get } = useUrlTableState();
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({});

  const sortParam = get("sort");
  const sorting = useMemo<SortingState>(
    () => (sortParam ? [{ id: sortParam, desc: get("dir") === "desc" }] : []),
    [sortParam, get],
  );
  const pagination = useMemo(() => ({ pageIndex: meta.page - 1, pageSize: meta.pageSize }), [meta.page, meta.pageSize]);

  const table = useTable({
    features,
    data: items,
    columns,
    manualFiltering: true,
    manualSorting: true,
    manualPagination: true,
    rowCount: meta.total,
    state: { sorting, columnVisibility, pagination },
    onColumnVisibilityChange: setColumnVisibility,
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      const first = next[0];
      patch({ sort: first?.id, dir: first ? (first.desc ? "desc" : "asc") : undefined });
    },
    onPaginationChange: (updater) => {
      const next = typeof updater === "function" ? updater(pagination) : updater;
      const sizeChanged = next.pageSize !== pagination.pageSize;
      patch(
        {
          pageSize: next.pageSize === DEFAULT_PAGE_SIZE ? undefined : String(next.pageSize),
          // Changer la taille de page ramène au début : la page 7 d'un découpage n'a rien à voir avec la page 7 d'un autre.
          page: sizeChanged || next.pageIndex === 0 ? undefined : String(next.pageIndex + 1),
        },
        { keepPage: true },
      );
    },
  });

  const criteria = [search ? get("q") : undefined, ...filters.map((f) => get(f.param)), dateFilter ? (get("from") ?? get("to")) : undefined];
  const activeCount = criteria.filter(Boolean).length;

  const hasHideableColumns = Object.keys(columnLabels).length > 0;

  return (
    <div className="space-y-3">
      <DataTableToolbar
        viewOptions={hasHideableColumns ? <DataTableViewOptions table={table} labels={columnLabels} /> : undefined}
        model={{
          pending,
          search: search && { ...search, value: get("q") ?? "", debounce: true, onChange: (value) => patch({ q: value || undefined }) },
          filters: filters.map((f) => ({
            key: f.param,
            label: f.label,
            options: f.options,
            all: f.all,
            value: get(f.param),
            onChange: (value) => patch({ [f.param]: value }),
          })),
          dateFilter: dateFilter && {
            ...dateFilter,
            from: get("from"),
            to: get("to"),
            onChange: (from, to) => patch({ from, to }),
          },
          activeCount,
          onReset: () =>
            patch({
              q: undefined,
              from: undefined,
              to: undefined,
              ...Object.fromEntries(filters.map((f) => [f.param, undefined])),
            }),
        }}
      />

      {/* Pendant la requête, le tableau s'efface légèrement : on voit qu'il se recharge sans que la page saute. */}
      <div aria-busy={pending || undefined} className={pending ? "opacity-60 transition-opacity" : "transition-opacity"}>
        <DataTableShell
          table={table}
          caption={caption}
          minWidth={minWidth}
          empty={activeCount > 0 ? "Aucun résultat pour ces critères." : emptyMessage}
        />
      </div>

      <DataTablePagination
        model={{
          total: meta.total,
          pageIndex: pagination.pageIndex,
          pageCount: meta.totalPages,
          pageSize: meta.pageSize,
          paginated: true,
          pending,
          onPageChange: (index) => table.setPageIndex(index),
          onPageSizeChange: (size) => table.setPageSize(size),
        }}
      />
    </div>
  );
}
