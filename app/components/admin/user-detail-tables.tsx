"use client";

import { createColumnHelper } from "@tanstack/react-table";
import type { AdminUserDetail } from "@yamboka/shared";
import { DataTableColumnHeader } from "@/components/admin/data-table/data-table-column-header";
import { DataTable } from "@/components/admin/data-table/data-table";
import type { DataTableFeatures } from "@/components/admin/data-table/data-table-features";
import { LEDGER_LABELS, StatusPill } from "@/components/admin/ui";
import { formatDateTime, formatFcfa, formatNumber } from "@/lib/format";

type Payment = AdminUserDetail["payments"][number];
type Generation = AdminUserDetail["generations"][number];
type Ledger = AdminUserDetail["ledger"][number];

const payment = createColumnHelper<DataTableFeatures, Payment>();

const paymentColumns = payment.columns([
  payment.accessor("createdAt", {
    id: "date",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
    sortFn: "text",
    enableHiding: false,
    cell: ({ row }) => <span className="whitespace-nowrap">{formatDateTime(row.original.createdAt)}</span>,
  }),
  payment.accessor("amount", {
    id: "amount",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Montant" />,
    sortFn: "basic",
    cell: ({ row }) => <span className="whitespace-nowrap tabular-nums">{formatFcfa(row.original.amount)}</span>,
  }),
  payment.accessor("credits", {
    id: "credits",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Crédits" />,
    sortFn: "basic",
    cell: ({ row }) => <span className="tabular-nums">{formatNumber(row.original.credits)}</span>,
  }),
  payment.accessor("operator", {
    id: "operator",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Opérateur" />,
    sortFn: "text",
  }),
  payment.accessor("status", {
    id: "status",
    header: ({ column }) => <DataTableColumnHeader column={column} title="État" />,
    sortFn: "text",
    cell: ({ row }) => <StatusPill kind="payment" value={row.original.status} />,
  }),
]);

export function UserPaymentsTable({ payments }: { payments: Payment[] }) {
  return (
    <DataTable
      caption="Paiements du client"
      columns={paymentColumns}
      data={payments}
      minWidth="32rem"
      paginate={false}
      columnLabels={{ amount: "Montant", credits: "Crédits", operator: "Opérateur", status: "État" }}
      emptyMessage="Aucun paiement."
    />
  );
}

const generation = createColumnHelper<DataTableFeatures, Generation>();

const generationColumns = generation.columns([
  generation.accessor("createdAt", {
    id: "date",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
    sortFn: "text",
    enableHiding: false,
    cell: ({ row }) => <span className="whitespace-nowrap">{formatDateTime(row.original.createdAt)}</span>,
  }),
  generation.accessor("product", {
    id: "product",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Produit" />,
    sortFn: "text",
  }),
  generation.accessor("creditsCost", {
    id: "cost",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Coût" />,
    sortFn: "basic",
    cell: ({ row }) => <span className="whitespace-nowrap tabular-nums">{formatNumber(row.original.creditsCost)} crédits</span>,
  }),
  generation.accessor("status", {
    id: "status",
    header: ({ column }) => <DataTableColumnHeader column={column} title="État" />,
    sortFn: "text",
    cell: ({ row }) => <StatusPill kind="generation" value={row.original.status} />,
  }),
]);

export function UserGenerationsTable({ generations }: { generations: Generation[] }) {
  return (
    <DataTable
      caption="Générations du client"
      columns={generationColumns}
      data={generations}
      minWidth="30rem"
      paginate={false}
      columnLabels={{ product: "Produit", cost: "Coût", status: "État" }}
      emptyMessage="Aucune génération."
    />
  );
}

const ledger = createColumnHelper<DataTableFeatures, Ledger>();

const ledgerColumns = ledger.columns([
  ledger.accessor("createdAt", {
    id: "date",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
    sortFn: "text",
    enableHiding: false,
    cell: ({ row }) => <span className="whitespace-nowrap">{formatDateTime(row.original.createdAt)}</span>,
  }),
  ledger.accessor((l) => LEDGER_LABELS[l.type] ?? l.type, {
    id: "type",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
    sortFn: "text",
  }),
  ledger.accessor("amount", {
    id: "amount",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Montant" />,
    sortFn: "basic",
    cell: ({ row: { original: l } }) => (
      <span className={`tabular-nums font-medium ${l.amount < 0 ? "text-destructive" : ""}`}>{l.amount > 0 ? `+${l.amount}` : l.amount}</span>
    ),
  }),
  ledger.display({
    id: "note",
    header: "Note",
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.note ?? "—"}</span>,
  }),
]);

export function UserLedgerTable({ ledger: rows }: { ledger: Ledger[] }) {
  return (
    <DataTable
      caption="Derniers mouvements de crédits"
      columns={ledgerColumns}
      data={rows}
      minWidth="32rem"
      paginate={false}
      columnLabels={{ type: "Type", amount: "Montant", note: "Note" }}
      emptyMessage="Aucun mouvement."
    />
  );
}
