"use client";

import { createColumnHelper } from "@tanstack/react-table";
import type { AdminPack } from "@yamboka/shared";
import { RowActions } from "@/components/admin/row-actions";
import { DataTable, SortableHeader } from "@/components/admin/data-table/data-table";
import type { DataTableFeatures } from "@/components/admin/data-table/features";
import { Pill } from "@/components/admin/ui";
import { formatFcfa, formatNumber } from "@/lib/format";

const col = createColumnHelper<DataTableFeatures, AdminPack>();

const columns = col.columns([
  col.accessor("name", {
    id: "name",
    header: ({ column }) => <SortableHeader column={column} title="Pack" />,
    sortFn: "text",
    enableHiding: false,
    cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
  }),
  col.accessor("priceFcfa", {
    id: "price",
    header: ({ column }) => <SortableHeader column={column} title="Prix" />,
    sortFn: "basic",
    cell: ({ row }) => <span className="whitespace-nowrap">{formatFcfa(row.original.priceFcfa)}</span>,
  }),
  col.accessor("totalCredits", {
    id: "credits",
    header: ({ column }) => <SortableHeader column={column} title="Crédits" />,
    sortFn: "basic",
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
    header: ({ column }) => <SortableHeader column={column} title="Marge minimale" />,
    sortFn: "basic",
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
    header: ({ column }) => <SortableHeader column={column} title="Statut" />,
    sortFn: "basic",
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

export function PacksTable({ packs }: { packs: AdminPack[] }) {
  return (
    <DataTable
      caption="Packs de crédits, prix, marges et publication"
      columns={columns}
      data={packs}
      minWidth="48rem"
      searchText={(p) => p.name}
      searchPlaceholder="Rechercher un pack…"
      columnLabels={{ price: "Prix", credits: "Crédits", margin: "Marge minimale", status: "Statut" }}
      filters={[
        {
          key: "status",
          label: "Statut",
          get: (p) => (p.active ? "active" : "inactive"),
          options: [
            { value: "active", label: "Actifs" },
            { value: "inactive", label: "Inactifs" },
          ],
        },
        {
          key: "public",
          label: "Visibilité",
          get: (p) => (p.publicVisible ? "public" : "private"),
          options: [
            { value: "public", label: "Publics" },
            { value: "private", label: "Espace client seulement" },
          ],
        },
      ]}
      emptyMessage="Aucun pack."
    />
  );
}
