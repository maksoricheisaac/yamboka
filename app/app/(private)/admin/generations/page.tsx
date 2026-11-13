import type { Metadata } from "next";
import type { AdminGenerationRow, AdminPreset, Page } from "@yamboka/shared";
import { GenerationsTable } from "@/components/admin/generations-table";
import { Empty, FilterBar, FilterDateRange, FilterField, FilterSelect, PageHeader, Pager, STATUS_OPTIONS, flat, listQuery } from "@/components/admin/ui";
import { requireUser } from "@/lib/auth";
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
      <PageHeader title="Générations et modération" />
      <FilterBar reset="/admin/generations">
        <FilterField label="E-mail du client" name="q" defaultValue={sp.q} placeholder="client@…" />
        <FilterSelect label="Statut" name="status" value={sp.status} options={STATUS_OPTIONS.generation} />
        <FilterSelect label="Preset" name="presetId" value={sp.presetId} options={presets.map((p) => ({ value: p.id, label: p.name }))} />
        <FilterDateRange from={sp.from} to={sp.to} />
      </FilterBar>
      {data.items.length === 0 ? (
        <Empty title="Aucune génération">Aucune création ne correspond. La génération de vidéos et d’images n’est pas encore ouverte aux clients : cette liste se remplira à l’ouverture.</Empty>
      ) : (
        <GenerationsTable generations={data.items} />
      )}
      <Pager page={data.page} total={data.total} pageSize={data.pageSize} path="/admin/generations" params={sp} />
    </div>
  );
}
