import type { Metadata } from "next";
import type { AdminStats, AdminUserRow, Page } from "@yamboka/shared";
import { PageHeader, StatCard, StatGrid, flat, listQuery } from "@/components/admin/ui";
import { UsersTable } from "@/components/admin/users-table";
import { requireUser } from "@/lib/auth";
import { formatNumber } from "@/lib/format";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Utilisateurs — Administration" };

const STATS_DAYS = 30;

export default async function UsersPage({ searchParams }: PageProps<"/admin/utilisateurs">) {
  await requireUser({ role: "ADMIN" });
  const sp = flat(await searchParams);
  // Les indicateurs portent sur TOUS les comptes : ils viennent du tableau de bord, jamais de la page affichée.
  const [page, stats] = await Promise.all([
    serverGet<Page<AdminUserRow>>(`/admin/users${listQuery(sp, ["role"])}`),
    serverGet<AdminStats>(`/admin/stats?days=${STATS_DAYS}`),
  ]);
  const blocked = stats.users.suspended + stats.users.banned;

  return (
    <div className="space-y-6">
      <PageHeader title="Utilisateurs" description="Comptes clients et administrateurs, leurs crédits et leur état." />
      <StatGrid>
        <StatCard label="Comptes" value={formatNumber(stats.users.total)} hint="tous statuts confondus" />
        <StatCard label="Actifs" value={formatNumber(stats.users.activeInPeriod)} hint={`${STATS_DAYS} derniers jours`} />
        <StatCard label="Suspendus ou bannis" value={formatNumber(blocked)} hint={`${stats.users.suspended} suspendu(s) · ${stats.users.banned} banni(s)`} />
        <StatCard label="Nouveaux" value={formatNumber(stats.users.newInPeriod)} hint={`${STATS_DAYS} derniers jours`} />
      </StatGrid>
      <UsersTable page={page} />
    </div>
  );
}
