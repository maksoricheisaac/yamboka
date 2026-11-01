import type { Metadata } from "next";
import type { AdminStats, AdminUserRow, Page } from "@yamboka/shared";
import { Empty, FilterBar, FilterField, FilterSelect, PageHeader, Pager, STATUS_OPTIONS, StatCard, StatGrid, flat, listQuery } from "@/components/admin/ui";
import { UsersTable } from "@/components/admin/users-table";
import { requireUser } from "@/lib/auth";
import { formatNumber } from "@/lib/format";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Utilisateurs — Administration" };

const STATS_DAYS = 30;

export default async function UsersPage({ searchParams }: PageProps<"/admin/utilisateurs">) {
  await requireUser({ role: "ADMIN" });
  const sp = flat(await searchParams);
  const [data, stats] = await Promise.all([
    serverGet<Page<AdminUserRow>>(`/admin/users${listQuery(sp, ["role"])}`),
    serverGet<AdminStats>(`/admin/stats?days=${STATS_DAYS}`),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Utilisateurs" description="Recherchez un client, consultez sa fiche, suspendez-le ou ajustez ses crédits." />
      <StatGrid>
        <StatCard label="Utilisateurs" value={formatNumber(stats.users.total)} hint={`${stats.users.suspended} suspendu${stats.users.suspended > 1 ? "s" : ""} · ${stats.users.banned} banni${stats.users.banned > 1 ? "s" : ""}`} />
        <StatCard label="Nouveaux" value={formatNumber(stats.users.newInPeriod)} hint={`${STATS_DAYS} derniers jours`} />
        <StatCard label="Actifs" value={formatNumber(stats.users.activeInPeriod)} hint={`${STATS_DAYS} derniers jours`} />
      </StatGrid>
      <FilterBar reset="/admin/utilisateurs">
        <FilterField label="Nom ou e-mail" name="q" defaultValue={sp.q} placeholder="Rechercher…" />
        <FilterSelect label="Statut" name="status" value={sp.status} options={STATUS_OPTIONS.user} />
        <FilterSelect label="Rôle" name="role" value={sp.role} options={[{ value: "USER", label: "Client" }, { value: "ADMIN", label: "Administrateur" }]} />
      </FilterBar>

      {data.items.length === 0 ? (
        <Empty title="Aucun utilisateur">Aucun compte ne correspond à ces critères.</Empty>
      ) : (
        <UsersTable users={data.items} />
      )}
      <Pager page={data.page} total={data.total} pageSize={data.pageSize} path="/admin/utilisateurs" params={sp} />
    </div>
  );
}
