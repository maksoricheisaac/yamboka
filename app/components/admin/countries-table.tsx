"use client";

import { createColumnHelper } from "@tanstack/react-table";
import type { AdminCountryRow } from "@yamboka/shared";
import { CATALOG_STATUS_LABELS } from "@yamboka/shared";
import { CountryStatusPill } from "@/components/admin/country-status";
import { DataTable, SortableHeader } from "@/components/admin/data-table/data-table";
import type { DataTableFeatures } from "@/components/admin/data-table/features";
import { RowActions } from "@/components/admin/row-actions";
import { flagOf } from "@/lib/flags";

const STATUS_OPTIONS = (["ACTIVE", "COMING_SOON", "DISABLED"] as const).map((s) => ({ value: s, label: CATALOG_STATUS_LABELS[s] }));

const col = createColumnHelper<DataTableFeatures, AdminCountryRow>();

const columns = col.columns([
  col.accessor("name", {
    id: "name",
    header: ({ column }) => <SortableHeader column={column} title="Pays" />,
    sortFn: "text",
    enableHiding: false,
    cell: ({ row: { original: c } }) => (
      <span className="font-medium whitespace-nowrap">
        <span aria-hidden className="mr-2 text-lg">
          {flagOf(c.iso)}
        </span>
        {c.name}
      </span>
    ),
  }),
  col.accessor("iso", {
    id: "iso",
    header: ({ column }) => <SortableHeader column={column} title="ISO" />,
    sortFn: "text",
    cell: ({ row }) => <span className="font-mono text-xs">{row.original.iso}</span>,
  }),
  col.accessor("currency", {
    id: "currency",
    header: ({ column }) => <SortableHeader column={column} title="Devise" />,
    sortFn: "text",
  }),
  col.accessor("activeMethodCount", {
    id: "methods",
    header: ({ column }) => <SortableHeader column={column} title="Moyens" />,
    sortFn: "basic",
    cell: ({ row: { original: c } }) => (
      <span className="tabular-nums">
        {c.activeMethodCount} actif{c.activeMethodCount > 1 ? "s" : ""} / {c.methodCount}
        <span className="block text-xs font-normal text-muted-foreground">{c.methodNames.join(", ")}</span>
      </span>
    ),
  }),
  col.accessor((c) => CATALOG_STATUS_LABELS[c.status], {
    id: "status",
    header: ({ column }) => <SortableHeader column={column} title="Statut" />,
    sortFn: "text",
    cell: ({ row: { original: c } }) => (
      <>
        <CountryStatusPill status={c.status} />
        {!c.sellable && <span className="block text-xs text-muted-foreground">Tarification {c.currency} à configurer</span>}
      </>
    ),
  }),
  col.display({
    id: "fees",
    header: "Frais indicatifs",
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.feeNote ?? "—"}</span>,
  }),
  col.display({
    id: "actions",
    header: "Actions",
    enableHiding: false,
    cell: ({ row: { original: c } }) => (
      <RowActions
        label={`Actions pour ${c.name}`}
        actions={[
          { key: "open", label: "Ouvrir la fiche", icon: "open", href: `/admin/pays/${c.iso}` },
          {
            key: "status",
            label: "Changer le statut",
            icon: "status",
            dialog: {
              triggerLabel: `Changer le statut de ${c.name}`,
              title: `Statut de ${c.name}`,
              description: "Actif : ouvert. Bientôt disponible : visible, non sélectionnable. Désactivé : jamais proposé.",
              endpoint: `/admin/countries/${c.iso}/status`,
              fields: [{ name: "status", label: "Nouveau statut", type: "select", defaultValue: c.status, options: STATUS_OPTIONS }],
            },
          },
        ]}
      />
    ),
  }),
]);

/**
 * La recherche, le filtre de statut et la pagination restent côté serveur : le tableau apporte le tri
 * et le choix des colonnes sur la page affichée.
 */
export function CountriesTable({ countries }: { countries: AdminCountryRow[] }) {
  return (
    <DataTable
      caption="Pays intégrés et leur statut"
      columns={columns}
      data={countries}
      minWidth="56rem"
      paginate={false}
      columnLabels={{ iso: "ISO", currency: "Devise", methods: "Moyens", status: "Statut", fees: "Frais indicatifs" }}
      emptyMessage="Aucun pays."
    />
  );
}
