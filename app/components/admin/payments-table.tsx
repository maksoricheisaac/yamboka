"use client";

import { createColumnHelper } from "@tanstack/react-table";
import type { AdminPaymentRow } from "@yamboka/shared";
import { DataTable, SortableHeader } from "@/components/admin/data-table/data-table";
import type { DataTableFeatures } from "@/components/admin/data-table/features";
import { StatusPill } from "@/components/admin/ui";
import { VerifyPaymentButton } from "@/components/admin/verify-payment-button";
import { formatDateTime, formatFcfa, formatNumber } from "@/lib/format";

const col = createColumnHelper<DataTableFeatures, AdminPaymentRow>();

const columns = col.columns([
  col.accessor("createdAt", {
    id: "date",
    header: ({ column }) => <SortableHeader column={column} title="Date" />,
    sortFn: "text",
    enableHiding: false,
    cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{formatDateTime(row.original.createdAt)}</span>,
  }),
  col.accessor((p) => p.user.email, {
    id: "customer",
    header: ({ column }) => <SortableHeader column={column} title="Client" />,
    sortFn: "text",
    cell: ({ row: { original: p } }) => (
      <>
        {p.user.email}
        <span className="block text-xs text-muted-foreground">
          {p.operator}
          {p.externalReference ? ` · ${p.externalReference}` : ""}
        </span>
      </>
    ),
  }),
  col.accessor("packName", {
    id: "pack",
    header: ({ column }) => <SortableHeader column={column} title="Pack" />,
    sortFn: "text",
    cell: ({ row: { original: p } }) => (
      <>
        {p.packName}
        <span className="block text-xs text-muted-foreground">{formatNumber(p.credits)} crédits</span>
      </>
    ),
  }),
  col.accessor("amount", {
    id: "amount",
    header: ({ column }) => <SortableHeader column={column} title="Montant" />,
    sortFn: "basic",
    cell: ({ row }) => <span className="whitespace-nowrap font-medium">{formatFcfa(row.original.amount)}</span>,
  }),
  col.accessor("status", {
    id: "status",
    header: ({ column }) => <SortableHeader column={column} title="État" />,
    sortFn: "text",
    cell: ({ row: { original: p } }) => (
      <>
        <StatusPill kind="payment" value={p.status} />
        {p.failureReason && <span className="block text-xs text-muted-foreground">{p.failureReason}</span>}
      </>
    ),
  }),
  col.display({
    id: "verify",
    header: "Actions",
    enableHiding: false,
    cell: ({ row: { original: p } }) => (
      <div className="text-right">
        {(p.status === "PENDING" || p.status === "INITIATED" || p.status === "FAILED") && <VerifyPaymentButton id={p.id} />}
      </div>
    ),
  }),
]);

/** Recherche, filtres (statut, période) et pagination restent côté serveur ; le tableau apporte tri et colonnes. */
export function PaymentsTable({ payments }: { payments: AdminPaymentRow[] }) {
  return (
    <DataTable
      caption="Journal des paiements"
      columns={columns}
      data={payments}
      paginate={false}
      minWidth="52rem"
      columnLabels={{ customer: "Client", pack: "Pack", amount: "Montant", status: "État" }}
    />
  );
}
