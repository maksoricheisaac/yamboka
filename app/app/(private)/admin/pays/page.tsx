import type { Metadata } from "next";
import type { AdminCountryRow, AdminCountrySummary, Page } from "@yamboka/shared";
import { CountriesTable } from "@/components/admin/countries-table";
import { PageHeader, StatCard, StatGrid, flat, listQuery } from "@/components/admin/ui";
import { requireUser } from "@/lib/auth";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Pays et paiements — Administration" };

export default async function CountriesPage({ searchParams }: PageProps<"/admin/pays">) {
  await requireUser({ role: "ADMIN" });
  const sp = flat(await searchParams);
  // La synthèse porte sur tout le catalogue ; la page, elle, ne montre qu’une tranche filtrée.
  const [page, summary] = await Promise.all([
    serverGet<Page<AdminCountryRow>>(`/admin/countries${listQuery(sp)}`),
    serverGet<AdminCountrySummary>("/admin/countries/summary"),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Pays et paiements" description="Pays intégrés, moyens de paiement ouverts et tarification par devise." />
      <StatGrid>
        <StatCard label="Pays" value={summary.total} hint="catalogue complet" />
        <StatCard label="Actifs" value={summary.active} hint="ouverts au paiement" />
        <StatCard label="Bientôt disponibles" value={summary.comingSoon} hint="visibles, non sélectionnables" />
        <StatCard label="Désactivés" value={summary.disabled} hint="jamais proposés" />
      </StatGrid>
      <CountriesTable page={page} />
    </div>
  );
}
