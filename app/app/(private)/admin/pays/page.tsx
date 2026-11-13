import type { Metadata } from "next";
import type { AdminCountryRow, AdminCountrySummary, Page } from "@yamboka/shared";
import { CATALOG_STATUS_LABELS } from "@yamboka/shared";
import { CountriesTable } from "@/components/admin/countries-table";
import { Empty, FilterBar, StatCard, StatGrid, FilterField, FilterSelect, PageHeader, Pager, flat, listQuery } from "@/components/admin/ui";
import { requireUser } from "@/lib/auth";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Pays et paiements — Administration" };

const STATUS_OPTIONS = (["ACTIVE", "COMING_SOON", "DISABLED"] as const).map((s) => ({ value: s, label: CATALOG_STATUS_LABELS[s] }));

export default async function CountriesPage({ searchParams }: PageProps<"/admin/pays">) {
  await requireUser({ role: "ADMIN" });
  const sp = flat(await searchParams);
  const [data, summary] = await Promise.all([
    serverGet<Page<AdminCountryRow>>(`/admin/countries${listQuery(sp)}`),
    serverGet<AdminCountrySummary>("/admin/countries/summary"),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pays et paiements"
      />
      <StatGrid>
        <StatCard label="Pays actifs" value={summary.active} hint={`sur ${summary.total}`} />
        <StatCard label="Bientôt disponibles" value={summary.comingSoon} />
        <StatCard label="Désactivés" value={summary.disabled} />
      </StatGrid>
      <FilterBar reset="/admin/pays">
        <FilterField label="Nom, code ISO ou devise" name="q" defaultValue={sp.q} placeholder="Rwanda, RW, RWF…" />
        <FilterSelect label="Statut" name="status" value={sp.status} options={STATUS_OPTIONS} />
      </FilterBar>

      {data.items.length === 0 ? (
        <Empty title="Aucun pays">Aucun pays ne correspond à ces critères.</Empty>
      ) : (
        <CountriesTable countries={data.items} />
      )}
      <Pager page={data.page} total={data.total} pageSize={data.pageSize} path="/admin/pays" params={sp} />
    </div>
  );
}
