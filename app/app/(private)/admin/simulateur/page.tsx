import type { Metadata } from "next";
import type { SimulationView } from "@yamboka/shared";
import { PackMarginTable, VideoSimulationTable } from "@/components/admin/simulation-tables";
import { PageHeader, Pill, StatCard, StatGrid, flat } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireUser } from "@/lib/auth";
import { formatFcfa } from "@/lib/format";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Simulateur — Administration" };

/** Scénarios prêts à l'emploi : le premier est le plus pessimiste, celui qui doit rester tenable. */
const PRESETS: { label: string; query: string; hint: string }[] = [
  { label: "En vigueur", query: "", hint: "les paramètres réellement appliqués" },
  {
    label: "Pessimiste",
    query: "?circuitLossPercent=14&marginPercent=10&bonusValuationPercent=100",
    hint: "circuit à 14 %, bonus compté partout",
  },
  {
    label: "Sans bonus",
    query: "?bonusValuationPercent=0",
    hint: "si le bonus de premier achat disparaissait",
  },
  {
    label: "Marge 25 %",
    query: "?marginPercent=25",
    hint: "ce qu'il faudrait facturer pour viser 25 %",
  },
];

export default async function SimulatorPage({ searchParams }: PageProps<"/admin/simulateur">) {
  await requireUser({ role: "ADMIN" });
  const sp = flat(await searchParams);
  const qs = new URLSearchParams();
  for (const key of ["marginPercent", "circuitLossPercent", "bonusValuationPercent", "durations"] as const) {
    if (sp[key]) qs.set(key, sp[key]);
  }
  const query = qs.toString() ? `?${qs.toString()}` : "";
  const s = await serverGet<SimulationView>(`/admin/finance/simulate${query}`);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Simulateur"
        description="Ce que chaque vidéo coûte, ce qu'elle doit rapporter, et combien de crédits il faudrait facturer. Aucun paramètre n'est modifié ici."
      />

      {s.anyBelowCost ? (
        <div className="rounded-3xl border border-destructive/40 bg-destructive/8 p-4">
          <p className="font-semibold text-destructive">
            Au moins une vidéo du catalogue se vend sous son coût dans ce scénario.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Tant que c’est le cas, chaque création de ce type fait perdre de l’argent. Relevez les crédits par
            seconde du produit concerné (Offre → Produits) jusqu’à atteindre la colonne « crédits requis ».
          </p>
        </div>
      ) : (
        <div className="rounded-3xl border border-success/40 bg-success/8 p-4">
          <p className="font-semibold text-success">
            Dans ce scénario, toutes les vidéos couvrent leur coût et la marge demandée.
          </p>
        </div>
      )}

      <StatGrid>
        <StatCard
          label="Taux sortant retenu"
          value={`${s.pricingRate} F/$`}
          hint={s.rateMeasured ? "mesuré sur les recharges" : "PROVISOIRE : aucune recharge mesurée"}
        />
        <StatCard label="Marge appliquée" value={`${Number(s.marginPercent)} %`} hint={`marge de change ${Number(s.fxBufferPercent)} %`} />
        <StatCard
          label="Valeur plancher d'un crédit"
          value={`${s.creditFloorFcfa} F`}
          hint={`${s.floorFromPack} · ${s.floorFromMethod}`}
        />
        <StatCard
          label="Bonus compté"
          value={`${Number(s.bonusValuationPercent)} %`}
          hint={`perte de circuit ${Number(s.circuitLossPercent)} %`}
        />
      </StatGrid>

      {s.configProvisional || !s.rateMeasured ? (
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Pill tone="warn">Non mesuré</Pill>
          Ces chiffres reposent sur des valeurs provisoires. Ils ne valent pas décision d’ouverture : mesurez
          d’abord un retrait réel (taux sortant) et un second paiement (frais d’encaissement).
        </p>
      ) : null}

      <section aria-labelledby="scenarios" className="space-y-3">
        <h2 id="scenarios" className="text-xl font-bold">
          Scénarios
        </h2>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <Button key={preset.label} asChild variant="outline" size="sm" title={preset.hint}>
              <a href={`/admin/simulateur${preset.query}`}>{preset.label}</a>
            </Button>
          ))}
        </div>
        {/* Formulaire en GET : l'URL porte le scénario, donc il se partage et se recharge tel quel. */}
        <form className="flex flex-wrap items-end gap-3 rounded-3xl bg-card p-4 shadow-card" action="/admin/simulateur">
          <div className="space-y-1">
            <Label htmlFor="marginPercent">Marge (%)</Label>
            <Input id="marginPercent" name="marginPercent" inputMode="decimal" defaultValue={Number(s.marginPercent)} className="w-28" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="circuitLossPercent">Perte de circuit (%)</Label>
            <Input
              id="circuitLossPercent"
              name="circuitLossPercent"
              inputMode="decimal"
              defaultValue={Number(s.circuitLossPercent)}
              className="w-36"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="bonusValuationPercent">Bonus compté (%)</Label>
            <Input
              id="bonusValuationPercent"
              name="bonusValuationPercent"
              inputMode="decimal"
              defaultValue={Number(s.bonusValuationPercent)}
              className="w-32"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="durations">Durées (s)</Label>
            <Input id="durations" name="durations" defaultValue={sp.durations ?? "5,10,30"} className="w-32" />
          </div>
          <Button type="submit">Simuler</Button>
        </form>
      </section>

      <section aria-labelledby="videos" className="space-y-3">
        <h2 id="videos" className="text-xl font-bold">
          Par vidéo
        </h2>
        <VideoSimulationTable videos={s.videos} />
      </section>

      <section aria-labelledby="packs" className="space-y-3">
        <h2 id="packs" className="text-xl font-bold">
          Par pack
        </h2>
        <p className="text-sm text-muted-foreground">
          Au moyen de paiement le moins favorable ({s.floorFromMethod}). Le plancher retenu vient du pack{" "}
          {s.floorFromPack} : {formatFcfa(s.floorNetFcfa)} nets pour {s.floorCredits} crédits.
        </p>
        <PackMarginTable packs={s.packs} />
      </section>
    </div>
  );
}
