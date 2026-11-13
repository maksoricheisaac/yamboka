"use client";

import { createColumnHelper } from "@tanstack/react-table";
import type { AdminReportRow } from "@yamboka/shared";
import { ActionDialog } from "@/components/admin/action-dialog";
import { DataTable, SortableHeader } from "@/components/admin/data-table/data-table";
import type { DataTableFeatures } from "@/components/admin/data-table/features";
import { StatusPill } from "@/components/admin/ui";
import { formatDateTime } from "@/lib/format";

const col = createColumnHelper<DataTableFeatures, AdminReportRow>();

const columns = col.columns([
  col.accessor("createdAt", {
    id: "createdAt",
    header: ({ column }) => <SortableHeader column={column} title="Reçu le" />,
    sortFn: "text",
    enableHiding: false,
    cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{formatDateTime(row.original.createdAt)}</span>,
  }),
  col.accessor("reason", {
    id: "reason",
    header: ({ column }) => <SortableHeader column={column} title="Motif" />,
    sortFn: "text",
    cell: ({ row: { original: r } }) => (
      <>
        <span className="font-medium">{r.reason}</span>
        {r.details && <span className="block text-xs text-muted-foreground">{r.details}</span>}
        {r.resolution && <span className="block text-xs">Décision : {r.resolution}</span>}
      </>
    ),
  }),
  col.accessor((r) => r.reporter ?? "Anonyme", {
    id: "reporter",
    header: ({ column }) => <SortableHeader column={column} title="Par" />,
    sortFn: "text",
  }),
  col.accessor("status", {
    id: "status",
    header: ({ column }) => <SortableHeader column={column} title="État" />,
    sortFn: "text",
    cell: ({ row }) => <StatusPill kind="report" value={row.original.status} />,
  }),
  col.display({
    id: "actions",
    header: "Actions",
    enableHiding: false,
    cell: ({ row: { original: r } }) => (
      <ActionDialog
        trigger="Traiter"
        triggerLabel={`Traiter la réclamation « ${r.reason} »`}
        title="Traiter ce signalement"
        endpoint={`/admin/reports/${r.id}/handle`}
        withReason={false}
        fields={[
          {
            name: "status",
            label: "Nouvel état",
            type: "select",
            options: [
              { value: "IN_PROGRESS", label: "En cours" },
              { value: "RESOLVED", label: "Résolu" },
              { value: "REJECTED", label: "Rejeté" },
            ],
            defaultValue: "RESOLVED",
          },
          { name: "resolution", label: "Décision et motif (au moins 5 caractères)", type: "textarea" },
        ]}
      />
    ),
  }),
]);

/** Le filtre d'état et la pagination restent côté serveur : le tableau apporte le tri de la page affichée. */
export function ReportsTable({ reports }: { reports: AdminReportRow[] }) {
  return (
    <DataTable
      caption="Signalements et réclamations"
      columns={columns}
      data={reports}
      paginate={false}
      columnLabels={{ reason: "Motif", reporter: "Par", status: "État" }}
      emptyMessage="Aucun signalement."
    />
  );
}
