"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { PAYMENT_ANOMALIES, type AdminPaymentRow, type Page } from "@yamboka/shared";
import Link from "next/link";
import { providerLabel } from "@/components/credits/labels";
import { DataTableColumnHeader } from "@/components/admin/data-table/data-table-column-header";
import { ServerDataTable } from "@/components/admin/data-table/server-data-table";
import type { DataTableFeatures } from "@/components/admin/data-table/data-table-features";
import { Pill, STATUS_OPTIONS, StatusPill } from "@/components/admin/ui";
import { VerifyPaymentButton } from "@/components/admin/verify-payment-button";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";

const col = createColumnHelper<DataTableFeatures, AdminPaymentRow>();

const columns = col.columns([
  col.accessor("createdAt", {
    id: "createdAt",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
    enableHiding: false,
    cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{formatDateTime(row.original.createdAt)}</span>,
  }),
  col.accessor((p) => p.user.email, {
    id: "customer",
    header: "Client",
    enableSorting: false,
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
    header: "Pays",
    enableSorting: false,
    cell: ({ row: { original: p } }) => (
      <>
        {p.countryName ?? p.country}
        <span className="block text-xs text-muted-foreground">{p.methodName ?? p.operator}</span>
      </>
    ),
  }),
  col.accessor("provider", {
    id: "provider",
    header: "Fournisseur",
    enableSorting: false,
    cell: ({ row: { original: p } }) => (
      <>
        {providerLabel(p.provider)}
        {p.network && <span className="block text-xs text-muted-foreground">{p.network}</span>}
      </>
    ),
  }),
  col.accessor("packName", {
    id: "pack",
    header: "Pack",
    enableSorting: false,
    cell: ({ row: { original: p } }) => (
      <>
        {p.packName}
        <span className="block text-xs text-muted-foreground">{formatNumber(p.credits)} crédits</span>
      </>
    ),
  }),
  col.accessor("amount", {
    id: "amount",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Montant" />,
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
    header: ({ column }) => <DataTableColumnHeader column={column} title="État" />,
    cell: ({ row: { original: p } }) => (
      <>
        <StatusPill kind="payment" value={p.status} />
        {p.confirmedAt && <span className="block whitespace-nowrap text-xs text-muted-foreground">confirmé le {formatDateTime(p.confirmedAt)}</span>}
        {p.failureReason && <span className="block text-xs text-muted-foreground">{p.failureReason}</span>}
        {p.issue && <span className="block text-xs font-medium text-destructive">{p.issue}</span>}
      </>
    ),
  }),
  col.accessor("creditState", {
    id: "credits",
    header: "Crédits",
    enableSorting: false,
    cell: ({ row: { original: p } }) =>
      p.creditState === "CREDITED" ? (
        <>
          <Pill tone="ok">Attribués</Pill>
          <span className="block text-xs text-muted-foreground">
            {p.creditOrigin === "MANUAL" ? "régularisation manuelle" : "automatique"}
          </span>
        </>
      ) : p.creditState === "NOT_CREDITED" ? (
        <>
          <Pill tone="bad">Non attribués</Pill>
          <span className="block text-xs font-medium text-destructive">à régulariser</span>
        </>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
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

export function PaymentsTable({
  page,
  countries,
  methods,
}: {
  page: Page<AdminPaymentRow>;
  countries: { value: string; label: string }[];
  methods: { value: string; label: string }[];
}) {
  return (
    <ServerDataTable
      caption="Journal des paiements"
      columns={columns}
      items={page.items}
      meta={page}
      minWidth="64rem"
      search={{ label: "E-mail, référence ou numéro", placeholder: "client@…, référence, 06…" }}
      filters={[
        { param: "status", label: "État", options: STATUS_OPTIONS.payment },
        {
          param: "provider",
          label: "Fournisseur",
          options: [
            { value: "saspay", label: "SasPay" },
            { value: "mock", label: "Simulé" },
          ],
        },
        { param: "country", label: "Pays", options: countries },
        { param: "method", label: "Moyen", options: methods },
        { param: "anomaly", label: "Anomalie", options: PAYMENT_ANOMALIES.map((a) => ({ value: a.value, label: a.label })) },
      ]}
      dateFilter={{ label: "Période" }}
      columnLabels={{ customer: "Client", country: "Pays et moyen", provider: "Fournisseur", pack: "Pack", amount: "Montant", status: "État", credits: "Crédits" }}
      emptyMessage="Aucun paiement."
    />
  );
}
