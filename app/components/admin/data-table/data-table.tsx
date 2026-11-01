"use client";

import {
  useTable,
  type ColumnDef,
  type ColumnVisibilityState,
  type PaginationState,
  type RowData,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Columns3, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { features, type DataTableFeatures } from "./features";

export interface TableFilter<TData> {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  /** Valeur de la ligne comparée à l'option choisie. */
  get: (row: TData) => string;
}

const PAGE_SIZES = [10, 20, 50];

/** Colonnes d'action : épinglées à droite, pour rester accessibles quand le tableau défile sur petit écran. */
const ACTION_COLUMNS = new Set(["actions", "open", "verify"]);

/**
 * Tableau d'administration réutilisable (TanStack Table v9) : recherche, filtres par liste, tri, pagination,
 * colonnes masquables. Pour des listes chargées en entier ; les listes paginées côté serveur gardent leur pager.
 */
export function DataTable<TData extends RowData>({
  columns,
  data,
  caption,
  searchText,
  searchPlaceholder = "Rechercher…",
  filters = [],
  columnLabels = {},
  emptyMessage = "Aucun résultat.",
  minWidth = "44rem",
  initialSorting = [],
  paginate = true,
}: {
  columns: ColumnDef<DataTableFeatures, TData>[];
  data: TData[];
  caption: string;
  /** Texte interrogé par la recherche (sans accent ni casse). Sans lui, pas de champ de recherche. */
  searchText?: (row: TData) => string;
  searchPlaceholder?: string;
  filters?: TableFilter<TData>[];
  /** Libellés du menu « Colonnes » (par identifiant de colonne). Une colonne absente de la liste n'est pas masquable. */
  columnLabels?: Record<string, string>;
  emptyMessage?: string;
  minWidth?: string;
  initialSorting?: SortingState;
  /** Faux : toutes les lignes reçues sont affichées (liste déjà paginée par le serveur, qui garde son pager). */
  paginate?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [visibility, setVisibility] = useState<ColumnVisibilityState>({});
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: PAGE_SIZES[0] });

  const rows = useMemo(() => {
    const q = normalize(query.trim());
    return data.filter((row) => {
      if (searchText && q && !normalize(searchText(row)).includes(q)) return false;
      return filters.every((f) => !selected[f.key] || f.get(row) === selected[f.key]);
    });
  }, [data, query, selected, searchText, filters]);

  const table = useTable({
    features,
    data: rows,
    columns,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setVisibility,
    onPaginationChange: setPagination,
    state: {
      sorting,
      columnVisibility: visibility,
      pagination: paginate ? pagination : { pageIndex: 0, pageSize: Math.max(rows.length, 1) },
    },
  });

  const resetPage = () => setPagination((p) => ({ ...p, pageIndex: 0 }));
  const hideable = table.getAllColumns().filter((c) => c.getCanHide() && columnLabels[c.id]);
  const filtered = query !== "" || Object.values(selected).some(Boolean);
  const pageCount = Math.max(table.getPageCount(), 1);
  const pageIndex = Math.min(pagination.pageIndex, pageCount - 1);
  const first = rows.length === 0 ? 0 : pageIndex * pagination.pageSize + 1;
  const last = Math.min((pageIndex + 1) * pagination.pageSize, rows.length);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        {searchText && (
          <label className="relative block min-w-52 flex-1 sm:max-w-xs">
            <span className="sr-only">Recherche</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              value={query}
              placeholder={searchPlaceholder}
              className="pl-9"
              onChange={(e) => {
                setQuery(e.target.value);
                resetPage();
              }}
            />
          </label>
        )}
        {filters.map((f) => (
          <label key={f.key} className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            {f.label}
            <select
              value={selected[f.key] ?? ""}
              onChange={(e) => {
                setSelected((s) => ({ ...s, [f.key]: e.target.value }));
                resetPage();
              }}
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground"
            >
              <option value="">Tous</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ))}
        {filtered && (
          <Button
            variant="ghost"
            onClick={() => {
              setQuery("");
              setSelected({});
              resetPage();
            }}
          >
            Réinitialiser
          </Button>
        )}
        {hideable.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="ml-auto">
                <Columns3 aria-hidden /> Colonnes
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Colonnes affichées</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {hideable.map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.id}
                  checked={c.getIsVisible()}
                  onCheckedChange={(v) => c.toggleVisibility(!!v)}
                  onSelect={(e) => e.preventDefault()}
                >
                  {columnLabels[c.id]}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="relative overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-left text-sm" style={{ minWidth }}>
          <caption className="sr-only">{caption}</caption>
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header, i) => (
                  <th
                    key={header.id}
                    scope="col"
                    aria-sort={ariaSort(header.column.getIsSorted())}
                    className={`border-b bg-muted px-4 py-3 font-semibold ${stickyClass(header.column.id, i)}`}
                  >
                    {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="group/row hover:bg-muted/40">
                  {row.getVisibleCells().map((cell, i) => (
                    <td key={cell.id} className={`border-b px-4 py-3 align-top group-last/row:border-b-0 ${stickyClass(cell.column.id, i, true)}`}>
                      <table.FlexRender cell={cell} />
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="h-24 px-4 text-center text-muted-foreground">
                  {filtered ? "Aucun résultat pour ces critères." : emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {paginate && (
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <p aria-live="polite">
          {rows.length === 0 ? "0 résultat" : `${first}–${last} sur ${rows.length}`}
          {filtered && rows.length !== data.length && ` (${data.length} au total)`}
        </p>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2">
            Lignes
            <select
              value={pagination.pageSize}
              onChange={(e) => setPagination({ pageIndex: 0, pageSize: Number(e.target.value) })}
              className="h-10 rounded-lg border border-input bg-background px-2 text-foreground"
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <span>
            Page {pageIndex + 1} / {pageCount}
          </span>
          <div className="flex gap-1">
            <Button variant="outline" size="icon" className="size-10" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} aria-label="Page précédente">
              <ChevronLeft aria-hidden />
            </Button>
            <Button variant="outline" size="icon" className="size-10" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label="Page suivante">
              <ChevronRight aria-hidden />
            </Button>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}

/** Première colonne (identité de la ligne) épinglée à gauche, colonne d'actions à droite : sur mobile, rien ne disparaît. */
function stickyClass(columnId: string, index: number, body = false) {
  const bg = body ? "bg-card group-hover/row:bg-muted" : "";
  // Colonne d'actions : alignée à droite et épinglée, sans filet vertical (les filets horizontaux structurent les lignes).
  if (ACTION_COLUMNS.has(columnId)) return `sticky right-0 z-[1] w-24 text-right ${bg}`;
  if (index === 0) return `sticky left-0 z-[1] ${bg}`;
  return "";
}

interface SortableColumn {
  getIsSorted: () => false | "asc" | "desc";
  toggleSorting: (desc?: boolean, multi?: boolean) => void;
  clearSorting: () => void;
}

/** En-tête de colonne triable (clic : croissant, décroissant, puis aucun tri). */
export function SortableHeader({ column, title }: { column: SortableColumn; title: string }) {
  const dir = column.getIsSorted();
  const Icon = dir === "asc" ? ArrowUp : dir === "desc" ? ArrowDown : ArrowUpDown;
  return (
    <button
      type="button"
      className="-mx-1 -my-2 inline-flex min-h-9 items-center gap-1.5 rounded px-1 font-semibold hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"
      onClick={() => (dir === "desc" ? column.clearSorting() : column.toggleSorting(dir === "asc"))}
    >
      {title}
      <Icon className="size-3.5" aria-hidden />
    </button>
  );
}

function ariaSort(dir: false | "asc" | "desc") {
  return dir === "asc" ? "ascending" : dir === "desc" ? "descending" : undefined;
}

function normalize(s: string) {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}
