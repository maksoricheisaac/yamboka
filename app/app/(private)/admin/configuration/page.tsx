import type { Metadata } from "next";
import type { PricingSections } from "@yamboka/shared";
import { ModelCatalogPanel } from "@/components/admin/model-catalog-panel";
import { PricingConfigForm } from "@/components/admin/pricing-config-form";
import { PageHeader, Pill, StatCard, StatGrid } from "@/components/admin/ui";
import { requireUser } from "@/lib/auth";
import { formatFcfa } from "@/lib/format";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Configuration des calculs — Administration" };

/**
 * Tous les paramètres qui décident d'un prix : marges, taux, frais, packs, plafonds, et le catalogue de
 * modèles. Aucun d'eux n'est dans le code, et appliquer une version prend effet sans redéploiement.
 */
export default async function PricingConfigPage() {
  await requireUser({ role: "ADMIN" });
  const sections = await serverGet<PricingSections>("/admin/pricing");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configuration des calculs"
        description="Marges, taux, frais, packs, plafonds et catalogue de modèles. Un changement se prépare, s'aperçoit, puis s'applique : il prend effet immédiatement, sans redéploiement."
      />

      <StatGrid>
        <StatCard
          label="Taux sortant retenu"
          value={`${sections.pricingRate} F/$`}
          hint={sections.rateMeasured ? "mesuré sur les recharges" : "PROVISOIRE : aucune recharge mesurée"}
        />
        <StatCard
          label="Marge visée"
          value={`${Number(sections.current.marginPercent)} %`}
          hint={`minimum accepté ${Number(sections.current.minMarginPercent)} %`}
        />
        <StatCard
          label="Valeur plancher d'un crédit"
          value={`${sections.creditFloorFcfa} F`}
          hint={`${sections.floorFromPack} · ${sections.floorFromMethod}`}
        />
        <StatCard
          label="Validité d'un devis"
          value={`${Math.round(sections.current.quoteValiditySeconds / 60)} min`}
          hint={`achat minimum ${formatFcfa(sections.current.minPurchaseXaf)}`}
        />
      </StatGrid>

      {sections.pessimisticApplied && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Pill tone="warn">Scénario pessimiste appliqué</Pill>
          La configuration est marquée provisoire : les prix sont calculés avec les hypothèses les plus
          défavorables (perte de circuit plancher de 14 %, marge de change 2 %, bonus compté à 100 %). Ne
          décochez « configuration provisoire » qu’une fois le taux sortant réellement mesuré.
        </p>
      )}

      <section aria-labelledby="modeles" className="space-y-3">
        <h2 id="modeles" className="text-xl font-bold">
          Modèles
        </h2>
        <p className="text-sm text-muted-foreground">
          Le catalogue est la seule source du slug, des paramètres envoyés au fournisseur et des tarifs.
          Les identifiants d’API, eux, restent dans les variables d’environnement du serveur.
        </p>
        <ModelCatalogPanel sections={sections} />
      </section>

      <section aria-labelledby="parametres" className="space-y-3">
        <h2 id="parametres" className="text-xl font-bold">
          Paramètres de calcul
        </h2>
        <PricingConfigForm sections={sections} />
      </section>

      <section aria-labelledby="entrees" className="space-y-3">
        <h2 id="entrees" className="text-xl font-bold">
          Ce qui contraint le plancher
        </h2>
        <p className="text-sm text-muted-foreground">
          Le plancher de valeur d’un crédit se calcule sur le pack et le moyen de paiement les MOINS
          favorables parmi ceux ouverts. Les frais entrants viennent de la grille du compte chez
          l’encaisseur ; la grille publique n’est qu’un plancher (« dès X % »).
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 rounded-3xl bg-card p-4 shadow-card">
            <h3 className="font-bold">Packs publiés</h3>
            <ul className="space-y-1 text-sm">
              {sections.packs.map((p) => (
                <li key={p.name}>
                  {p.name} : {formatFcfa(p.priceFcfa)} pour {p.credits} crédits
                  {p.bonusCredits > 0 ? ` (+ ${p.bonusCredits} offerts)` : ""}
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-2 rounded-3xl bg-card p-4 shadow-card">
            <h3 className="font-bold">Moyens de paiement ouverts</h3>
            <ul className="space-y-1 text-sm">
              {sections.paymentMethods.map((m) => (
                <li key={m.label}>
                  {m.label} :{" "}
                  {m.tierCount === 0
                    ? "aucun frais (fournisseur simulé)"
                    : `${m.tierCount} palier(s), dès ${m.firstTierPercent} %`}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
