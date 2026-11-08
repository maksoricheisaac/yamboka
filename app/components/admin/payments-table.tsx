"use client";

import { createColumnHelper } from "@tanstack/react-table";
import type { AdminPaymentRow } from "@yamboka/shared";
import Link from "next/link";
import { providerLabel } from "@/components/credits/labels";
import { DataTable, SortableHeader } from "@/components/admin/data-table/data-table";
import { ServerSortHeader } from "@/components/admin/data-table/server-sort";
import type { DataTableFeatures } from "@/components/admin/data-table/features";
import { StatusPill } from "@/components/admin/ui";
import { VerifyPaymentButton } from "@/components/admin/verify-payment-button";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";

const col = createColumnHelper<DataTableFeatures, AdminPaymentRow>();

const columns = col.columns([
  col.accessor("createdAt", {
    id: "date",
    header: () => <ServerSortHeader id="createdAt" title="Date" />,
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
  col.accessor((p) => p.countryName ?? p.country, {
    id: "country",
    header: ({ column }) => <SortableHeader column={column} title="Pays" />,
    sortFn: "text",
    cell: ({ row: { original: p } }) => (
      <>
        {p.countryName ?? p.country}
        <span className="block text-xs text-muted-foreground">{p.methodName ?? p.operator}</span>
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
    header: () => <ServerSortHeader id="amount" title="Montant" />,
    cell: ({ row: { original: p } }) => (
      <>
        <span className="whitespace-nowrap font-medium">{formatMoney(p.amount, p.currency)}</span>
        {p.sentAmount != null && p.sentAmount !== p.amount && (
          <span className="block whitespace-nowrap text-xs text-muted-foreground">envoyé : {formatMoney(p.sentAmount, p.currency)}</span>
        )}
      </>
    ),
  }),
  col.accessor("status", {
    id: "status",
    header: () => <ServerSortHeader id="status" title="État" />,
    cell: ({ row: { original: p } }) => (
      <>
        <StatusPill kind="payment" value={p.status} />
        {p.confirmedAt && <span className="block whitespace-nowrap text-xs text-muted-foreground">confirmé le {formatDateTime(p.confirmedAt)}</span>}
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
      minWidth="64rem"
      columnLabels={{ customer: "Client", country: "Pays et moyen", provider: "Fournisseur", pack: "Pack", amount: "Montant", status: "État" }}
    />
  );
}
