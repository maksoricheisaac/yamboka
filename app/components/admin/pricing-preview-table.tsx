"use client";

import { createColumnHelper } from "@tanstack/react-table";
import type { PricingPreviewRow } from "@yamboka/shared";
import { DataTable } from "@/components/admin/data-table/data-table";
import { DataTableColumnHeader } from "@/components/admin/data-table/data-table-column-header";
import type { DataTableFeatures } from "@/components/admin/data-table/data-table-features";
import { Pill } from "@/components/admin/ui";
import { formatFcfa } from "@/lib/format";

const col = createColumnHelper<DataTableFeatures, PricingPreviewRow>();

/** Deux lignes dans une cellule : le chiffre qui décide, puis sa précision. */
function Stacked({ main, sub, alert }: { main: React.ReactNode; sub: React.ReactNode; alert?: boolean }) {
  return (
    <div className="whitespace-nowrap tabular-nums">
      <div className={alert ? "font-semibold text-destructive" : "font-medium"}>{main}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

/** Passage avant → après, l'après en gras : c'est lui qu'on applique. */
function Change({ before, after }: { before: React.ReactNode; after: React.ReactNode }) {
  return (
    <>
      <span className="text-muted-foreground">{before}</span>
      <span className="text-muted-foreground"> → </span>
      <span className="font-semibold text-foreground">{after}</span>
    </>
  );
}

const columns = col.columns([
  col.accessor("modelName", {
    id: "modelName",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Vidéo" />,
    sortFn: "text",
    enableHiding: false,
    cell: ({ row }) => (
      <Stacked
        main={<span title={row.original.modelSlug}>{row.original.modelName}</span>}
        sub={`${row.original.resolution} · ${row.original.durationSeconds} s`}
      />
    ),
  }),
  col.accessor("costUsd", {
    id: "costUsd",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Coût" />,
    sortFn: "basic",
    cell: ({ row }) => (
      <Stacked main={`${row.original.costUsd} $`} sub={formatFcfa(row.original.after.costFcfa)} />
    ),
  }),
  col.display({
    id: "billed",
    header: "Facturé (avant → après)",
    cell: ({ row }) => (
      <Stacked
        main={<Change before={`${row.original.before.credits} cr.`} after={`${row.original.after.credits} cr.`} />}
        sub={
          <Change
            before={formatFcfa(row.original.before.priceEquivalentFcfa)}
            after={formatFcfa(row.original.after.priceEquivalentFcfa)}
          />
        }
      />
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
    cell: ({ row }) => (
      <Stacked
        main={formatFcfa(row.original.after.marginFcfa)}
        sub={`pessimiste ${formatFcfa(row.original.afterWorstMarginFcfa)}`}
        alert={row.original.after.marginFcfa < 0 || row.original.afterWorstMarginFcfa < 0}
      />
    ),
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
      minWidth="48rem"
      paginate={false}
      columnLabels={{
        modelName: "Vidéo",
        costUsd: "Coût",
        billed: "Facturé (avant → après)",
        changePercent: "Variation",
        margin: "Marge après",
        verdict: "Verdict",
      }}
      emptyMessage="Aucune ligne à comparer."
    />
  );
}
