"use client";

import type { PricingSections } from "@yamboka/shared";
import { ModelCatalogPanel } from "@/components/admin/model-catalog-panel";
import { PricingConfigForm } from "@/components/admin/pricing-config-form";
import { PricingHistoryTable } from "@/components/admin/pricing-history-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatFcfa } from "@/lib/format";

const TRIGGER =
  "h-11 flex-none rounded-none px-3 group-data-[orientation=horizontal]/tabs:after:bottom-0 focus-visible:ring-inset";

/**
 * Trois choses à faire sur cette page, donc trois onglets : régler les calculs, gérer le catalogue de
 * modèles, relire l'historique. Tout empiler sur une seule colonne donnait une page qu'on ne finissait pas.
 */
export function ConfigTabs({ sections }: { sections: PricingSections }) {
  const unpriced = sections.models.filter((m) => m.missingPrices > 0).length;

  return (
    <Tabs defaultValue="calculs">
      <TabsList
        variant="line"
        className="w-full justify-start gap-1 overflow-x-auto rounded-none border-b p-0 group-data-[orientation=horizontal]/tabs:h-auto"
      >
        <TabsTrigger value="calculs" className={TRIGGER}>
          Paramètres de calcul
        </TabsTrigger>
        <TabsTrigger value="modeles" className={TRIGGER}>
          Modèles <span className="text-muted-foreground">({sections.models.length})</span>
          {unpriced > 0 && (
            <span className="grid min-w-5 place-items-center rounded-full bg-warning/15 px-1.5 text-xs font-semibold text-warning">
              {unpriced}
              <span className="sr-only"> modèle(s) sans tarif</span>
            </span>
          )}
        </TabsTrigger>
        <TabsTrigger value="historique" className={TRIGGER}>
          Historique <span className="text-muted-foreground">({sections.history.length})</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="calculs" className="space-y-6 pt-6">
        <PricingConfigForm sections={sections} />
        <FloorPanel sections={sections} />
      </TabsContent>

      <TabsContent value="modeles" className="pt-6">
        <ModelCatalogPanel sections={sections} />
      </TabsContent>

      <TabsContent value="historique" className="space-y-3 pt-6">
        <p className="text-xs text-muted-foreground">
          Rien n’est modifié ni supprimé : revenir en arrière crée une version qui recopie l’ancienne.
        </p>
        <PricingHistoryTable sections={sections} />
      </TabsContent>
    </Tabs>
  );
}

/** Ce qui fixe le plancher : le pack et le moyen de paiement les MOINS favorables parmi ceux ouverts. */
function FloorPanel({ sections }: { sections: PricingSections }) {
  return (
    <section aria-labelledby="plancher" className="space-y-3 rounded-2xl bg-card p-4 shadow-card">
      <div>
        <h3 id="plancher" className="text-sm font-semibold">
          Ce qui contraint le plancher
        </h3>
        <p className="text-xs text-muted-foreground">
          Calculé sur le pack et le moyen de paiement les moins favorables parmi ceux ouverts.
        </p>
      </div>
      <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
        <div>
          <p className="text-label">Packs publiés</p>
          <ul className="mt-1 space-y-0.5 text-sm tabular-nums">
            {sections.packs.map((p) => (
              <li key={p.name}>
                <span className="font-medium">{p.name}</span>{" "}
                <span className="text-muted-foreground">
                  {formatFcfa(p.priceFcfa)} · {p.credits} cr.
                  {p.bonusCredits > 0 ? ` + ${p.bonusCredits} offerts` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-label">Moyens de paiement ouverts</p>
          <ul className="mt-1 space-y-0.5 text-sm">
            {sections.paymentMethods.map((m) => (
              <li key={m.label}>
                <span className="font-medium">{m.label}</span>{" "}
                <span className="tabular-nums text-muted-foreground">
                  {m.tierCount === 0 ? "aucun frais (simulé)" : `dès ${m.firstTierPercent} %`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
