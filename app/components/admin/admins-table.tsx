"use client";

import { createColumnHelper } from "@tanstack/react-table";
import type { AdminAccount } from "@yamboka/shared";
import { ActionDialog } from "@/components/admin/action-dialog";
import { DataTableColumnHeader } from "@/components/admin/data-table/data-table-column-header";
import { DataTable } from "@/components/admin/data-table/data-table";
import type { DataTableFeatures } from "@/components/admin/data-table/data-table-features";
import { formatDateTime } from "@/lib/format";

/** Le compte connecté est marqué dans la ligne : les colonnes restent définies une seule fois, hors du composant. */
type AdminRow = AdminAccount & { isMe: boolean };

const col = createColumnHelper<DataTableFeatures, AdminRow>();

const columns = col.columns([
  col.accessor((a) => `${a.firstName} ${a.lastName}`, {
    id: "name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Nom" />,
    sortFn: "text",
    enableHiding: false,
    cell: ({ row: { original: a } }) => (
      <span className="font-medium">
        {a.firstName} {a.lastName}
        {a.isMe && <span className="ml-2 text-xs font-normal text-muted-foreground">(vous)</span>}
      </span>
    ),
  }),
  col.accessor("email", {
    id: "email",
    header: ({ column }) => <DataTableColumnHeader column={column} title="E-mail" />,
    sortFn: "text",
  }),
  col.accessor("createdAt", {
    id: "createdAt",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Depuis le" />,
    sortFn: "text",
    cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{formatDateTime(row.original.createdAt)}</span>,
  }),
  col.display({
    id: "actions",
    header: "Actions",
    enableHiding: false,
    cell: ({ row: { original: a } }) =>
      a.isMe ? null : (
        <ActionDialog
          trigger="Retirer l’accès"
          triggerLabel={`Retirer l’accès de ${a.email}`}
          title={`Retirer l’accès de ${a.email}`}
          description="Le compte redevient un compte client. Il reste toujours au moins un administrateur."
          endpoint={`/admin/admins/${a.id}/demote`}
          submitLabel="Retirer l’accès"
          destructive
        />
      ),
  }),
]);

export function AdminsTable({ admins, meId }: { admins: AdminAccount[]; meId: string }) {
  return (
    <DataTable
      caption="Comptes administrateurs"
      columns={columns}
      data={admins.map((a) => ({ ...a, isMe: a.id === meId }))}
      minWidth="32rem"
      paginate={false}
      columnLabels={{ email: "E-mail", createdAt: "Depuis le" }}
      emptyMessage="Aucun administrateur."
    />
  );
}
