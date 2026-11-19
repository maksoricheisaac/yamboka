import type { Metadata } from "next";
import Link from "next/link";
import type { SimulationView } from "@yamboka/shared";
import { ScenarioPanel } from "@/components/admin/scenario-panel";
import { SimulationTabs } from "@/components/admin/simulation-tables";
import { Metric, MetricGrid, Notice, PageHeader, flat } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { formatFcfa } from "@/lib/format";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Simulateur — Administration" };

const KEYS = ["marginPercent", "circuitLossPercent", "bonusValuationPercent", "durations"] as const;

export default async function SimulatorPage({ searchParams }: PageProps<"/admin/simulateur">) {
  await requireUser({ role: "ADMIN" });
  const sp = flat(await searchParams);
  const qs = new URLSearchParams();
  for (const key of KEYS) if (sp[key]) qs.set(key, sp[key]);
  const query = qs.toString() ? `?${qs.toString()}` : "";
  const s = await serverGet<SimulationView>(`/admin/finance/simulate${query}`);
  const provisional = s.configProvisional || !s.rateMeasured;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Simulateur"
        description="Ce que chaque vidéo coûte et ce qu'elle doit rapporter. Aucun paramètre n'est modifié ici."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/configuration">Modifier les paramètres</Link>
          </Button>
        }
      />

      {/* Un seul bandeau : le verdict du scénario, et la réserve à y apporter quand les chiffres sont provisoires. */}
      {s.anyBelowCost ? (
        <Notice tone="bad">
          Au moins une vidéo se vend sous son coût dans ce scénario : relevez ses crédits par seconde
          jusqu’à la ligne « requis » (Offre → Produits).
        </Notice>
      ) : provisional ? (
        <Notice tone="warn">
          Toutes les vidéos couvrent leur coût ici, mais sur des chiffres provisoires : mesurez un retrait
          réel et un second paiement avant d’en tirer une décision d’ouverture.
        </Notice>
      ) : (
        <Notice tone="ok">Toutes les vidéos couvrent leur coût et la marge demandée dans ce scénario.</Notice>
      )}

      <MetricGrid>
        <Metric
          label="Taux sortant retenu"
          value={`${s.pricingRate} F/$`}
          hint={s.rateMeasured ? "mesuré sur les recharges" : "provisoire : aucune recharge mesurée"}
          tone={s.rateMeasured ? undefined : "warn"}
        />
        <Metric
          label="Marge appliquée"
          value={`${Number(s.marginPercent)} %`}
          hint={`marge de change ${Number(s.fxBufferPercent)} %`}
        />
        <Metric
          label="Valeur plancher d’un crédit"
          value={`${s.creditFloorFcfa} F`}
          hint={`${s.floorFromPack} · ${s.floorFromMethod}`}
        />
        <Metric
          label="Bonus compté"
          value={`${Number(s.bonusValuationPercent)} %`}
          hint={`perte de circuit ${Number(s.circuitLossPercent)} %`}
        />
      </MetricGrid>

      <ScenarioPanel
        query={query}
        values={{
          marginPercent: Number(s.marginPercent),
          circuitLossPercent: Number(s.circuitLossPercent),
          bonusValuationPercent: Number(s.bonusValuationPercent),
          durations: sp.durations ?? "5,10,30",
        }}
      />

      <SimulationTabs
        videos={s.videos}
        packs={s.packs}
        packNote={`Au moyen de paiement le moins favorable (${s.floorFromMethod}). Plancher retenu : pack ${s.floorFromPack}, ${formatFcfa(s.floorNetFcfa)} nets pour ${s.floorCredits} crédits.`}
      />
    </div>
  );
}
