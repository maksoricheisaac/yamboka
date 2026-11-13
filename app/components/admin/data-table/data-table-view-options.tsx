"use client";

import { Subscribe } from "@tanstack/react-table";
import type { RowData } from "@tanstack/react-table";
import { Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AdminTable } from "./data-table-features";

/**
 * Menu de visibilité des colonnes. Seules les colonnes nommées dans `labels` sont masquables : la colonne
 * d'identité et la colonne d'actions restent toujours visibles (`enableHiding: false` dans leur définition).
 *
 * Chaque entrée lit son état par `Subscribe` sur l'atome `columnVisibility` : la lecture réactive ne passe pas par
 * `column.getIsVisible()` dans un composant mémoïsé, cas que la documentation v9 signale explicitement.
 */
export function DataTableViewOptions<TData extends RowData>({ table, labels }: { table: AdminTable<TData>; labels: Record<string, string> }) {
  const hideable = table.getAllColumns().filter((column) => column.getCanHide() && labels[column.id]);
  if (hideable.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-10">
          <Columns3 aria-hidden /> Colonnes
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Colonnes affichées</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {hideable.map((column) => (
          <Subscribe key={column.id} source={table.atoms.columnVisibility} selector={(visibility) => visibility[column.id] !== false}>
            {(visible) => (
              <DropdownMenuCheckboxItem checked={visible} onCheckedChange={(value) => column.toggleVisibility(!!value)} onSelect={(e) => e.preventDefault()}>
                {labels[column.id]}
              </DropdownMenuCheckboxItem>
            )}
          </Subscribe>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
