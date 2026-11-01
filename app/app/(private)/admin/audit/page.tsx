import type { Metadata } from "next";
import type { AuditRow, Page } from "@yamboka/shared";
import { AuditTable } from "@/components/admin/audit-table";
import { Empty, FilterBar, FilterDateRange, FilterField, PageHeader, Pager, flat, listQuery } from "@/components/admin/ui";
import { requireUser } from "@/lib/auth";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Journal d’audit — Administration" };

export default async function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  await requireUser({ role: "ADMIN" });
  const sp = flat(await searchParams);
  const data = await serverGet<Page<AuditRow>>(`/admin/audit${listQuery(sp)}`);

  return (
    <div className="space-y-6">
      <PageHeader title="Journal d’audit" description="Opérations sensibles : qui, quand, sur quoi, avec les valeurs avant et après et le motif. Le journal est en ajout seul." />
      <FilterBar reset="/admin/audit">
        <FilterField label="Action, entité ou acteur" name="q" defaultValue={sp.q} placeholder="pack.update, admin@…" />
        <FilterDateRange from={sp.from} to={sp.to} />
      </FilterBar>
      {data.items.length === 0 ? <Empty title="Aucune entrée" /> : <AuditTable rows={data.items} />}
      <Pager page={data.page} total={data.total} pageSize={data.pageSize} path="/admin/audit" params={sp} />
    </div>
  );
}
