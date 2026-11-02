"use client";

import { createColumnHelper } from "@tanstack/react-table";
import type { AdminUserRow } from "@yamboka/shared";
import Link from "next/link";
import { DataTable, SortableHeader } from "@/components/admin/data-table/data-table";
import type { DataTableFeatures } from "@/components/admin/data-table/features";
import { Pill, StatusPill } from "@/components/admin/ui";
import { formatDateTime, formatNumber } from "@/lib/format";

const col = createColumnHelper<DataTableFeatures, AdminUserRow>();

const columns = col.columns([
  col.accessor((u) => `${u.firstName} ${u.lastName}`, {
    id: "user",
    header: ({ column }) => <SortableHeader column={column} title="Utilisateur" />,
    sortFn: "text",
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
    header: ({ column }) => <SortableHeader column={column} title="Statut" />,
    sortFn: "text",
    cell: ({ row }) => <StatusPill kind="user" value={row.original.status} />,
  }),
  col.accessor("credits", {
    id: "credits",
    header: ({ column }) => <SortableHeader column={column} title="Crédits" />,
    sortFn: "basic",
    cell: ({ row }) => <span className="tabular-nums">{formatNumber(row.original.credits)}</span>,
  }),
  col.accessor("createdAt", {
    id: "createdAt",
    header: ({ column }) => <SortableHeader column={column} title="Inscrit le" />,
    sortFn: "text",
    cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{formatDateTime(row.original.createdAt)}</span>,
  }),
  col.display({
    id: "open",
    header: "Actions",
    enableHiding: false,
    cell: ({ row: { original: u } }) => (
      <div className="text-right">
        <Link href={`/admin/utilisateurs/${u.id}`} className="font-medium text-primary underline underline-offset-4">
          Ouvrir<span className="sr-only"> la fiche de {u.email}</span>
        </Link>
      </div>
    ),
  }),
]);

/**
 * La recherche, les filtres et la pagination restent côté serveur (la liste complète n'est pas chargée) :
 * le tableau apporte le tri et le choix des colonnes sur la page affichée.
 */
export function UsersTable({ users }: { users: AdminUserRow[] }) {
  return (
    <DataTable
      caption="Liste des utilisateurs"
      columns={columns}
      data={users}
      paginate={false}
      columnLabels={{ status: "Statut", credits: "Crédits", createdAt: "Inscrit le" }}
    />
  );
}
