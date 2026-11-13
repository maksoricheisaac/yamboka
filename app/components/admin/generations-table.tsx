"use client";

import { createColumnHelper } from "@tanstack/react-table";
import type { AdminGenerationRow } from "@yamboka/shared";
import { ActionDialog } from "@/components/admin/action-dialog";
import { DataTable, SortableHeader } from "@/components/admin/data-table/data-table";
import type { DataTableFeatures } from "@/components/admin/data-table/features";
import { Pill, StatusPill } from "@/components/admin/ui";
import { formatDateTime, formatNumber } from "@/lib/format";

const col = createColumnHelper<DataTableFeatures, AdminGenerationRow>();

const columns = col.columns([
  col.accessor("createdAt", {
    id: "createdAt",
    header: ({ column }) => <SortableHeader column={column} title="Date" />,
    sortFn: "text",
    enableHiding: false,
    cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{formatDateTime(row.original.createdAt)}</span>,
  }),
  col.accessor((g) => g.user.email, {
    id: "client",
    header: ({ column }) => <SortableHeader column={column} title="Client" />,
    sortFn: "text",
  }),
  col.accessor("product", {
    id: "product",
    header: ({ column }) => <SortableHeader column={column} title="Produit" />,
    sortFn: "text",
    cell: ({ row: { original: g } }) => (
      <>
        {g.product}
        {g.preset && <span className="block text-xs text-muted-foreground">{g.preset}</span>}
      </>
    ),
  }),
  col.accessor("creditsCost", {
    id: "cost",
    header: ({ column }) => <SortableHeader column={column} title="Coût" />,
    sortFn: "basic",
    cell: ({ row }) => <span className="whitespace-nowrap tabular-nums">{formatNumber(row.original.creditsCost)} cr.</span>,
  }),
  col.accessor("status", {
    id: "status",
    header: ({ column }) => <SortableHeader column={column} title="État" />,
    sortFn: "text",
    cell: ({ row: { original: g } }) => (
      <>
        <StatusPill kind="generation" value={g.status} />
        {g.hidden && (
          <>
            {" "}
            <Pill tone="warn">Masquée</Pill>
          </>
        )}
      </>
    ),
  }),
  col.display({
    id: "actions",
    header: "Actions",
    enableHiding: false,
    cell: ({ row: { original: g } }) => (
      <ActionDialog
        trigger={g.hidden ? "Ré-afficher" : "Masquer"}
        triggerLabel={`${g.hidden ? "Ré-afficher" : "Masquer"} la création de ${g.user.email}`}
        title={g.hidden ? "Ré-afficher cette création" : "Masquer cette création"}
        endpoint={`/admin/generations/${g.id}/hide`}
        fixed={{ hidden: !g.hidden }}
        submitLabel={g.hidden ? "Ré-afficher" : "Masquer"}
        destructive={!g.hidden}
      />
    ),
  }),
]);

/** La recherche, les filtres et la pagination restent côté serveur : le tableau apporte le tri de la page affichée. */
export function GenerationsTable({ generations }: { generations: AdminGenerationRow[] }) {
  return (
    <DataTable
      caption="Liste des générations"
      columns={columns}
      data={generations}
      paginate={false}
      columnLabels={{ client: "Client", product: "Produit", cost: "Coût", status: "État" }}
      emptyMessage="Aucune génération."
    />
  );
}
