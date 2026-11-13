"use client";

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PAGE_SIZES } from "@/lib/pagination";

export interface PaginationModel {
  /** Nombre de résultats correspondant aux critères (toute la liste, pas la page). */
  total: number;
  /** Page affichée, indexée à partir de 0. */
  pageIndex: number;
  pageCount: number;
  pageSize: number;
  onPageChange: (pageIndex: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  /** Faux : la liste entière est affichée, le pied n'indique que le décompte. */
  paginated: boolean;
  /** Nombre de résultats sans aucun critère, pour annoncer « sur N au total ». */
  unfilteredTotal?: number;
  pending?: boolean;
}

/**
 * Pied de tableau : décompte, lignes par page, page courante sur total, et navigation première / précédente /
 * suivante / dernière. Les boutons sont désactivés dès que la navigation n'a pas de sens.
 */
export function DataTablePagination({ model }: { model: PaginationModel }) {
  const { total, pageIndex, pageCount, pageSize, onPageChange, onPageSizeChange, paginated, unfilteredTotal, pending } = model;
  const pages = Math.max(pageCount, 1);
  const page = Math.min(pageIndex, pages - 1);
  const first = total === 0 ? 0 : page * pageSize + 1;
  const last = Math.min((page + 1) * pageSize, total);
  const canPrevious = page > 0 && total > 0;
  const canNext = page < pages - 1;

  const count = (
    <p className="text-muted-foreground" aria-live="polite">
      {total === 0 ? "Aucun résultat" : `${total} résultat${total > 1 ? "s" : ""}`}
      {paginated && total > 0 && <span className="text-muted-foreground/80"> · {first}–{last} affichés</span>}
      {unfilteredTotal !== undefined && unfilteredTotal !== total && <span className="text-muted-foreground/80"> sur {unfilteredTotal} au total</span>}
    </p>
  );

  if (!paginated) return <div className="flex flex-wrap items-center justify-between gap-3 text-sm">{count}</div>;

  return (
    <nav aria-label="Pagination" className="flex flex-col gap-3 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      {count}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-2 text-muted-foreground">
          Lignes par page
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="h-10 rounded-lg border border-input bg-background px-2 text-sm text-foreground"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <span className="text-muted-foreground" aria-live="polite">
          Page {page + 1} sur {pages}
        </span>
        <div className="flex items-center gap-1" aria-busy={pending || undefined}>
          <Button variant="outline" size="icon" className="size-10" onClick={() => onPageChange(0)} disabled={!canPrevious} aria-label="Première page">
            <ChevronsLeft aria-hidden />
          </Button>
          <Button variant="outline" size="icon" className="size-10" onClick={() => onPageChange(page - 1)} disabled={!canPrevious} aria-label="Page précédente">
            <ChevronLeft aria-hidden />
          </Button>
          <Button variant="outline" size="icon" className="size-10" onClick={() => onPageChange(page + 1)} disabled={!canNext} aria-label="Page suivante">
            <ChevronRight aria-hidden />
          </Button>
          <Button variant="outline" size="icon" className="size-10" onClick={() => onPageChange(pages - 1)} disabled={!canNext} aria-label="Dernière page">
            <ChevronsRight aria-hidden />
          </Button>
        </div>
      </div>
    </nav>
  );
}
