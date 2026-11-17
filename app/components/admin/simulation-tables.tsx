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
  video.accessor("modelName", {
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
  video.accessor("resolution", {
    id: "resolution",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Qualité" />,
    sortFn: "text",
    cell: ({ row }) => <span className="whitespace-nowrap font-medium">{row.original.resolution}</span>,
  }),
  video.accessor("durationSeconds", {
    id: "durationSeconds",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Durée" />,
    sortFn: "basic",
    cell: ({ row }) => <span className="whitespace-nowrap tabular-nums">{row.original.durationSeconds} s</span>,
  }),
  video.accessor("optionsLabel", {
    id: "optionsLabel",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Options" />,
    sortFn: "text",
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-muted-foreground">{row.original.optionsLabel || "—"}</span>
    ),
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
  video.accessor("chargedCredits", {
    id: "chargedCredits",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Crédits facturés" />,
    sortFn: "basic",
    cell: ({ row }) => (
      <span className="whitespace-nowrap tabular-nums">
        {row.original.chargedCredits}
        <span className="text-muted-foreground"> / {row.original.requiredCredits} requis</span>
      </span>
    ),
  }),
  video.accessor("priceEquivalentFcfa", {
    id: "priceEquivalentFcfa",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Prix équivalent" />,
    sortFn: "basic",
    cell: ({ row }) => (
      <span className="whitespace-nowrap tabular-nums">{formatFcfa(row.original.priceEquivalentFcfa)}</span>
    ),
  }),
  video.accessor("marginFcfa", {
    id: "marginFcfa",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Marge en vigueur" />,
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
    id: "worstMargin",
    header: "Marge pessimiste",
    // C'est cette colonne qui décide si la vente peut ouvrir : le scénario le plus défavorable.
    cell: ({ row }) => (
      <span
        className={`whitespace-nowrap tabular-nums ${
          row.original.worst.marginFcfa < 0 ? "font-semibold text-destructive" : ""
        }`}
      >
        {formatFcfa(row.original.worst.marginFcfa)}
        <span className="text-muted-foreground"> · {row.original.worst.chargedCredits} cr.</span>
      </span>
    ),
  }),
  video.display({
    id: "verdict",
    header: "Verdict",
    cell: ({ row }) =>
      row.original.belowCost || row.original.worst.belowCost ? (
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
      minWidth="72rem"
      paginate={false}
      columnLabels={{
        modelName: "Modèle",
        resolution: "Qualité",
        durationSeconds: "Durée",
        optionsLabel: "Options",
        costUsd: "Coût fournisseur",
        netNeededFcfa: "Doit rapporter",
        chargedCredits: "Crédits facturés",
        priceEquivalentFcfa: "Prix équivalent",
        marginFcfa: "Marge en vigueur",
        worstMargin: "Marge pessimiste",
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
