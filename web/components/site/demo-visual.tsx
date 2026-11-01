import { Play } from "lucide-react";

export type DemoKind = "danse" | "boutique" | "anniversaire" | "portrait" | "evenement" | "mode";

const PALETTES: Record<DemoKind, { bg: string; sun: string; body: string; trail: string }> = {
  danse: { bg: "from-primary to-chart-4", sun: "fill-accent", body: "fill-background", trail: "stroke-accent" },
  boutique: { bg: "from-accent to-terracotta", sun: "fill-background", body: "fill-primary", trail: "stroke-primary" },
  anniversaire: { bg: "from-terracotta to-accent", sun: "fill-background", body: "fill-primary", trail: "stroke-background" },
  portrait: { bg: "from-chart-5 to-primary", sun: "fill-accent", body: "fill-background", trail: "stroke-background" },
  evenement: { bg: "from-chart-4 to-primary", sun: "fill-terracotta", body: "fill-accent", trail: "stroke-background" },
  mode: { bg: "from-secondary to-accent", sun: "fill-terracotta", body: "fill-primary", trail: "stroke-primary" },
};

/**
 * Illustration de démonstration (SVG, aucun fichier lourd). Elle n'est PAS le résultat d'une génération IA :
 * elle porte toujours la mention « Démo ».
 */
export function DemoVisual({
  kind,
  video = false,
  label,
  className = "",
  ratio,
}: {
  kind: DemoKind;
  video?: boolean;
  label: string;
  className?: string;
  /** Proportions CSS (ex. « 16/10 ») ; 4/5 par défaut. */
  ratio?: string;
}) {
  const p = PALETTES[kind];
  return (
    <figure
      style={ratio ? { aspectRatio: ratio } : undefined}
      className={`relative isolate aspect-[4/5] overflow-hidden rounded-2xl bg-linear-to-br ${p.bg} ${className}`}
    >
      <svg viewBox="0 0 200 250" className="absolute inset-0 size-full" role="img" aria-label={`Illustration : ${label}`}>
        <circle cx="150" cy="62" r="34" className={p.sun} opacity="0.9" />
        <path
          d="M-10 200 C 40 160, 80 230, 130 190 S 200 170, 220 200 V 260 H -10 Z"
          className="fill-foreground/15"
        />
        {video && (
          <path
            d="M30 150 C 60 110, 90 190, 120 140"
            className={p.trail}
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="2 9"
          />
        )}
        <circle cx="100" cy="112" r="17" className={p.body} />
        <path d="M70 200 C 70 150, 130 150, 130 200 Z" className={p.body} />
      </svg>
      {video && (
        <span
          aria-hidden
          className="absolute left-1/2 top-[24%] grid size-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-background/85 text-foreground shadow-soft"
        >
          <Play className="ml-0.5 size-5 fill-current" />
        </span>
      )}
      <figcaption className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-linear-to-t from-foreground/70 to-transparent p-3 text-sm font-medium text-background">
        <span>{label}</span>
        <span className="rounded-full bg-background/90 px-2 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wide text-foreground">
          Démo
        </span>
      </figcaption>
    </figure>
  );
}
