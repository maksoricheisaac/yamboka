import type { Metadata } from "next";
import type { AdminReportRow, Page } from "@yamboka/shared";
import { ReportsTable } from "@/components/admin/reports-table";
import { Empty, FilterBar, FilterSelect, PageHeader, Pager, STATUS_OPTIONS, flat, listQuery } from "@/components/admin/ui";
import { requireUser } from "@/lib/auth";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Réclamations — Administration" };

export default async function ReportsPage({ searchParams }: PageProps<"/admin/signalements">) {
  await requireUser({ role: "ADMIN" });
  const sp = flat(await searchParams);
  const data = await serverGet<Page<AdminReportRow>>(`/admin/reports${listQuery(sp)}`);

  return (
    <div className="space-y-6">
      <PageHeader title="Réclamations et signalements" />
      <FilterBar reset="/admin/signalements">
        <FilterSelect label="État" name="status" value={sp.status} options={STATUS_OPTIONS.report} />
      </FilterBar>
      {data.items.length === 0 ? (
        <Empty title="Aucun signalement">Les signalements et réclamations envoyés par les clients apparaîtront ici. Le formulaire côté client sera ouvert avec le module de création.</Empty>
      ) : (
        <ReportsTable reports={data.items} />
      )}
      <Pager page={data.page} total={data.total} pageSize={data.pageSize} path="/admin/signalements" params={sp} />
    </div>
  );
}
