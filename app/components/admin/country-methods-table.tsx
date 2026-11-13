"use client";

import { createColumnHelper } from "@tanstack/react-table";
import type { AdminCountryDetail } from "@yamboka/shared";
import { CATALOG_STATUS_LABELS } from "@yamboka/shared";
import { ActionDialog } from "@/components/admin/action-dialog";
import { CountryStatusPill } from "@/components/admin/country-status";
import { DataTableColumnHeader } from "@/components/admin/data-table/data-table-column-header";
import { DataTable } from "@/components/admin/data-table/data-table";
import type { DataTableFeatures } from "@/components/admin/data-table/data-table-features";
import { Pill } from "@/components/admin/ui";

type Method = AdminCountryDetail["methods"][number];
/** Le nom et le code du pays accompagnent chaque ligne : les colonnes restent définies une seule fois, hors du composant. */
type MethodRow = Method & { countryIso: string; countryName: string };

const STATUS_OPTIONS = (["ACTIVE", "COMING_SOON", "DISABLED"] as const).map((s) => ({ value: s, label: CATALOG_STATUS_LABELS[s] }));
const TYPE_LABELS = { MOBILE_MONEY: "Mobile money", CARD: "Carte bancaire", BANK_TRANSFER: "Virement" } as const;

const col = createColumnHelper<DataTableFeatures, MethodRow>();

const columns = col.columns([
  col.accessor("name", {
    id: "name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Moyen" />,
    sortFn: "text",
    enableHiding: false,
    cell: ({ row: { original: m } }) => (
      <span className="font-medium">
        {m.name}
        {m.feeNote && <span className="block text-xs font-normal text-muted-foreground">Frais indicatifs : {m.feeNote}</span>}
        {m.note && <span className="block text-xs font-normal text-muted-foreground">{m.note}</span>}
      </span>
    ),
  }),
  col.accessor((m) => TYPE_LABELS[m.type], {
    id: "type",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
    sortFn: "text",
  }),
  col.accessor((m) => m.saspayNetwork ?? "", {
    id: "network",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Réseau SasPay" />,
    sortFn: "text",
    cell: ({ row }) => <span className="font-mono text-xs">{row.original.saspayNetwork ?? "—"}</span>,
  }),
  col.accessor((m) => CATALOG_STATUS_LABELS[m.status], {
    id: "status",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Statut" />,
    sortFn: "text",
    cell: ({ row: { original: m } }) => (
      <>
        <CountryStatusPill status={m.status} />
        {m.blocker && (
          <span className="mt-1 block max-w-64 text-xs text-muted-foreground">
            <Pill tone="neutral">Non activable</Pill> {m.blocker}
          </span>
        )}
      </>
    ),
  }),
  col.display({
    id: "actions",
    header: "Actions",
    enableHiding: false,
    cell: ({ row: { original: m } }) => (
      <ActionDialog
        trigger="Statut"
        triggerLabel={`Changer le statut de ${m.name}`}
        title={`${m.name} · ${m.countryName}`}
        description={m.blocker ? `Ce moyen ne peut pas être activé : ${m.blocker}` : "Statut propre à ce moyen dans ce pays."}
        endpoint={`/admin/countries/${m.countryIso}/methods/${m.methodCode}/status`}
        fields={[{ name: "status", label: "Nouveau statut", type: "select", defaultValue: m.status, options: STATUS_OPTIONS }]}
      />
    ),
  }),
]);

export function CountryMethodsTable({ iso, name, methods }: { iso: string; name: string; methods: Method[] }) {
  return (
    <DataTable
      caption={`Moyens de paiement de ${name}`}
      columns={columns}
      data={methods.map((m) => ({ ...m, countryIso: iso, countryName: name }))}
      minWidth="48rem"
      paginate={false}
      columnLabels={{ type: "Type", network: "Réseau SasPay", status: "Statut" }}
      emptyMessage="Aucun moyen de paiement pour ce pays."
    />
  );
}
