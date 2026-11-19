"use client";

import { createColumnHelper } from "@tanstack/react-table";
import type { PackMarginRow, VideoSimulationRow } from "@yamboka/shared";
import { DataTableColumnHeader } from "@/components/admin/data-table/data-table-column-header";
import { DataTable } from "@/components/admin/data-table/data-table";
import type { DataTableFeatures } from "@/components/admin/data-table/data-table-features";
import { Pill } from "@/components/admin/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatFcfa } from "@/lib/format";

/** Deux lignes dans une cellule : le chiffre qui décide, puis sa précision. Évite d'étaler onze colonnes. */
function Stacked({ main, sub, alert }: { main: React.ReactNode; sub: React.ReactNode; alert?: boolean }) {
  return (
    <div className="whitespace-nowrap tabular-nums">
      <div className={alert ? "font-semibold text-destructive" : "font-medium"}>{main}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

const video = createColumnHelper<DataTableFeatures, VideoSimulationRow>();

const videoColumns = video.columns([
  video.accessor("modelName", {
    id: "modelName",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Vidéo" />,
    sortFn: "text",
    enableHiding: false,
    cell: ({ row }) => (
      <Stacked
        main={<span title={row.original.modelSlug}>{row.original.modelName}</span>}
        sub={`${row.original.resolution} · ${row.original.durationSeconds} s${row.original.optionsLabel ? ` · ${row.original.optionsLabel}` : ""}`}
      />
    ),
  }),
  video.accessor("costUsd", {
    id: "costUsd",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Coût" />,
    sortFn: "basic",
    cell: ({ row }) => <Stacked main={`${row.original.costUsd} $`} sub={formatFcfa(row.original.costFcfa)} />,
  }),
  video.accessor("netNeededFcfa", {
    id: "netNeededFcfa",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Doit rapporter" />,
    sortFn: "basic",
    cell: ({ row }) => (
      <span className="whitespace-nowrap tabular-nums">{formatFcfa(row.original.netNeededFcfa)}</span>
    ),
  }),
  video.accessor("chargedCredits", {
    id: "chargedCredits",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Facturé" />,
    sortFn: "basic",
    cell: ({ row }) => (
      <Stacked
        main={`${row.original.chargedCredits} cr.`}
        sub={`${row.original.requiredCredits} requis · ${formatFcfa(row.original.priceEquivalentFcfa)}`}
        alert={row.original.chargedCredits < row.original.requiredCredits}
      />
    ),
  }),
  video.accessor("marginFcfa", {
    id: "marginFcfa",
    // Le scénario pessimiste décide de l'ouverture de la vente : il se lit sous la marge en vigueur.
    header: ({ column }) => <DataTableColumnHeader column={column} title="Marge" />,
    sortFn: "basic",
    cell: ({ row }) => (
      <Stacked
        main={formatFcfa(row.original.marginFcfa)}
        sub={`pessimiste ${formatFcfa(row.original.worst.marginFcfa)}`}
        alert={row.original.marginFcfa < 0 || row.original.worst.marginFcfa < 0}
      />
    ),
  }),
  video.display({
    id: "verdict",
    header: "Verdict",
    cell: ({ row }) =>
      row.original.belowCost || row.original.worst.belowCost ? (
        <Pill tone="bad">
          {row.original.missingCredits} crédit{row.original.missingCredits > 1 ? "s" : ""} manquant
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
      minWidth="46rem"
      paginate={false}
      columnLabels={{
        modelName: "Vidéo",
        costUsd: "Coût",
        netNeededFcfa: "Doit rapporter",
        chargedCredits: "Facturé",
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
    cell: ({ row }) => (
      <Stacked
        main={row.original.name}
        sub={`${row.original.credits} crédits${row.original.bonusCredits > 0 ? ` + ${row.original.bonusCredits} offerts` : ""}`}
      />
    ),
  }),
  pack.accessor("priceFcfa", {
    id: "priceFcfa",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Prix" />,
    sortFn: "basic",
    cell: ({ row }) => (
      <Stacked main={formatFcfa(row.original.priceFcfa)} sub={`${formatFcfa(row.original.netFcfa)} nets`} />
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
      minWidth="36rem"
      paginate={false}
      columnLabels={{
        name: "Pack",
        priceFcfa: "Prix",
        fcfaPerCredit: "Net par crédit",
        bonusCostFcfa: "Coût du bonus",
      }}
      emptyMessage="Aucun pack publié."
    />
  );
}

/** Un seul tableau à l'écran à la fois : la page tient sans défilement latéral ni empilement de sections. */
export function SimulationTabs({
  videos,
  packs,
  packNote,
}: {
  videos: VideoSimulationRow[];
  packs: PackMarginRow[];
  packNote: string;
}) {
  return (
    <Tabs defaultValue="videos">
      <TabsList variant="line" className="w-full justify-start gap-1 rounded-none border-b p-0 group-data-[orientation=horizontal]/tabs:h-auto">
        <TabsTrigger value="videos" className="h-11 flex-none rounded-none px-3 group-data-[orientation=horizontal]/tabs:after:bottom-0">
          Par vidéo <span className="text-muted-foreground">({videos.length})</span>
        </TabsTrigger>
        <TabsTrigger value="packs" className="h-11 flex-none rounded-none px-3 group-data-[orientation=horizontal]/tabs:after:bottom-0">
          Par pack <span className="text-muted-foreground">({packs.length})</span>
        </TabsTrigger>
      </TabsList>
      <TabsContent value="videos" className="pt-4">
        <VideoSimulationTable videos={videos} />
      </TabsContent>
      <TabsContent value="packs" className="space-y-3 pt-4">
        <p className="text-xs text-muted-foreground">{packNote}</p>
        <PackMarginTable packs={packs} />
      </TabsContent>
    </Tabs>
  );
}
