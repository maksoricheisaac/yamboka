"use client";

import { createColumnHelper } from "@tanstack/react-table";
import type { AdminGenerationRow, Page } from "@yamboka/shared";
import { ActionDialog } from "@/components/admin/action-dialog";
import { DataTableColumnHeader } from "@/components/admin/data-table/data-table-column-header";
import { ServerDataTable } from "@/components/admin/data-table/server-data-table";
import type { DataTableFeatures } from "@/components/admin/data-table/data-table-features";
import { Pill, STATUS_OPTIONS, StatusPill } from "@/components/admin/ui";
import { formatDateTime, formatNumber } from "@/lib/format";

const col = createColumnHelper<DataTableFeatures, AdminGenerationRow>();

const columns = col.columns([
  col.accessor("createdAt", {
    id: "createdAt",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
    enableHiding: false,
    cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{formatDateTime(row.original.createdAt)}</span>,
  }),
  col.accessor((g) => g.user.email, {
    id: "client",
    header: "Client",
    enableSorting: false,
  }),
  col.accessor("product", {
    id: "product",
    header: "Produit",
    enableSorting: false,
    cell: ({ row: { original: g } }) => (
      <>
        {g.product}
        {g.preset && <span className="block text-xs text-muted-foreground">{g.preset}</span>}
      </>
    ),
  }),
  col.accessor("creditsCost", {
    id: "creditsCost",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Coût" />,
    cell: ({ row }) => <span className="whitespace-nowrap tabular-nums">{formatNumber(row.original.creditsCost)} cr.</span>,
  }),
  col.accessor("status", {
    id: "status",
    header: ({ column }) => <DataTableColumnHeader column={column} title="État" />,
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

export function GenerationsTable({
  page,
  presets,
  products,
}: {
  page: Page<AdminGenerationRow>;
  presets: { value: string; label: string }[];
  products: { value: string; label: string }[];
}) {
  return (
    <ServerDataTable
      caption="Liste des générations"
      columns={columns}
      items={page.items}
      meta={page}
      search={{ label: "Identifiant, client ou consigne", placeholder: "client@…, UUID, texte de la consigne…" }}
      filters={[
        { param: "status", label: "État", options: STATUS_OPTIONS.generation },
        { param: "product", label: "Type de génération", options: products },
        { param: "presetId", label: "Preset", options: presets },
      ]}
      dateFilter={{ label: "Période" }}
      columnLabels={{ client: "Client", product: "Produit", creditsCost: "Coût", status: "État" }}
      emptyMessage="Aucune génération."
    />
  );
}
