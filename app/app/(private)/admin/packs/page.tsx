import type { Metadata } from "next";
import type { AdminPackPage } from "@yamboka/shared";
import { ActionDialog } from "@/components/admin/action-dialog";
import { PacksTable } from "@/components/admin/packs-table";
import { PageHeader, Pill, StatCard, StatGrid, flat, listQuery } from "@/components/admin/ui";
import { requireUser } from "@/lib/auth";
import { formatFcfa } from "@/lib/format";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Packs de crédits — Administration" };

export default async function PacksPage({ searchParams }: PageProps<"/admin/packs">) {
  await requireUser({ role: "ADMIN" });
  const sp = flat(await searchParams);
  // `summary` est calculée par l’API sur TOUS les packs : ni la page affichée, ni les filtres ne la changent.
  const page = await serverGet<AdminPackPage>(`/admin/packs${listQuery(sp)}`);
  const { summary } = page;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Packs de crédits"
        description="Prix, crédits, marges et publication sur les pages publiques."
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
        <StatCard label="Packs" value={summary.total} hint="catalogue complet" />
        <StatCard
          label="Actifs (vendus)"
          value={summary.active}
          hint={summary.belowMargin > 0 ? `${summary.belowMargin} sous la marge minimale` : "tous au-dessus de la marge minimale"}
        />
        <StatCard label="Inactifs" value={summary.total - summary.active} hint="jamais proposés à l’achat" />
        <StatCard label="Offres publiques" value={`${summary.publicVisible} / 3`} hint="affichées sur la page Tarifs" />
      </StatGrid>

      <section aria-labelledby="public" className="space-y-2 rounded-3xl bg-card shadow-card p-4">
        <h2 id="public" className="font-semibold">Offre affichée sur les pages publiques ({summary.publicVisible}/3)</h2>
        {summary.publicVisible === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun pack public : la page Tarifs n’affiche aucune offre.</p>
        ) : (
          <ul className="flex flex-wrap gap-2 text-sm">
            {summary.publicPacks.map((p) => (
              <li key={p.id}>
                <Pill tone={p.featured ? "ok" : "neutral"}>
                  {p.name} · {formatFcfa(p.priceFcfa)}
                  {p.featured ? " · recommandé" : ""}
                </Pill>
              </li>
            ))}
          </ul>
        )}
      </section>

      <PacksTable page={page} />
    </div>
  );
}
