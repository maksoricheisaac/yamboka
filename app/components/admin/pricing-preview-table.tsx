"use client";

import { createColumnHelper } from "@tanstack/react-table";
import type { PricingPreviewRow } from "@yamboka/shared";
import { DataTable } from "@/components/admin/data-table/data-table";
import { DataTableColumnHeader } from "@/components/admin/data-table/data-table-column-header";
import type { DataTableFeatures } from "@/components/admin/data-table/data-table-features";
import { Pill } from "@/components/admin/ui";
import { formatFcfa } from "@/lib/format";

const col = createColumnHelper<DataTableFeatures, PricingPreviewRow>();

/** Marge affichée : en rouge dès qu'elle est négative, c'est la seule chose à repérer d'un coup d'œil. */
function Margin({ value }: { value: number }) {
  return (
    <span className={`whitespace-nowrap tabular-nums ${value < 0 ? "font-semibold text-destructive" : ""}`}>
      {formatFcfa(value)}
    </span>
  );
}

const columns = col.columns([
  col.accessor("modelName", {
    id: "modelName",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Modèle" />,
    sortFn: "text",
    enableHiding: false,
    cell: ({ row }) => (
      <span className="whitespace-nowrap font-medium" title={row.original.modelSlug}>
        {row.original.modelName}
      </span>
    ),
  }),
  col.accessor("resolution", {
    id: "resolution",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Qualité" />,
    sortFn: "text",
    cell: ({ row }) => <span className="whitespace-nowrap">{row.original.resolution}</span>,
  }),
  col.accessor("durationSeconds", {
    id: "durationSeconds",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Durée" />,
    sortFn: "basic",
    cell: ({ row }) => <span className="whitespace-nowrap tabular-nums">{row.original.durationSeconds} s</span>,
  }),
  col.accessor("costUsd", {
    id: "costUsd",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Coût" />,
    sortFn: "basic",
    cell: ({ row }) => (
      <span className="whitespace-nowrap tabular-nums">
        {row.original.costUsd} $ · {formatFcfa(row.original.after.costFcfa)}
      </span>
    ),
  }),
  col.display({
    id: "credits",
    header: "Crédits (avant → après)",
    cell: ({ row }) => (
      <span className="whitespace-nowrap tabular-nums">
        {row.original.before.credits}
        <span className="text-muted-foreground"> → </span>
        <span className="font-semibold">{row.original.after.credits}</span>
      </span>
    ),
  }),
  col.display({
    id: "price",
    header: "Prix équivalent",
    cell: ({ row }) => (
      <span className="whitespace-nowrap tabular-nums">
        {formatFcfa(row.original.before.priceEquivalentFcfa)}
        <span className="text-muted-foreground"> → </span>
        <span className="font-semibold">{formatFcfa(row.original.after.priceEquivalentFcfa)}</span>
      </span>
    ),
  }),
  col.accessor("changePercent", {
    id: "changePercent",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Variation" />,
    sortFn: "basic",
    cell: ({ row }) => {
      const v = row.original.changePercent;
      // Au-delà de 20 %, l'application exige une confirmation : la cellule le signale déjà ici.
      return (
        <span className={`whitespace-nowrap tabular-nums ${Math.abs(v) > 20 ? "font-semibold text-warning" : ""}`}>
          {v > 0 ? "+" : ""}
          {v} %
        </span>
      );
    },
  }),
  col.display({
    id: "margin",
    header: "Marge après",
    cell: ({ row }) => <Margin value={row.original.after.marginFcfa} />,
  }),
  col.display({
    id: "worstMargin",
    header: "Marge pessimiste",
    cell: ({ row }) => <Margin value={row.original.afterWorstMarginFcfa} />,
  }),
  col.display({
    id: "verdict",
    header: "Verdict",
    cell: ({ row }) =>
      row.original.after.marginFcfa < 0 || row.original.afterWorstMarginFcfa < 0 ? (
        <Pill tone="bad">Sous le coût</Pill>
      ) : (
        <Pill tone="ok">Couvert</Pill>
      ),
  }),
]);

export function PricingPreviewTable({ rows }: { rows: PricingPreviewRow[] }) {
  return (
    <DataTable
      caption="Avant / après, par modèle, qualité et durée"
      columns={columns}
      data={rows}
      minWidth="72rem"
      paginate={false}
      columnLabels={{
        modelName: "Modèle",
        resolution: "Qualité",
        durationSeconds: "Durée",
        costUsd: "Coût",
        credits: "Crédits (avant → après)",
        price: "Prix équivalent",
        changePercent: "Variation",
        margin: "Marge après",
        worstMargin: "Marge pessimiste",
        verdict: "Verdict",
      }}
      emptyMessage="Aucune ligne à comparer."
    />
  );
}
