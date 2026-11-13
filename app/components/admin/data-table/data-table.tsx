"use client";

import {
  useTable,
  type ColumnDef,
  type ColumnFiltersState,
  type ColumnVisibilityState,
  type PaginationState,
  type RowData,
  type SortingState,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { ALL_ROWS, canGlobalFilter, features, GLOBAL_FILTER_FN, type DataTableFeatures } from "./data-table-features";
import { DataTablePagination } from "./data-table-pagination";
import { DataTableShell } from "./data-table-shell";
import { DataTableToolbar } from "./data-table-toolbar";
import { DataTableViewOptions } from "./data-table-view-options";

/** Filtre d'un tableau client : la valeur choisie est comparée à la valeur de la colonne (`filterFn: "equalsString"`). */
export interface ClientFilterDef {
  columnId: string;
  label: string;
  options: { value: string; label: string }[];
  all?: string;
}

/**
 * Tableau dont TOUTES les lignes sont déjà chargées : recherche, filtres, tri et pagination sont calculés dans le
 * navigateur par TanStack Table v9 (modèles filtré, trié, paginé).
 *
 * Pour une liste servie page par page par l'API, utiliser `ServerDataTable` : le tri et la recherche doivent alors
 * porter sur la liste entière, ce qu'un traitement client ne peut pas faire.
 */
export function DataTable<TData extends RowData>({
  caption,
  columns,
  data,
  search,
  filters = [],
  columnLabels = {},
  emptyMessage = "Aucun résultat.",
  minWidth = "44rem",
  initialSorting = [],
  paginate = true,
  pageSize = 10,
}: {
  caption: string;
  columns: ColumnDef<DataTableFeatures, TData>[];
  data: TData[];
  /** Recherche globale sur les colonnes porteuses de données. Sans elle, pas de champ de recherche. */
  search?: { label: string; placeholder: string };
  filters?: ClientFilterDef[];
  /** Libellés du menu « Colonnes ». Une colonne absente de cette liste n'est pas masquable. */
  columnLabels?: Record<string, string>;
  emptyMessage?: string;
  minWidth?: string;
  initialSorting?: SortingState;
  /** Faux : toutes les lignes sont affichées et le pied n'indique que le décompte. */
  paginate?: boolean;
  pageSize?: number;
}) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({});
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize });

  const effectivePagination = useMemo<PaginationState>(
    () => (paginate ? pagination : { pageIndex: 0, pageSize: ALL_ROWS }),
    [paginate, pagination],
  );

  const table = useTable({
    features,
    data,
    columns,
    globalFilterFn: GLOBAL_FILTER_FN,
    getColumnCanGlobalFilter: canGlobalFilter,
    state: { sorting, columnVisibility, globalFilter, columnFilters, pagination: effectivePagination },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: setPagination,
  });

  const filterValue = (columnId: string) => {
    const found = table.state.columnFilters.find((f) => f.id === columnId);
    return typeof found?.value === "string" ? found.value : undefined;
  };

  const activeCount = (table.state.globalFilter ? 1 : 0) + table.state.columnFilters.length;
  const filteredCount = table.getFilteredRowModel().rows.length;

  const hasHideableColumns = Object.keys(columnLabels).length > 0;

  return (
    <div className="space-y-3">
      <DataTableToolbar
        viewOptions={hasHideableColumns ? <DataTableViewOptions table={table} labels={columnLabels} /> : undefined}
        model={{
          search: search && {
            ...search,
            value: String(table.state.globalFilter ?? ""),
            onChange: (value) => {
              table.setGlobalFilter(value);
              table.setPageIndex(0);
            },
          },
          filters: filters.map((f) => ({
            key: f.columnId,
            label: f.label,
            options: f.options,
            all: f.all,
            value: filterValue(f.columnId),
            onChange: (value) => {
              table.getColumn(f.columnId)?.setFilterValue(value);
              table.setPageIndex(0);
            },
          })),
          activeCount,
          onReset: () => {
            table.resetGlobalFilter();
            table.resetColumnFilters();
            table.setPageIndex(0);
          },
        }}
      />

      <DataTableShell
        table={table}
        caption={caption}
        minWidth={minWidth}
        empty={activeCount > 0 ? "Aucun résultat pour ces critères." : emptyMessage}
      />

      <DataTablePagination
        model={{
          total: filteredCount,
          unfilteredTotal: data.length,
          pageIndex: table.state.pagination.pageIndex,
          pageCount: table.getPageCount(),
          pageSize: table.state.pagination.pageSize,
          paginated: paginate,
          onPageChange: (index) => table.setPageIndex(index),
          onPageSizeChange: (size) => setPagination({ pageIndex: 0, pageSize: size }),
        }}
      />
    </div>
  );
}
