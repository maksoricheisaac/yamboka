/**
 * Panneau visuel des pages d'authentification (écran large uniquement : sur téléphone, le formulaire passe avant tout).
 * Illustration décorative d'une création qui se révèle ; ce n'est pas un résultat généré, la mention le dit.
 */
export function AuthAside() {
  return (
    <aside aria-hidden className="relative hidden overflow-hidden bg-primary text-primary-foreground lg:flex lg:flex-col lg:items-center lg:justify-center lg:gap-8 lg:p-12">
      <div className="absolute -right-24 -top-24 size-80 rounded-full bg-accent/25 blur-3xl" />
      <div className="absolute -bottom-32 -left-20 size-96 rounded-full bg-chart-4/30 blur-3xl" />

      <div className="relative w-64 rotate-3 rounded-3xl border border-primary-foreground/20 bg-card p-2 shadow-soft">
        <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-linear-to-br from-primary to-chart-4">
          <svg viewBox="0 0 200 250" className="absolute inset-0 size-full">
            <circle cx="152" cy="58" r="30" className="animate-float fill-accent" opacity="0.95" />
            <path d="M-10 205 C 40 165, 80 235, 130 195 S 200 175, 220 205 V 260 H -10 Z" className="fill-foreground/20" />
            <g className="animate-float" style={{ transformOrigin: "100px 200px" }}>
              <circle cx="100" cy="100" r="17" className="fill-primary-foreground" />
              <path d="M70 205 C 70 140, 130 140, 130 205 Z" className="fill-primary-foreground" />
              <path d="M76 150 L48 118 M124 150 L152 120" className="stroke-primary-foreground" strokeWidth="6" strokeLinecap="round" fill="none" />
            </g>
          </svg>
          <span className="absolute bottom-2 right-2 rounded-full bg-background/90 px-2 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wide text-foreground">Démo</span>
        </div>
      </div>

      <div className="relative max-w-xs text-center">
        <p className="font-heading text-3xl font-bold leading-tight">Votre vidéo. Votre personnage. Une création.</p>
        <p className="mt-3 text-sm text-primary-foreground/75">Illustration, pas une création réelle.</p>
      </div>
    </aside>
  );
}
