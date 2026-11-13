"use client";

import { Loader2, Search, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/admin/ui";
import { DataTableDateFilter, type DateFilterControl } from "./data-table-date-filter";
import { DataTableFacetedFilter, type FilterControl } from "./data-table-faceted-filter";

export interface SearchControl {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  /** Vrai pour une recherche servie par l'API : la frappe n'est transmise qu'après une pause. */
  debounce?: boolean;
}

export interface ToolbarModel {
  search?: SearchControl;
  filters: FilterControl[];
  dateFilter?: DateFilterControl;
  /** Nombre de critères actifs : sert d'indicateur et commande le bouton de réinitialisation. */
  activeCount: number;
  onReset: () => void;
  /** Requête en cours (liste servie par l'API). */
  pending?: boolean;
}

const DEBOUNCE_MS = 400;

/** Champ de recherche : la frappe reste locale et n'est transmise qu'après une pause, pour ne pas requêter par lettre. */
function SearchField({ search, pending }: { search: SearchControl; pending?: boolean }) {
  const [draft, setDraft] = useState(search.value);
  const committed = useRef(search.value);

  // La valeur venue d'ailleurs (réinitialisation, retour arrière) reprend la main sur la frappe en cours.
  useEffect(() => {
    if (search.value !== committed.current) {
      committed.current = search.value;
      setDraft(search.value);
    }
  }, [search.value]);

  useEffect(() => {
    if (!search.debounce || draft === committed.current) return;
    const id = setTimeout(() => {
      committed.current = draft;
      search.onChange(draft);
    }, DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [draft, search]);

  const commitNow = () => {
    committed.current = draft;
    search.onChange(draft);
  };

  return (
    <label className="relative block min-w-52 flex-1 sm:max-w-xs">
      <span className="sr-only">{search.label}</span>
      {pending ? (
        <Loader2 className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden />
      ) : (
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      )}
      <Input
        type="search"
        value={draft}
        placeholder={search.placeholder}
        aria-label={search.label}
        className="h-10 pl-9"
        onChange={(e) => {
          setDraft(e.target.value);
          if (!search.debounce) {
            committed.current = e.target.value;
            search.onChange(e.target.value);
          }
        }}
        onBlur={() => search.debounce && commitNow()}
        onKeyDown={(e) => {
          if (e.key === "Enter" && search.debounce) {
            e.preventDefault();
            commitNow();
          }
        }}
      />
    </label>
  );
}

/**
 * Barre d'outils d'un tableau : recherche, filtres, indicateur des critères actifs, réinitialisation, puis le menu
 * des colonnes aligné à droite. Elle est purement présentationnelle : chaque mode (client ou serveur) fournit son
 * modèle, ce qui évite deux barres d'outils concurrentes.
 */
export function DataTableToolbar({ model, viewOptions }: { model: ToolbarModel; viewOptions?: ReactNode }) {
  const { search, filters, dateFilter, activeCount, onReset, pending } = model;
  if (!search && filters.length === 0 && !dateFilter && !viewOptions) return null;

  return (
    <div className="flex flex-wrap items-end gap-3">
      {search && <SearchField search={search} pending={pending} />}
      {filters.map((filter) => (
        <DataTableFacetedFilter key={filter.key} filter={filter} />
      ))}
      {dateFilter && <DataTableDateFilter filter={dateFilter} />}
      {activeCount > 0 && (
        <div className="flex items-center gap-2 pb-2.5">
          <Pill tone="info">
            {activeCount} critère{activeCount > 1 ? "s" : ""} actif{activeCount > 1 ? "s" : ""}
          </Pill>
          <Button variant="secondary" size="sm" className="h-10" onClick={onReset}>
            <X aria-hidden /> Réinitialiser
          </Button>
        </div>
      )}
      {viewOptions && <div className="ml-auto pb-0.5">{viewOptions}</div>}
    </div>
  );
}
