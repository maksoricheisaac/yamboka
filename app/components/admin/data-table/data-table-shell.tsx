"use client";

import type { RowData } from "@tanstack/react-table";
import { cn } from "cn";
import type { ReactNode } from "react";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ariaSort } from "./data-table-column-header";
import type { AdminTable } from "./data-table-features";
import { NON_DATA_COLUMNS } from "./data-table-features";

/**
 * Première colonne (identité de la ligne) épinglée à gauche, colonne d'actions à droite : sur un petit écran, le
 * tableau défile horizontalement sans que la ligne perde son nom ni son menu. La colonne d'actions n'a pas de filet
 * vertical : ce sont les filets horizontaux qui structurent les lignes.
 */
function stickyClass(columnId: string, index: number, body = false) {
  const bg = body ? "bg-card group-hover/row:bg-muted" : "";
  if (NON_DATA_COLUMNS.has(columnId)) return `sticky right-0 z-[1] w-24 text-right ${bg}`;
  if (index === 0) return `sticky left-0 z-[1] ${bg}`;
  return "";
}

/**
 * Le tableau lui-même : balisage sémantique (`table`, `thead`, `tbody`, `tr`, `th`, `td`) rendu par les primitives
 * `Table` de shadcn/ui. TanStack ne fournit que les modèles ; la présentation et l'accessibilité restent ici.
 * Partagé par les deux modes, pour qu'un tableau client et une liste servie par l'API soient identiques à l'œil.
 */
export function DataTableShell<TData extends RowData>({
  table,
  caption,
  minWidth,
  empty,
}: {
  table: AdminTable<TData>;
  caption: string;
  minWidth: string;
  empty: ReactNode;
}) {
  const rows = table.getRowModel().rows;
  const columnCount = table.getVisibleFlatColumns().length;

  return (
    <div className="overflow-hidden rounded-3xl bg-card shadow-card">
      <Table style={{ minWidth }}>
        <TableCaption className="sr-only">{caption}</TableCaption>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header, i) => (
                <TableHead
                  key={header.id}
                  scope="col"
                  aria-sort={ariaSort(header.column.getIsSorted())}
                  className={cn("bg-card", stickyClass(header.column.id, i))}
                >
                  {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {rows.length > 0 ? (
            rows.map((row) => (
              <TableRow key={row.id} className="group/row">
                {row.getVisibleCells().map((cell, i) => (
                  <TableCell key={cell.id} className={cn("align-top", stickyClass(cell.column.id, i, true))}>
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columnCount} className="h-24 text-center text-muted-foreground">
                {empty}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
