import type { Metadata } from "next";
import type { AdminPackPage } from "@yamboka/shared";
import { ActionDialog } from "@/components/admin/action-dialog";
import { PacksTable } from "@/components/admin/packs-table";
import { Empty, FilterBar, FilterField, FilterSelect, PageHeader, Pager, Pill, StatCard, StatGrid, flat, listQuery } from "@/components/admin/ui";
import { requireUser } from "@/lib/auth";
import { formatFcfa } from "@/lib/format";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Packs de crédits — Administration" };

export default async function PacksPage({ searchParams }: PageProps<"/admin/packs">) {
  await requireUser({ role: "ADMIN" });
  const sp = flat(await searchParams);
  const data = await serverGet<AdminPackPage>(`/admin/packs${listQuery(sp)}`);
  const packs = data.items;
  const { summary } = data;
  const publicPacks = summary.publicPacks;
  const underMargin = summary.belowMargin;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Packs de crédits"
        actions={
          <ActionDialog
            trigger="Nouveau pack"
            triggerVariant="default"
            title="Nouveau pack"
            description="Créé inactif et non public."
            endpoint="/admin/packs"
            fields={[
              { name: "name", label: "Nom", type: "text" },
              { name: "price", label: "Prix (FCFA)", type: "number" },
              { name: "credits", label: "Crédits de base", type: "number" },
              { name: "bonusPercent", label: "Bonus (%)", type: "number", defaultValue: 0 },
            ]}
            submitLabel="Créer le pack"
          />
        }
      />

      <StatGrid>
        <StatCard label="Packs" value={summary.total} hint={`${summary.total - summary.active} inactif${summary.total - summary.active > 1 ? "s" : ""}`} />
        <StatCard label="Packs actifs (vendus)" value={summary.active} hint={underMargin > 0 ? `${underMargin} sous la marge minimale` : "Tous au-dessus de la marge minimale"} />
        <StatCard label="Offres publiques" value={`${summary.publicVisible} / 3`} hint="Affichées sur la page Tarifs" />
      </StatGrid>

      <section aria-labelledby="public" className="space-y-2 rounded-2xl border bg-card p-4">
        <h2 id="public" className="font-semibold">Offre affichée sur les pages publiques ({summary.publicVisible}/3)</h2>
        {summary.publicVisible === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun pack public : la page Tarifs n’affiche aucune offre.</p>
        ) : (
          <ul className="flex flex-wrap gap-2 text-sm">
            {publicPacks.map((p) => (
              <li key={p.id}>
                <Pill tone={p.featured ? "ok" : "neutral"}>{p.name} · {formatFcfa(p.priceFcfa)}{p.featured ? " · recommandé" : ""}</Pill>
              </li>
            ))}
          </ul>
        )}
      </section>

      <FilterBar reset="/admin/packs">
        <FilterField label="Nom du pack" name="q" defaultValue={sp.q} />
        <FilterSelect label="Statut" name="status" value={sp.status} options={[{ value: "active", label: "Actifs" }, { value: "inactive", label: "Inactifs" }]} />
      </FilterBar>
      {packs.length === 0 ? <Empty title="Aucun pack">Aucun pack ne correspond à ces critères.</Empty> : <PacksTable packs={packs} />}
      <Pager page={data.page} total={data.total} pageSize={data.pageSize} path="/admin/packs" params={sp} />
    </div>
  );
}
