import type { Metadata } from "next";
import type { AdminGenerationRow, AdminPreset, Page } from "@yamboka/shared";
import { ActionDialog } from "@/components/admin/action-dialog";
import { DataTable, Empty, FilterBar, FilterDateRange, FilterField, FilterSelect, PageHeader, Pager, Pill, STATUS_OPTIONS, StatusPill, Td, Th, flat, listQuery } from "@/components/admin/ui";
import { requireUser } from "@/lib/auth";
import { formatDateTime, formatNumber } from "@/lib/format";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Générations — Administration" };

export default async function GenerationsPage({ searchParams }: PageProps<"/admin/generations">) {
  await requireUser({ role: "ADMIN" });
  const sp = flat(await searchParams);
  const [data, presets] = await Promise.all([
    serverGet<Page<AdminGenerationRow>>(`/admin/generations${listQuery(sp, ["presetId"])}`),
    serverGet<AdminPreset[]>("/admin/presets"),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Générations et modération" description="Toutes les créations, filtrables. Masquer une création la retire de l’espace du client et consigne le motif." />
      <FilterBar reset="/admin/generations">
        <FilterField label="E-mail du client" name="q" defaultValue={sp.q} placeholder="client@…" />
        <FilterSelect label="Statut" name="status" value={sp.status} options={STATUS_OPTIONS.generation} />
        <FilterSelect label="Preset" name="presetId" value={sp.presetId} options={presets.map((p) => ({ value: p.id, label: p.name }))} />
        <FilterDateRange from={sp.from} to={sp.to} />
      </FilterBar>
      {data.items.length === 0 ? (
        <Empty title="Aucune génération">Aucune création ne correspond. La génération de vidéos et d’images n’est pas encore ouverte aux clients : cette liste se remplira à l’ouverture.</Empty>
      ) : (
        <DataTable caption="Liste des générations">
          <thead><tr><Th>Date</Th><Th>Client</Th><Th>Produit</Th><Th>Coût</Th><Th>État</Th><Th className="text-right">Actions</Th></tr></thead>
          <tbody>
            {data.items.map((g) => (
              <tr key={g.id}>
                <Td className="whitespace-nowrap text-muted-foreground">{formatDateTime(g.createdAt)}</Td>
                <Td>{g.user.email}</Td>
                <Td>{g.product}{g.preset && <span className="block text-xs text-muted-foreground">{g.preset}</span>}</Td>
                <Td>{formatNumber(g.creditsCost)} cr.</Td>
                <Td><StatusPill kind="generation" value={g.status} />{g.hidden && <> <Pill tone="warn">Masquée</Pill></>}</Td>
                <Td className="text-right">
                  <ActionDialog
                    trigger={g.hidden ? "Ré-afficher" : "Masquer"}
                    triggerLabel={`${g.hidden ? "Ré-afficher" : "Masquer"} la création de ${g.user.email}`}
                    title={g.hidden ? "Ré-afficher cette création" : "Masquer cette création"}
                    endpoint={`/admin/generations/${g.id}/hide`}
                    fixed={{ hidden: !g.hidden }}
                    submitLabel={g.hidden ? "Ré-afficher" : "Masquer"}
                    destructive={!g.hidden}
                  />
                </Td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
      <Pager page={data.page} total={data.total} pageSize={data.pageSize} path="/admin/generations" params={sp} />
    </div>
  );
}
