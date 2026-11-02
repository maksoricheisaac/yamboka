import { CountUp } from "./count-up";

/**
 * Bobine de crédits : un disque de pellicule aux trous qui tournent lentement, avec le solde au centre.
 * Le solde est lisible en texte (pas seulement dans le dessin) ; la rotation est coupée par « réduire les animations ».
 */
export function CreditReel({ credits, className = "" }: { credits: number; className?: string }) {
  const holes = Array.from({ length: 6 }, (_, i) => (i * 360) / 6);
  return (
    <div className={`relative mx-auto grid aspect-square w-44 place-items-center sm:w-52 ${className}`}>
      <svg viewBox="0 0 120 120" className="absolute inset-0 size-full" aria-hidden>
        <circle cx="60" cy="60" r="56" className="fill-primary" />
        <circle cx="60" cy="60" r="56" className="fill-none stroke-accent/60" strokeWidth="2" strokeDasharray="2 6" />
        <g className="animate-reel" style={{ transformOrigin: "60px 60px", animationDuration: "18s" }}>
          {holes.map((a) => (
            <circle key={a} cx="60" cy="22" r="9" className="fill-card" transform={`rotate(${a} 60 60)`} />
          ))}
        </g>
        <circle cx="60" cy="60" r="31" className="fill-card" />
        <circle cx="60" cy="60" r="31" className="fill-none stroke-border" strokeWidth="1" />
      </svg>
      <div className="relative text-center">
        <p className="font-heading text-3xl font-bold leading-none sm:text-4xl">
          <CountUp to={credits} />
        </p>
        <p className="mt-1 text-xs font-medium text-muted-foreground">{credits > 1 ? "crédits" : "crédit"}</p>
      </div>
    </div>
  );
}
