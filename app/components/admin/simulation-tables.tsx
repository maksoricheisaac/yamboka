"use client";

import { createColumnHelper } from "@tanstack/react-table";
import type { PackMarginRow, VideoSimulationRow } from "@yamboka/shared";
import { DataTableColumnHeader } from "@/components/admin/data-table/data-table-column-header";
import { DataTable } from "@/components/admin/data-table/data-table";
import type { DataTableFeatures } from "@/components/admin/data-table/data-table-features";
import { Pill } from "@/components/admin/ui";
import { formatFcfa } from "@/lib/format";

const video = createColumnHelper<DataTableFeatures, VideoSimulationRow>();

const videoColumns = video.columns([
  video.accessor("resolution", {
    id: "resolution",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Qualité" />,
    sortFn: "text",
    enableHiding: false,
    cell: ({ row }) => <span className="whitespace-nowrap font-medium">{row.original.resolution}</span>,
  }),
  video.accessor("durationSeconds", {
    id: "durationSeconds",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Durée" />,
    sortFn: "basic",
    cell: ({ row }) => <span className="whitespace-nowrap tabular-nums">{row.original.durationSeconds} s</span>,
  }),
  video.accessor("costUsd", {
    id: "costUsd",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Coût fournisseur" />,
    sortFn: "basic",
    cell: ({ row }) => (
      <span className="whitespace-nowrap tabular-nums">
        {row.original.costUsd} $ · {formatFcfa(row.original.costFcfa)}
      </span>
    ),
  }),
  video.accessor("netNeededFcfa", {
    id: "netNeededFcfa",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Doit rapporter" />,
    sortFn: "basic",
    cell: ({ row }) => <span className="whitespace-nowrap tabular-nums">{formatFcfa(row.original.netNeededFcfa)}</span>,
  }),
  video.accessor("requiredCredits", {
    id: "requiredCredits",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Crédits requis" />,
    sortFn: "basic",
    cell: ({ row }) => <span className="whitespace-nowrap tabular-nums font-semibold">{row.original.requiredCredits}</span>,
  }),
  video.accessor("chargedCredits", {
    id: "chargedCredits",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Crédits facturés" />,
    sortFn: "basic",
    cell: ({ row }) => <span className="whitespace-nowrap tabular-nums">{row.original.chargedCredits}</span>,
  }),
  video.accessor("marginFcfa", {
    id: "marginFcfa",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Marge" />,
    sortFn: "basic",
    // Une marge négative est la seule chose qui compte vraiment sur cet écran : elle ressort en rouge.
    cell: ({ row }) => (
      <span
        className={`whitespace-nowrap tabular-nums ${
          row.original.marginFcfa < 0 ? "font-semibold text-destructive" : ""
        }`}
      >
        {formatFcfa(row.original.marginFcfa)}
      </span>
    ),
  }),
  video.display({
    id: "verdict",
    header: "Verdict",
    cell: ({ row }) =>
      row.original.belowCost ? (
        <Pill tone="bad">
          Sous le coût · {row.original.missingCredits} crédit{row.original.missingCredits > 1 ? "s" : ""} manquant
          {row.original.missingCredits > 1 ? "s" : ""}
        </Pill>
      ) : (
        <Pill tone="ok">Couvert</Pill>
      ),
  }),
]);

export function VideoSimulationTable({ videos }: { videos: VideoSimulationRow[] }) {
  return (
    <DataTable
      caption="Coût et prix de chaque vidéo"
      columns={videoColumns}
      data={videos}
      minWidth="56rem"
      paginate={false}
      columnLabels={{
        resolution: "Qualité",
        durationSeconds: "Durée",
        costUsd: "Coût fournisseur",
        netNeededFcfa: "Doit rapporter",
        requiredCredits: "Crédits requis",
        chargedCredits: "Crédits facturés",
        marginFcfa: "Marge",
        verdict: "Verdict",
      }}
      emptyMessage="Aucune vidéo à simuler."
    />
  );
}

const pack = createColumnHelper<DataTableFeatures, PackMarginRow>();

const packColumns = pack.columns([
  pack.accessor("name", {
    id: "name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Pack" />,
    sortFn: "text",
    enableHiding: false,
    cell: ({ row }) => <span className="whitespace-nowrap font-medium">{row.original.name}</span>,
  }),
  pack.accessor("priceFcfa", {
    id: "priceFcfa",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Prix" />,
    sortFn: "basic",
    cell: ({ row }) => <span className="whitespace-nowrap tabular-nums">{formatFcfa(row.original.priceFcfa)}</span>,
  }),
  pack.accessor("netFcfa", {
    id: "netFcfa",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Net reçu" />,
    sortFn: "basic",
    cell: ({ row }) => <span className="whitespace-nowrap tabular-nums">{formatFcfa(row.original.netFcfa)}</span>,
  }),
  pack.display({
    id: "credits",
    header: "Crédits",
    cell: ({ row }) => (
      <span className="whitespace-nowrap tabular-nums">
        {row.original.credits}
        {row.original.bonusCredits > 0 ? ` + ${row.original.bonusCredits} offerts` : ""}
      </span>
    ),
  }),
  pack.accessor("fcfaPerCredit", {
    id: "fcfaPerCredit",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Net par crédit" />,
    sortFn: "basic",
    cell: ({ row }) => <span className="whitespace-nowrap tabular-nums">{row.original.fcfaPerCredit} F</span>,
  }),
  pack.accessor("bonusCostFcfa", {
    id: "bonusCostFcfa",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Coût du bonus" />,
    sortFn: "basic",
    cell: ({ row }) => (
      <span className="whitespace-nowrap tabular-nums">
        {row.original.bonusCredits > 0 ? formatFcfa(row.original.bonusCostFcfa) : "—"}
      </span>
    ),
  }),
]);

export function PackMarginTable({ packs }: { packs: PackMarginRow[] }) {
  return (
    <DataTable
      caption="Valeur d’un crédit par pack"
      columns={packColumns}
      data={packs}
      minWidth="44rem"
      paginate={false}
      columnLabels={{
        name: "Pack",
        priceFcfa: "Prix",
        netFcfa: "Net reçu",
        credits: "Crédits",
        fcfaPerCredit: "Net par crédit",
        bonusCostFcfa: "Coût du bonus",
      }}
      emptyMessage="Aucun pack publié."
    />
  );
}
