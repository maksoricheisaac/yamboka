"use client";

import { createColumnHelper } from "@tanstack/react-table";
import type { AdminPreset } from "@yamboka/shared";
import { RowActions } from "@/components/admin/row-actions";
import { DataTableColumnHeader } from "@/components/admin/data-table/data-table-column-header";
import { DataTable } from "@/components/admin/data-table/data-table";
import type { DataTableFeatures } from "@/components/admin/data-table/data-table-features";
import { Pill } from "@/components/admin/ui";

const col = createColumnHelper<DataTableFeatures, AdminPreset>();

const columns = col.columns([
  col.accessor("name", {
    id: "name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Preset" />,
    sortFn: "text",
    enableHiding: false,
    cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
  }),
  col.accessor("category", {
    id: "category",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Catégorie" />,
    sortFn: "text",
    filterFn: "equalsString",
  }),
  col.accessor("productCode", {
    id: "product",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Produit" />,
    sortFn: "text",
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.productCode}</span>,
  }),
  col.accessor((p) => (p.visible ? "published" : "draft"), {
    id: "status",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Publication" />,
    sortFn: "text",
    filterFn: "equalsString",
    cell: ({ row: { original: p } }) => <Pill tone={p.visible ? "ok" : "neutral"}>{p.visible ? "Publié" : "Non publié"}</Pill>,
  }),
  col.accessor((p) => (p.featured ? "yes" : "no"), {
    id: "featured",
    header: ({ column }) => <DataTableColumnHeader column={column} title="À la une" />,
    sortFn: "text",
    filterFn: "equalsString",
    cell: ({ row: { original: p } }) => <Pill tone={p.featured ? "ok" : "neutral"}>{p.featured ? "À la une" : "—"}</Pill>,
  }),
  col.display({
    id: "actions",
    header: "Actions",
    enableHiding: false,
    cell: ({ row: { original: p } }) => (
      <div className="text-right">
        <RowActions
          label={`Actions pour le preset ${p.name}`}
          actions={[
            {
              key: "visible",
              label: p.visible ? "Dépublier" : "Publier",
              icon: p.visible ? "unpublish" : "publish",
              dialog: {
                title: p.visible ? `Dépublier « ${p.name} »` : `Publier « ${p.name} »`,
                endpoint: `/admin/presets/${p.id}`,
                method: "PATCH",
                fixed: { visible: !p.visible },
                submitLabel: p.visible ? "Dépublier" : "Publier",
              },
            },
            // On ne met à la une qu'un preset publié (le serveur le refuse sinon) ; on peut toujours en retirer un.
            ...(p.visible || p.featured
              ? [
                  {
                    key: "featured",
                    label: p.featured ? "Retirer de la une" : "Mettre à la une",
                    icon: p.featured ? ("unstar" as const) : ("star" as const),
                    dialog: {
                      title: p.featured ? `Retirer « ${p.name} » de la une` : `Mettre « ${p.name} » à la une`,
                      endpoint: `/admin/presets/${p.id}/featured`,
                      method: "PATCH" as const,
                      fixed: { featured: !p.featured },
                      submitLabel: p.featured ? "Retirer de la une" : "Mettre à la une",
                    },
                  },
                ]
              : []),
          ]}
        />
      </div>
    ),
  }),
]);

export function PresetsTable({ presets }: { presets: AdminPreset[] }) {
  const categories = [...new Set(presets.map((p) => p.category))].sort();
  return (
    <DataTable
      caption="Presets"
      columns={columns}
      data={presets}
      minWidth="36rem"
      pageSize={20}
      search={{ label: "Nom, catégorie ou produit", placeholder: "Rechercher un preset…" }}
      columnLabels={{ category: "Catégorie", product: "Produit", status: "Publication", featured: "À la une" }}
      filters={[
        {
          columnId: "status",
          label: "Publication",
          options: [
            { value: "published", label: "Publiés" },
            { value: "draft", label: "Non publiés" },
          ],
        },
        {
          columnId: "featured",
          label: "À la une",
          options: [
            { value: "yes", label: "À la une" },
            { value: "no", label: "Pas à la une" },
          ],
        },
        { columnId: "category", label: "Catégorie", options: categories.map((c) => ({ value: c, label: c })) },
      ]}
      emptyMessage="Aucun preset."
    />
  );
}
