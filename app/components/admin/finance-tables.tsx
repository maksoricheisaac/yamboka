"use client";

import { createColumnHelper } from "@tanstack/react-table";
import type { PayoutRow, TopUpRow } from "@yamboka/shared";
import { DataTable, SortableHeader } from "@/components/admin/data-table/data-table";
import type { DataTableFeatures } from "@/components/admin/data-table/features";
import { formatFcfa, formatNumber } from "@/lib/format";

const topUp = createColumnHelper<DataTableFeatures, TopUpRow>();

const topUpColumns = topUp.columns([
  topUp.accessor("createdAt", {
    id: "date",
    header: ({ column }) => <SortableHeader column={column} title="Date" />,
    sortFn: "text",
    enableHiding: false,
    cell: ({ row }) => <span className="whitespace-nowrap">{row.original.createdAt.slice(0, 10)}</span>,
  }),
  topUp.accessor("amountUsd", {
    id: "amountUsd",
    header: ({ column }) => <SortableHeader column={column} title="Montant" />,
    sortFn: "basic",
    cell: ({ row }) => <span className="whitespace-nowrap tabular-nums">{formatNumber(row.original.amountUsd)} $</span>,
  }),
  topUp.accessor("amountXaf", {
    id: "amountXaf",
    header: ({ column }) => <SortableHeader column={column} title="Coût" />,
    sortFn: "basic",
    cell: ({ row }) => <span className="whitespace-nowrap tabular-nums">{formatFcfa(row.original.amountXaf)}</span>,
  }),
  topUp.accessor("fxRate", {
    id: "fxRate",
    header: ({ column }) => <SortableHeader column={column} title="Taux" />,
    sortFn: "basic",
    cell: ({ row }) => <span className="tabular-nums">{row.original.fxRate}</span>,
  }),
  topUp.display({
    id: "note",
    header: "Note",
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.note ?? "—"}</span>,
  }),
]);

export function TopUpsTable({ topUps }: { topUps: TopUpRow[] }) {
  return (
    <DataTable
      caption="Recharges Higgsfield"
      columns={topUpColumns}
      data={topUps}
      minWidth="30rem"
      paginate={false}
      columnLabels={{ amountUsd: "Montant", amountXaf: "Coût", fxRate: "Taux", note: "Note" }}
      emptyMessage="Aucune recharge saisie."
    />
  );
}

const payout = createColumnHelper<DataTableFeatures, PayoutRow>();

const payoutColumns = payout.columns([
  payout.accessor("date", {
    id: "date",
    header: ({ column }) => <SortableHeader column={column} title="Date" />,
    sortFn: "text",
    enableHiding: false,
    cell: ({ row }) => <span className="whitespace-nowrap">{row.original.date}</span>,
  }),
  payout.accessor("amountXaf", {
    id: "amountXaf",
    header: ({ column }) => <SortableHeader column={column} title="Montant" />,
    sortFn: "basic",
    cell: ({ row }) => <span className="whitespace-nowrap tabular-nums">{formatFcfa(row.original.amountXaf)}</span>,
  }),
  payout.accessor("commissionXaf", {
    id: "commissionXaf",
    header: ({ column }) => <SortableHeader column={column} title="Commission" />,
    sortFn: "basic",
    cell: ({ row }) => <span className="whitespace-nowrap tabular-nums">{formatFcfa(row.original.commissionXaf)}</span>,
  }),
  payout.display({
    id: "note",
    header: "Note",
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.note ?? "—"}</span>,
  }),
]);

export function PayoutsTable({ payouts }: { payouts: PayoutRow[] }) {
  return (
    <DataTable
      caption="Retraits SasPay"
      columns={payoutColumns}
      data={payouts}
      minWidth="28rem"
      paginate={false}
      columnLabels={{ amountXaf: "Montant", commissionXaf: "Commission", note: "Note" }}
      emptyMessage="Aucun retrait saisi."
    />
  );
}
