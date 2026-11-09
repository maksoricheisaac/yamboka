"use client";

import { useId, useState } from "react";
import type { PricingResolution } from "@/content/pricing";

// Ce composant s'exécute dans le navigateur : il ne peut pas importer les modules de lecture de l'API (cache serveur).
const nf = new Intl.NumberFormat("fr-FR");
const formatNumber = (value: number) => nf.format(value);
/** Même formule que le serveur : ⌈ crédits × prix ⌉ en centièmes entiers. */
const amountFor = (credits: number, unitPrice: number) => Math.ceil((credits * Math.round(unitPrice * 100)) / 100);

/**
 * Calculateur de coût d'une vidéo : durée et qualité → crédits nécessaires et prix à la carte.
 * Les tarifs viennent de l'API (même source que le studio) ; ce composant ne fait que multiplier.
 */
export function CostCalculator({
  resolutions,
  duration,
  unitPrice,
  currencyLabel,
}: {
  resolutions: PricingResolution[];
  duration: { min: number; max: number; default: number };
  unitPrice: number | null;
  currencyLabel: string;
}) {
  const uid = useId();
  const [resolutionId, setResolutionId] = useState(resolutions[0]?.id ?? "");
  const [seconds, setSeconds] = useState(duration.default);
  const resolution = resolutions.find((r) => r.id === resolutionId) ?? resolutions[0];
  if (!resolution) return null;
  const credits = seconds * resolution.creditsPerSecond;

  return (
    <div className="rounded-3xl bg-card shadow-card p-5 shadow-soft sm:p-6">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-5">
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Qualité</legend>
            <div className="grid grid-cols-3 gap-2">
              {resolutions.map((r) => (
                <label
                  key={r.id}
                  className="flex min-h-12 cursor-pointer flex-col items-center justify-center rounded-xl border bg-background px-2 text-center text-sm transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:checked]:ring-2 has-[:checked]:ring-primary/30 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring"
                >
                  <input type="radio" name={`${uid}-q`} value={r.id} checked={resolutionId === r.id} onChange={() => setResolutionId(r.id)} className="sr-only" />
                  <span className="font-medium">{r.label}</span>
                  <span className="text-xs text-muted-foreground">{r.creditsPerSecond} cr./s</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor={`${uid}-d`} className="mb-2 flex items-baseline justify-between text-sm font-semibold">
              Durée de la vidéo
              <span className="text-base tabular-nums">{seconds} s</span>
            </label>
            <input
              id={`${uid}-d`}
              type="range"
              min={duration.min}
              max={duration.max}
              step={1}
              value={seconds}
              onChange={(e) => setSeconds(Number(e.target.value))}
              className="h-11 w-full accent-[var(--primary)]"
              aria-valuetext={`${seconds} secondes`}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{duration.min} s</span>
              <span>{duration.max} s</span>
            </div>
          </div>
        </div>

        <div aria-live="polite" className="flex flex-col justify-center rounded-2xl bg-secondary/60 p-5">
          <p className="text-sm text-muted-foreground">Cette vidéo coûte</p>
          <p className="font-heading text-4xl font-bold text-primary tabular-nums">
            {formatNumber(credits)} <span className="text-lg font-semibold text-foreground">crédits</span>
          </p>
          {unitPrice !== null && (
            <p className="mt-1 text-sm">
              soit <strong>{formatNumber(amountFor(credits, unitPrice))} {currencyLabel}</strong> en achetant à la carte
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
