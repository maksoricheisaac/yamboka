"use client";

import { createColumnHelper } from "@tanstack/react-table";
import type { AdminProduct } from "@yamboka/shared";
import { RowActions } from "@/components/admin/row-actions";
import { DataTable, SortableHeader } from "@/components/admin/data-table/data-table";
import type { DataTableFeatures } from "@/components/admin/data-table/features";
import { Pill } from "@/components/admin/ui";

const col = createColumnHelper<DataTableFeatures, AdminProduct>();

const columns = col.columns([
  col.accessor("name", {
    id: "name",
    header: ({ column }) => <SortableHeader column={column} title="Produit" />,
    sortFn: "text",
    enableHiding: false,
    cell: ({ row: { original: p } }) => (
      <>
        <span className="font-medium">{p.name}</span>
        <span className="block text-xs text-muted-foreground">
          {p.code}
          {p.phase === "PHASE_2" ? " · phase 2" : ""}
        </span>
      </>
    ),
  }),
  col.accessor("billingUnit", {
    id: "billing",
    header: ({ column }) => <SortableHeader column={column} title="Facturation" />,
    sortFn: "text",
    cell: ({ row }) => (row.original.billingUnit === "SECOND" ? "À la seconde" : "À l’image"),
  }),
  col.accessor("creditsPerUnit", {
    id: "price",
    header: ({ column }) => <SortableHeader column={column} title="Prix en crédits" />,
    sortFn: "basic",
    cell: ({ row }) => `${row.original.creditsPerUnit} crédits`,
  }),
  col.accessor("providerCostUsdPerUnit", {
    id: "cost",
    header: ({ column }) => <SortableHeader column={column} title="Coût fournisseur" />,
    sortFn: "basic",
    cell: ({ row: { original: p } }) => (
      <span className="text-muted-foreground">
        {p.providerCostUsdPerUnit} $ / {p.billingUnit === "SECOND" ? "s" : "image"}
      </span>
    ),
  }),
  col.accessor((p) => (p.active ? 1 : 0), {
    id: "status",
    header: ({ column }) => <SortableHeader column={column} title="Statut" />,
    sortFn: "basic",
    cell: ({ row: { original: p } }) => <Pill tone={p.active ? "ok" : "neutral"}>{p.active ? "Actif" : "Inactif"}</Pill>,
  }),
  col.display({
    id: "actions",
    header: "Actions",
    enableHiding: false,
    cell: ({ row: { original: p } }) => (
      <div className="text-right">
        <RowActions
          label={`Actions pour le produit ${p.name}`}
          actions={[
            {
              key: "price",
              label: "Modifier le prix en crédits",
              icon: "price",
              dialog: {
                title: `Prix de « ${p.name} »`,
                endpoint: `/admin/products/${p.id}`,
                method: "PATCH",
                fields: [{ name: "creditsPerUnit", label: "Crédits par unité", type: "number", defaultValue: p.creditsPerUnit }],
                submitLabel: "Enregistrer",
              },
            },
            {
              key: "active",
              label: p.active ? "Désactiver" : "Activer",
              icon: p.active ? "off" : "on",
              destructive: p.active,
              dialog: {
                title: p.active ? `Désactiver « ${p.name} »` : `Activer « ${p.name} »`,
                endpoint: `/admin/products/${p.id}`,
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

export function ProductsTable({ products }: { products: AdminProduct[] }) {
  return (
    <DataTable
      caption="Produits de génération"
      columns={columns}
      data={products}
      minWidth="44rem"
      searchText={(p) => `${p.name} ${p.code}`}
      searchPlaceholder="Rechercher un produit…"
      columnLabels={{ billing: "Facturation", price: "Prix en crédits", cost: "Coût fournisseur", status: "Statut" }}
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
          key: "billing",
          label: "Facturation",
          get: (p) => p.billingUnit,
          options: [
            { value: "SECOND", label: "À la seconde" },
            { value: "IMAGE", label: "À l’image" },
          ],
        },
      ]}
      emptyMessage="Aucun produit."
    />
  );
}
