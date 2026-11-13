"use client";

import { createColumnHelper } from "@tanstack/react-table";
import type { AdminReportRow, Page } from "@yamboka/shared";
import { ActionDialog } from "@/components/admin/action-dialog";
import { DataTableColumnHeader } from "@/components/admin/data-table/data-table-column-header";
import { ServerDataTable } from "@/components/admin/data-table/server-data-table";
import type { DataTableFeatures } from "@/components/admin/data-table/data-table-features";
import { STATUS_OPTIONS, StatusPill } from "@/components/admin/ui";
import { formatDateTime } from "@/lib/format";

const col = createColumnHelper<DataTableFeatures, AdminReportRow>();

const columns = col.columns([
  col.accessor("createdAt", {
    id: "createdAt",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Reçu le" />,
    enableHiding: false,
    cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{formatDateTime(row.original.createdAt)}</span>,
  }),
  col.accessor("reason", {
    id: "reason",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Motif" />,
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
    header: "Par",
    enableSorting: false,
  }),
  col.accessor("status", {
    id: "status",
    header: ({ column }) => <DataTableColumnHeader column={column} title="État" />,
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

export function ReportsTable({ page, reasons }: { page: Page<AdminReportRow>; reasons: { value: string; label: string }[] }) {
  return (
    <ServerDataTable
      caption="Signalements et réclamations"
      columns={columns}
      items={page.items}
      meta={page}
      search={{ label: "Utilisateur, motif ou détail", placeholder: "client@…, motif…" }}
      filters={[
        { param: "status", label: "État", options: STATUS_OPTIONS.report },
        { param: "reason", label: "Catégorie", options: reasons },
      ]}
      dateFilter={{ label: "Période" }}
      columnLabels={{ reason: "Motif", reporter: "Par", status: "État" }}
      emptyMessage="Aucun signalement."
    />
  );
}
