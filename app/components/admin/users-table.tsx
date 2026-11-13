"use client";

import { createColumnHelper } from "@tanstack/react-table";
import type { AdminUserRow, Page } from "@yamboka/shared";
import Link from "next/link";
import { DataTableColumnHeader } from "@/components/admin/data-table/data-table-column-header";
import type { DataTableFeatures } from "@/components/admin/data-table/data-table-features";
import { ServerDataTable } from "@/components/admin/data-table/server-data-table";
import { Pill, STATUS_OPTIONS, StatusPill } from "@/components/admin/ui";
import { formatDateTime, formatNumber } from "@/lib/format";

const col = createColumnHelper<DataTableFeatures, AdminUserRow>();

/**
 * Liste servie page par page par l'API : l'identifiant de chaque colonne triable EST la clé de tri acceptée par
 * l'API (`sort=email`). Les colonnes que la base ne sait pas trier déclarent `enableSorting: false` plutôt que de
 * proposer un tri qui ne porterait que sur la page affichée.
 */
const columns = col.columns([
  col.accessor("email", {
    id: "email",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Utilisateur" />,
    enableHiding: false,
    cell: ({ row: { original: u } }) => (
      <>
        <span className="font-medium">
          {u.firstName} {u.lastName}
        </span>
        {u.role === "ADMIN" && (
          <>
            {" "}
            <Pill tone="info">Admin</Pill>
          </>
        )}
        <span className="block text-xs text-muted-foreground">
          {u.email}
          {!u.emailVerified && " · e-mail non vérifié"}
        </span>
      </>
    ),
  }),
  col.accessor("status", {
    id: "status",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Statut" />,
    cell: ({ row }) => <StatusPill kind="user" value={row.original.status} />,
  }),
  col.accessor("credits", {
    id: "credits",
    header: "Crédits",
    enableSorting: false,
    cell: ({ row }) => <span className="tabular-nums">{formatNumber(row.original.credits)}</span>,
  }),
  col.accessor("createdAt", {
    id: "createdAt",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Inscrit le" />,
    cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{formatDateTime(row.original.createdAt)}</span>,
  }),
  col.display({
    id: "open",
    header: "Actions",
    enableHiding: false,
    cell: ({ row: { original: u } }) => (
      <Link href={`/admin/utilisateurs/${u.id}`} className="font-medium text-primary underline underline-offset-4">
        Ouvrir<span className="sr-only"> la fiche de {u.email}</span>
      </Link>
    ),
  }),
]);

export function UsersTable({ page }: { page: Page<AdminUserRow> }) {
  return (
    <ServerDataTable
      caption="Liste des utilisateurs"
      columns={columns}
      items={page.items}
      meta={page}
      search={{ label: "Nom ou e-mail", placeholder: "Nom ou e-mail…" }}
      filters={[
        { param: "status", label: "Statut", options: STATUS_OPTIONS.user },
        {
          param: "role",
          label: "Rôle",
          options: [
            { value: "USER", label: "Client" },
            { value: "ADMIN", label: "Administrateur" },
          ],
        },
      ]}
      columnLabels={{ status: "Statut", credits: "Crédits", createdAt: "Inscrit le" }}
      emptyMessage="Aucun compte."
    />
  );
}
