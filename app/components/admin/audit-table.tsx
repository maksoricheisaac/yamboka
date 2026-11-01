"use client";

import { createColumnHelper } from "@tanstack/react-table";
import type { AuditRow } from "@yamboka/shared";
import { DataTable, SortableHeader } from "@/components/admin/data-table/data-table";
import type { DataTableFeatures } from "@/components/admin/data-table/features";
import { formatDateTime } from "@/lib/format";

const col = createColumnHelper<DataTableFeatures, AuditRow>();

function Json({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>;
  return <code className="block max-w-xs break-words whitespace-pre-wrap rounded bg-muted px-1.5 py-1 text-xs">{JSON.stringify(value)}</code>;
}

const columns = col.columns([
  col.accessor("createdAt", {
    id: "date",
    header: ({ column }) => <SortableHeader column={column} title="Date" />,
    sortFn: "text",
    enableHiding: false,
    cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{formatDateTime(row.original.createdAt)}</span>,
  }),
  col.accessor((r) => r.actor ?? "Système", {
    id: "actor",
    header: ({ column }) => <SortableHeader column={column} title="Acteur" />,
    sortFn: "text",
    cell: ({ row: { original: r } }) => (
      <>
        {r.actor ?? "Système"}
        {r.ip && <span className="block text-xs text-muted-foreground">{r.ip}</span>}
      </>
    ),
  }),
  col.accessor("action", {
    id: "action",
    header: ({ column }) => <SortableHeader column={column} title="Action" />,
    sortFn: "text",
    cell: ({ row }) => <span className="font-mono text-xs">{row.original.action}</span>,
  }),
  col.accessor("entityType", {
    id: "entity",
    header: ({ column }) => <SortableHeader column={column} title="Entité" />,
    sortFn: "text",
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

/** Journal en lecture seule : recherche, période et pagination côté serveur ; tri et colonnes sur la page affichée. */
export function AuditTable({ rows }: { rows: AuditRow[] }) {
  return (
    <DataTable
      caption="Journal d’audit"
      columns={columns}
      data={rows}
      paginate={false}
      minWidth="64rem"
      columnLabels={{ actor: "Acteur", action: "Action", entity: "Entité", before: "Avant", after: "Après", reason: "Motif" }}
    />
  );
}
