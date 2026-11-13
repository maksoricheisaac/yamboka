"use client";

import { createColumnHelper } from "@tanstack/react-table";
import type { AdminPack, AdminPackPage } from "@yamboka/shared";
import { RowActions } from "@/components/admin/row-actions";
import { DataTableColumnHeader } from "@/components/admin/data-table/data-table-column-header";
import { ServerDataTable } from "@/components/admin/data-table/server-data-table";
import type { DataTableFeatures } from "@/components/admin/data-table/data-table-features";
import { Pill } from "@/components/admin/ui";
import { formatFcfa, formatNumber } from "@/lib/format";

const col = createColumnHelper<DataTableFeatures, AdminPack>();

const columns = col.columns([
  col.accessor("name", {
    id: "name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Pack" />,
    enableHiding: false,
    cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
  }),
  col.accessor("priceFcfa", {
    id: "price",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Prix" />,
    cell: ({ row }) => <span className="whitespace-nowrap">{formatFcfa(row.original.priceFcfa)}</span>,
  }),
  col.accessor("totalCredits", {
    id: "credits",
    header: "Crédits",
    enableSorting: false,
    cell: ({ row }) => (
      <>
        {formatNumber(row.original.totalCredits)}
        <span className="block text-xs text-muted-foreground">
          {row.original.baseCredits} + {row.original.bonusPercent} %
        </span>
      </>
    ),
  }),
  col.accessor((p) => p.worstMarginPercent ?? -Infinity, {
    id: "margin",
    header: "Marge minimale",
    enableSorting: false,
    cell: ({ row: { original: p } }) =>
      p.worstMarginPercent === null ? (
        "—"
      ) : (
        <Pill tone={p.belowThreshold ? "bad" : "ok"}>
          {p.worstMarginPercent} %{p.belowThreshold ? " — insuffisante" : ""}
        </Pill>
      ),
  }),
  col.accessor((p) => (p.active ? 1 : 0), {
    id: "status",
    header: "Statut",
    enableSorting: false,
    cell: ({ row: { original: p } }) => (
      <span className="flex flex-wrap gap-1">
        <Pill tone={p.active ? "ok" : "neutral"}>{p.active ? "Actif" : "Inactif"}</Pill>
        {p.publicVisible && <Pill tone="info">Public</Pill>}
        {p.featured && <Pill tone="warn">Recommandé</Pill>}
      </span>
    ),
  }),
  col.display({
    id: "actions",
    header: "Actions",
    enableHiding: false,
    cell: ({ row: { original: p } }) => (
      <div className="text-right">
        <RowActions
          label={`Actions pour le pack ${p.name}`}
          actions={[
            {
              key: "edit",
              label: "Modifier",
              icon: "edit",
              dialog: {
                title: `Modifier « ${p.name} »`,
                description: "Un pack actif doit respecter la marge minimale : l’enregistrement est refusé sinon.",
                endpoint: `/admin/packs/${p.id}`,
                method: "PATCH",
                fields: [
                  { name: "price", label: "Prix (FCFA)", type: "number", defaultValue: p.priceFcfa },
                  { name: "credits", label: "Crédits de base", type: "number", defaultValue: p.baseCredits },
                  { name: "bonusPercent", label: "Bonus (%)", type: "number", defaultValue: p.bonusPercent },
                ],
                submitLabel: "Enregistrer",
              },
            },
            ...(p.active
              ? [
                  {
                    key: "visibility",
                    label: p.publicVisible ? "Retirer des pages publiques" : "Publier sur les pages publiques",
                    icon: p.publicVisible ? ("unpublish" as const) : ("publish" as const),
                    dialog: {
                      title: p.publicVisible ? `Retirer « ${p.name} » des pages publiques` : `Publier « ${p.name} »`,
                      description: p.publicVisible ? "Le pack reste vendu dans l’espace client." : "Trois offres publiques au maximum.",
                      endpoint: `/admin/packs/${p.id}`,
                      method: "PATCH" as const,
                      fixed: { publicVisible: !p.publicVisible },
                      submitLabel: p.publicVisible ? "Retirer" : "Publier",
                    },
                  },
                ]
              : []),
            ...(p.active && p.publicVisible && !p.featured
              ? [
                  {
                    key: "feature",
                    label: "Recommander",
                    icon: "star" as const,
                    dialog: {
                      title: `Recommander « ${p.name} »`,
                      description: "Une seule offre est recommandée : la précédente perd son badge.",
                      endpoint: `/admin/packs/${p.id}`,
                      method: "PATCH" as const,
                      fixed: { featured: true },
                      submitLabel: "Recommander",
                    },
                  },
                ]
              : []),
            {
              key: "active",
              label: p.active ? "Désactiver" : "Activer",
              icon: p.active ? "off" : "on",
              destructive: p.active,
              dialog: {
                title: p.active ? `Désactiver « ${p.name} »` : `Activer « ${p.name} »`,
                description: p.active ? "Le pack n’est plus vendu et disparaît des pages publiques." : "L’activation est refusée si la marge est insuffisante.",
                endpoint: `/admin/packs/${p.id}`,
                method: "PATCH",
                fixed: { active: !p.active },
                submitLabel: p.active ? "Désactiver" : "Activer",
                destructive: p.active,
              },
            },
          ]}
        />
      </div>
    ),
  }),
]);

export function PacksTable({ page }: { page: AdminPackPage }) {
  return (
    <ServerDataTable
      caption="Packs de crédits, prix, marges et publication"
      columns={columns}
      items={page.items}
      meta={page}
      minWidth="48rem"
      search={{ label: "Nom du pack", placeholder: "Nom du pack…" }}
      filters={[
        {
          param: "status",
          label: "Statut",
          options: [
            { value: "active", label: "Actifs" },
            { value: "inactive", label: "Inactifs" },
          ],
        },
      ]}
      columnLabels={{ price: "Prix", credits: "Crédits", margin: "Marge minimale", status: "Statut" }}
      emptyMessage="Aucun pack."
    />
  );
}
