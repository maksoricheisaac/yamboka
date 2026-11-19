import type { Metadata } from "next";
import Link from "next/link";
import type { PricingSections } from "@yamboka/shared";
import { ConfigTabs } from "@/components/admin/config-tabs";
import { Metric, MetricGrid, Notice, PageHeader } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
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
    <div className="space-y-5">
      <PageHeader
        title="Configuration des calculs"
        description="Un changement se prépare, s’aperçoit, puis s’applique — sans redéploiement."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/simulateur">Simuler un scénario</Link>
          </Button>
        }
      />

      <MetricGrid>
        <Metric
          label="Taux sortant retenu"
          value={`${sections.pricingRate} F/$`}
          hint={sections.rateMeasured ? "mesuré sur les recharges" : "provisoire : aucune recharge mesurée"}
          tone={sections.rateMeasured ? undefined : "warn"}
        />
        <Metric
          label="Marge visée"
          value={`${Number(sections.current.marginPercent)} %`}
          hint={`minimum accepté ${Number(sections.current.minMarginPercent)} %`}
        />
        <Metric
          label="Valeur plancher d’un crédit"
          value={`${sections.creditFloorFcfa} F`}
          hint={`${sections.floorFromPack} · ${sections.floorFromMethod}`}
        />
        <Metric
          label="Validité d’un devis"
          value={`${Math.round(sections.current.quoteValiditySeconds / 60)} min`}
          hint={`achat minimum ${formatFcfa(sections.current.minPurchaseXaf)}`}
        />
      </MetricGrid>

      {sections.pessimisticApplied && (
        <Notice tone="warn">
          Configuration provisoire : les prix sont calculés avec les hypothèses les plus défavorables. Ne la
          décochez qu’une fois le taux sortant réellement mesuré.
        </Notice>
      )}

      <ConfigTabs sections={sections} />
    </div>
  );
}
