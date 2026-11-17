"use client";

import { createColumnHelper } from "@tanstack/react-table";
import type { CalibrationRow, PayoutRow, TopUpRow } from "@yamboka/shared";
import { DataTableColumnHeader } from "@/components/admin/data-table/data-table-column-header";
import { DataTable } from "@/components/admin/data-table/data-table";
import type { DataTableFeatures } from "@/components/admin/data-table/data-table-features";
import { Pill } from "@/components/admin/ui";
import { formatFcfa } from "@/lib/format";

const topUp = createColumnHelper<DataTableFeatures, TopUpRow>();

const topUpColumns = topUp.columns([
  topUp.accessor("occurredAt", {
    id: "date",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
    sortFn: "text",
    enableHiding: false,
    cell: ({ row }) => <span className="whitespace-nowrap">{row.original.occurredAt.slice(0, 10)}</span>,
  }),
  topUp.accessor("receivedUsd", {
    id: "receivedUsd",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Reçu" />,
    sortFn: "basic",
    cell: ({ row }) => <span className="whitespace-nowrap tabular-nums">{row.original.receivedUsd} $</span>,
  }),
  topUp.accessor("netWithdrawnXaf", {
    id: "netWithdrawnXaf",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Retiré (net)" />,
    sortFn: "basic",
    cell: ({ row }) => (
      <span className="whitespace-nowrap tabular-nums">
        {row.original.netWithdrawnXaf === null ? "—" : formatFcfa(row.original.netWithdrawnXaf)}
      </span>
    ),
  }),
  topUp.accessor("cardAmountXaf", {
    id: "cardAmountXaf",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Carte" />,
    sortFn: "basic",
    cell: ({ row }) => <span className="whitespace-nowrap tabular-nums">{formatFcfa(row.original.cardAmountXaf)}</span>,
  }),
  topUp.accessor("rOut", {
    id: "rOut",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Taux sortant" />,
    sortFn: "basic",
    cell: ({ row }) =>
      row.original.measured && row.original.rOut !== null ? (
        <span className="whitespace-nowrap tabular-nums">{row.original.rOut} F/$</span>
      ) : (
        <Pill tone="warn">Non mesuré</Pill>
      ),
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
      caption="Recharges du fournisseur"
      columns={topUpColumns}
      data={topUps}
      minWidth="42rem"
      paginate={false}
      columnLabels={{
        receivedUsd: "Reçu",
        netWithdrawnXaf: "Retiré (net)",
        cardAmountXaf: "Carte",
        rOut: "Taux sortant",
        note: "Note",
      }}
      emptyMessage="Aucune recharge saisie."
    />
  );
}

const calibration = createColumnHelper<DataTableFeatures, CalibrationRow>();

const calibrationColumns = calibration.columns([
  calibration.accessor("readAt", {
    id: "readAt",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Lu le" />,
    sortFn: "text",
    enableHiding: false,
    cell: ({ row }) => <span className="whitespace-nowrap">{row.original.readAt.slice(0, 10)}</span>,
  }),
  calibration.accessor("readUsd", {
    id: "readUsd",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Solde lu" />,
    sortFn: "basic",
    cell: ({ row }) => <span className="whitespace-nowrap tabular-nums">{row.original.readUsd} $</span>,
  }),
  calibration.accessor("estimatedUsd", {
    id: "estimatedUsd",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Estimé" />,
    sortFn: "basic",
    cell: ({ row }) => <span className="whitespace-nowrap tabular-nums">{row.original.estimatedUsd} $</span>,
  }),
  calibration.accessor("deltaUsd", {
    id: "deltaUsd",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Écart" />,
    sortFn: "basic",
    // Un écart négatif signifie qu'on avait dépensé plus que ce que le journal savait : c'est celui qui coûte.
    cell: ({ row }) => (
      <span
        className={`whitespace-nowrap tabular-nums ${
          row.original.deltaUsd.startsWith("-") ? "font-semibold text-destructive" : ""
        }`}
      >
        {row.original.deltaUsd} $
      </span>
    ),
  }),
  calibration.display({
    id: "note",
    header: "Note",
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.note ?? "—"}</span>,
  }),
]);

export function CalibrationsTable({ calibrations }: { calibrations: CalibrationRow[] }) {
  return (
    <DataTable
      caption="Relevés du solde fournisseur"
      columns={calibrationColumns}
      data={calibrations}
      minWidth="34rem"
      paginate={false}
      columnLabels={{ readUsd: "Solde lu", estimatedUsd: "Estimé", deltaUsd: "Écart", note: "Note" }}
      emptyMessage="Aucun relevé saisi."
    />
  );
}

const payout = createColumnHelper<DataTableFeatures, PayoutRow>();

const payoutColumns = payout.columns([
  payout.accessor("date", {
    id: "date",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
    sortFn: "text",
    enableHiding: false,
    cell: ({ row }) => <span className="whitespace-nowrap">{row.original.date}</span>,
  }),
  payout.accessor("amountXaf", {
    id: "amountXaf",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Montant" />,
    sortFn: "basic",
    cell: ({ row }) => <span className="whitespace-nowrap tabular-nums">{formatFcfa(row.original.amountXaf)}</span>,
  }),
  payout.accessor("commissionXaf", {
    id: "commissionXaf",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Commission" />,
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
