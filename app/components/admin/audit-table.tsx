"use client";

import { createColumnHelper } from "@tanstack/react-table";
import type { AdminAuditPage } from "@yamboka/shared";
import { DataTableColumnHeader } from "@/components/admin/data-table/data-table-column-header";
import { ServerDataTable } from "@/components/admin/data-table/server-data-table";
import type { DataTableFeatures } from "@/components/admin/data-table/data-table-features";
import { formatDateTime } from "@/lib/format";

const col = createColumnHelper<DataTableFeatures, AdminAuditPage["items"][number]>();

function Json({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>;
  return <code className="block max-w-xs break-words whitespace-pre-wrap rounded bg-muted px-1.5 py-1 text-xs">{JSON.stringify(value)}</code>;
}

const columns = col.columns([
  col.accessor("createdAt", {
    id: "createdAt",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
    enableHiding: false,
    cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{formatDateTime(row.original.createdAt)}</span>,
  }),
  col.accessor((r) => r.actor ?? "Système", {
    id: "actor",
    header: "Acteur",
    enableSorting: false,
    cell: ({ row: { original: r } }) => (
      <>
        {r.actor ?? "Système"}
        {r.ip && <span className="block text-xs text-muted-foreground">{r.ip}</span>}
      </>
    ),
  }),
  col.accessor("action", {
    id: "action",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Action" />,
    cell: ({ row }) => <span className="font-mono text-xs">{row.original.action}</span>,
  }),
  col.accessor("entityType", {
    id: "entityType",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Entité" />,
    cell: ({ row: { original: r } }) => (
      <>
        {r.entityType}
        {r.entityId && (
          <span className="block max-w-32 truncate font-mono text-xs text-muted-foreground" title={r.entityId}>
            {r.entityId}
          </span>
        )}
      </>
    ),
  }),
  col.display({ id: "before", header: "Avant", cell: ({ row }) => <Json value={row.original.before} /> }),
  col.display({ id: "after", header: "Après", cell: ({ row }) => <Json value={row.original.after} /> }),
  col.display({ id: "reason", header: "Motif", cell: ({ row }) => <span className="block max-w-56 text-muted-foreground">{row.original.reason ?? "—"}</span> }),
]);

export function AuditTable({ page, admins }: { page: AdminAuditPage; admins: { value: string; label: string }[] }) {
  return (
    <ServerDataTable
      caption="Journal d’audit"
      columns={columns}
      items={page.items}
      meta={page}
      minWidth="64rem"
      search={{ label: "Utilisateur, action ou entité", placeholder: "pack.update, admin@…" }}
      filters={[
        { param: "actor", label: "Administrateur", options: admins },
        {
          param: "entity",
          label: "Type d’événement",
          options: page.summary.entityTypes.map((t) => ({ value: t, label: t })),
        },
      ]}
      dateFilter={{ label: "Période" }}
      columnLabels={{ actor: "Acteur", action: "Action", entityType: "Entité", before: "Avant", after: "Après", reason: "Motif" }}
      emptyMessage="Aucune entrée."
    />
  );
}
