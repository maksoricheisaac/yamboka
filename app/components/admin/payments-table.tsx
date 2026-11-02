"use client";

import { createColumnHelper } from "@tanstack/react-table";
import type { AdminPaymentRow } from "@yamboka/shared";
import Link from "next/link";
import { providerLabel } from "@/components/credits/labels";
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
  col.accessor("provider", {
    id: "provider",
    header: ({ column }) => <SortableHeader column={column} title="Fournisseur" />,
    sortFn: "text",
    cell: ({ row: { original: p } }) => (
      <>
        {providerLabel(p.provider)}
        {p.network && <span className="block text-xs text-muted-foreground">{p.network}</span>}
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
    cell: ({ row: { original: p } }) => (
      <>
        <span className="whitespace-nowrap font-medium">{formatFcfa(p.amount)}</span>
        {p.sentAmount != null && p.sentAmount !== p.amount && (
          <span className="block whitespace-nowrap text-xs text-muted-foreground">envoyé : {formatFcfa(p.sentAmount)}</span>
        )}
      </>
    ),
  }),
  col.accessor("status", {
    id: "status",
    header: ({ column }) => <SortableHeader column={column} title="État" />,
    sortFn: "text",
    cell: ({ row: { original: p } }) => (
      <>
        <StatusPill kind="payment" value={p.status} />
        {p.failureReason && <span className="block text-xs text-muted-foreground">{p.failureReason}</span>}
        {p.issue && <span className="block text-xs font-medium text-destructive">{p.issue}</span>}
      </>
    ),
  }),
  col.display({
    id: "verify",
    header: "Actions",
    enableHiding: false,
    cell: ({ row: { original: p } }) => (
      <div className="flex flex-col items-end gap-1.5">
        <Link href={`/admin/paiements/${p.id}`} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          Détail<span className="sr-only"> du paiement de {p.user.email}</span>
        </Link>
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
      minWidth="60rem"
      columnLabels={{ customer: "Client", provider: "Fournisseur", pack: "Pack", amount: "Montant", status: "État" }}
    />
  );
}
