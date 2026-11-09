import type { Metadata } from "next";
import type { AdminCountryRow, AdminCountrySummary, Page } from "@yamboka/shared";
import { CATALOG_STATUS_LABELS } from "@yamboka/shared";
import Link from "next/link";
import { CountryStatusPill } from "@/components/admin/country-status";
import { ActionDialog } from "@/components/admin/action-dialog";
import { Empty, FilterBar, StatCard, StatGrid, FilterField, FilterSelect, PageHeader, Pager, flat, listQuery } from "@/components/admin/ui";
import { requireUser } from "@/lib/auth";
import { flagOf } from "@/lib/flags";
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
        <div className="relative overflow-x-auto rounded-3xl bg-card shadow-card">
          <table className="w-full min-w-[56rem] text-left text-sm">
            <caption className="sr-only">Pays intégrés et leur statut</caption>
            <thead>
              <tr className="[&>th]:border-b [&>th]:bg-muted [&>th]:px-4 [&>th]:py-3 [&>th]:font-semibold">
                <th scope="col">Pays</th>
                <th scope="col">ISO</th>
                <th scope="col">Devise</th>
                <th scope="col">Moyens</th>
                <th scope="col">Statut</th>
                <th scope="col">Frais indicatifs</th>
                <th scope="col" className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((c) => (
                <tr key={c.iso} className="hover:bg-muted/40 [&>td]:border-b [&>td]:px-4 [&>td]:py-3">
                  <td className="font-medium">
                    <span aria-hidden className="mr-2 text-lg">{flagOf(c.iso)}</span>
                    {c.name}
                  </td>
                  <td className="font-mono text-xs">{c.iso}</td>
                  <td>{c.currency}</td>
                  <td className="tabular-nums">
                    {c.activeMethodCount} actif{c.activeMethodCount > 1 ? "s" : ""} / {c.methodCount}
                    <span className="block text-xs font-normal text-muted-foreground">{c.methodNames.join(", ")}</span>
                  </td>
                  <td>
                    <CountryStatusPill status={c.status} />
                    {!c.sellable && <span className="block text-xs text-muted-foreground">Tarification {c.currency} à configurer</span>}
                  </td>
                  <td className="text-muted-foreground">{c.feeNote ?? "—"}</td>
                  <td className="text-right">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <ActionDialog
                        trigger="Statut"
                        triggerLabel={`Changer le statut de ${c.name}`}
                        title={`Statut de ${c.name}`}
                        description="Actif : ouvert. Bientôt disponible : visible, non sélectionnable. Désactivé : jamais proposé."
                        endpoint={`/admin/countries/${c.iso}/status`}
                        fields={[{ name: "status", label: "Nouveau statut", type: "select", defaultValue: c.status, options: STATUS_OPTIONS }]}
                      />
                      <Link href={`/admin/pays/${c.iso}`} className="font-medium text-primary underline underline-offset-4">
                        Ouvrir<span className="sr-only"> la fiche de {c.name}</span>
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={data.page} total={data.total} pageSize={data.pageSize} path="/admin/pays" params={sp} />
    </div>
  );
}
