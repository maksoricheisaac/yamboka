"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Scénarios prêts à l'emploi. Le premier remet les paramètres réellement appliqués. */
const SCENARIOS: { label: string; query: string; title: string }[] = [
  { label: "En vigueur", query: "", title: "Les paramètres réellement appliqués" },
  {
    label: "Pessimiste",
    query: "?circuitLossPercent=14&marginPercent=10&bonusValuationPercent=100",
    title: "Circuit à 14 %, bonus compté partout",
  },
  { label: "Sans bonus", query: "?bonusValuationPercent=0", title: "Si le bonus de premier achat disparaissait" },
  { label: "Marge 25 %", query: "?marginPercent=25", title: "Ce qu'il faudrait facturer pour viser 25 %" },
];

interface Values {
  marginPercent: number;
  circuitLossPercent: number;
  bonusValuationPercent: number;
  durations: string;
}

/**
 * Choix du scénario : des raccourcis, et le détail des quatre paramètres repliés tant qu'on n'y touche pas.
 * Le formulaire reste en GET : le scénario vit dans l'URL, donc il se partage et se recharge tel quel.
 */
export function ScenarioPanel({ query, values }: { query: string; values: Values }) {
  // Le raccourci actif se déduit ici : une constante exportée d'un module client ne traverse pas vers le serveur.
  const active = SCENARIOS.find((s) => s.query === query)?.label ?? "custom";
  const [open, setOpen] = useState(active === "custom");

  return (
    <section aria-labelledby="scenario" className="space-y-3 rounded-2xl bg-card p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="scenario" className="text-sm font-semibold">
          Scénario
        </h2>
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? "Masquer les paramètres" : "Ajuster les paramètres"}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {SCENARIOS.map((s) => (
          <Button
            key={s.label}
            asChild
            size="sm"
            variant={active === s.label ? "default" : "outline"}
            title={s.title}
          >
            <a href={`/admin/simulateur${s.query}`}>{s.label}</a>
          </Button>
        ))}
      </div>

      {open && (
        <form className="flex flex-wrap items-end gap-3 border-t pt-4" action="/admin/simulateur">
          <Field id="marginPercent" label="Marge" suffix="%" value={values.marginPercent} width="w-24" />
          <Field id="circuitLossPercent" label="Perte de circuit" suffix="%" value={values.circuitLossPercent} width="w-32" />
          <Field id="bonusValuationPercent" label="Bonus compté" suffix="%" value={values.bonusValuationPercent} width="w-28" />
          <Field id="durations" label="Durées" suffix="s" value={values.durations} width="w-28" />
          <Button type="submit" size="sm">
            Simuler
          </Button>
        </form>
      )}
    </section>
  );
}

function Field({ id, label, suffix, value, width }: { id: string; label: string; suffix: string; value: string | number; width: string }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label} ({suffix})
      </Label>
      <Input id={id} name={id} inputMode="decimal" defaultValue={value} className={`h-9 ${width}`} />
    </div>
  );
}
