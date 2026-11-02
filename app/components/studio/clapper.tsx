/**
 * Claquette animée : la barre du haut claque en boucle. Sert d’indicateur de chargement et d’illustration
 * dans le studio. Décorative (aria-hidden) ; l’état est annoncé par le texte qui l’accompagne.
 */
export function Clapper({ size = 64, animate = true, className = "" }: { size?: number; animate?: boolean; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className={className}>
      <g className={animate ? "animate-clap" : ""} style={{ transformOrigin: "10px 24px" }}>
        <rect x="8" y="12" width="48" height="12" rx="3" className="fill-foreground" />
        {[16, 28, 40].map((x) => (
          <path key={x} d={`M${x} 12 l8 0 -6 12 -8 0 Z`} className="fill-accent" />
        ))}
      </g>
      <rect x="8" y="27" width="48" height="27" rx="3" className="fill-primary" />
      <path d="M14 36h20M14 44h12" className="stroke-primary-foreground" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="46" cy="42" r="5" className="fill-accent" />
    </svg>
  );
}

export function ClapperLoader({ label = "Chargement…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center gap-3">
      <Clapper size={72} />
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
    </div>
  );
}
