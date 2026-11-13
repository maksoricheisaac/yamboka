import type { Metadata } from "next";
import type { AdminReportRow, Page } from "@yamboka/shared";
import { REPORT_REASONS } from "@yamboka/shared";
import { ReportsTable } from "@/components/admin/reports-table";
import { PageHeader, flat, listQuery } from "@/components/admin/ui";
import { requireUser } from "@/lib/auth";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Réclamations — Administration" };

export default async function ReportsPage({ searchParams }: PageProps<"/admin/signalements">) {
  await requireUser({ role: "ADMIN" });
  const sp = flat(await searchParams);
  const page = await serverGet<Page<AdminReportRow>>(`/admin/reports${listQuery(sp, ["reason"])}`);

  return (
    <div className="space-y-6">
      <PageHeader title="Réclamations et signalements" description="Ce que les clients signalent, et la décision prise." />
      <ReportsTable page={page} reasons={REPORT_REASONS.map((r) => ({ value: r, label: r }))} />
    </div>
  );
}
