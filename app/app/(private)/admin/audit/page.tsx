import type { Metadata } from "next";
import type { AdminAccount, AdminAuditPage } from "@yamboka/shared";
import { AuditTable } from "@/components/admin/audit-table";
import { PageHeader, StatCard, StatGrid, flat, listQuery } from "@/components/admin/ui";
import { requireUser } from "@/lib/auth";
import { formatNumber } from "@/lib/format";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Journal d’audit — Administration" };

export default async function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  await requireUser({ role: "ADMIN" });
  const sp = flat(await searchParams);
  // La synthèse est calculée sur TOUT le journal (jamais sur la page affichée) et ne dépend pas des filtres.
  const [page, admins] = await Promise.all([
    serverGet<AdminAuditPage>(`/admin/audit${listQuery(sp, ["actor", "entity"])}`),
    serverGet<AdminAccount[]>("/admin/admins"),
  ]);
  const { summary } = page;

  return (
    <div className="space-y-6">
      <PageHeader title="Journal d’audit" description="Trace de toutes les actions sensibles, en lecture seule." />
      <StatGrid>
        <StatCard label="Événements" value={formatNumber(summary.total)} hint="depuis l’ouverture du journal" />
        <StatCard label="Aujourd’hui" value={formatNumber(summary.today)} hint="depuis minuit (UTC)" />
        <StatCard label="Actions d’administrateurs" value={formatNumber(summary.byAdmin)} hint="un administrateur identifié" />
        <StatCard label="Actions système" value={formatNumber(summary.bySystem)} hint="webhooks et tâches automatiques" />
      </StatGrid>
      <AuditTable page={page} admins={admins.map((a) => ({ value: a.email, label: a.email }))} />
    </div>
  );
}
