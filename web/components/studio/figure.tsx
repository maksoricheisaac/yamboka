/**
 * Personnage dansant en SVG, partagé par les démonstrations du site. Les couleurs viennent des tokens ;
 * `mode` choisit l'état : fil de fer (la vidéo de départ), portrait (la photo) ou création (en couleurs).
 */
export type FigureMode = "video" | "photo" | "result";
export type FigureTone = "primary" | "terracotta" | "sky";

const RESULT_BG: Record<FigureTone, string> = {
  primary: "bg-linear-to-br from-primary to-chart-4",
  terracotta: "bg-linear-to-br from-terracotta to-primary",
  sky: "bg-linear-to-br from-chart-4 to-primary",
};

const SPARKLES = [
  [36, 70, 0],
  [168, 130, 0.6],
  [52, 150, 1.1],
  [120, 38, 1.7],
] as const;

export function StudioScene({ mode, label, blur = 0, tone = "primary" }: { mode: FigureMode; label: string; blur?: number; tone?: FigureTone }) {
  const result = mode === "result";
  const skeleton = mode === "video";
  const body = result ? "fill-primary-foreground" : skeleton ? "fill-none" : "fill-primary";
  const stroke = skeleton ? "stroke-muted-foreground" : "stroke-transparent";
  const arm = result ? "stroke-primary-foreground" : "stroke-muted-foreground";
  return (
    <div
      className={`relative isolate aspect-[4/5] overflow-hidden rounded-2xl transition-colors duration-700 ${
        result ? RESULT_BG[tone] : skeleton ? "bg-muted" : "bg-linear-to-br from-secondary to-accent/60"
      }`}
      style={{ filter: blur > 0.2 ? `blur(${blur}px) saturate(${1 - Math.min(blur / 14, 0.7)})` : undefined }}
    >
      <svg viewBox="0 0 200 250" className="absolute inset-0 size-full" role="img" aria-label={label}>
        {skeleton && (
          <g className="stroke-border" strokeWidth="1" fill="none">
            {Array.from({ length: 9 }, (_, i) => (
              <path key={`v${i}`} d={`M${i * 25} 0V250`} />
            ))}
            {Array.from({ length: 11 }, (_, i) => (
              <path key={`h${i}`} d={`M0 ${i * 25}H200`} />
            ))}
          </g>
        )}
        {result && (
          <>
            <circle cx="152" cy="58" r="30" className="animate-float fill-accent" opacity="0.95" />
            <path d="M-10 205 C 40 165, 80 235, 130 195 S 200 175, 220 205 V 260 H -10 Z" className="fill-foreground/20" />
            {SPARKLES.map(([x, y, d]) => (
              <path
                key={`${x}-${y}`}
                d={`M${x} ${y - 7} L${x + 2} ${y - 2} L${x + 7} ${y} L${x + 2} ${y + 2} L${x} ${y + 7} L${x - 2} ${y + 2} L${x - 7} ${y} L${x - 2} ${y - 2} Z`}
                className="animate-pop fill-accent"
                style={{ animationDelay: `${d}s`, animationDuration: "1.4s", animationIterationCount: "infinite" }}
              />
            ))}
          </>
        )}
        {mode === "photo" && <circle cx="100" cy="125" r="78" className="fill-accent/30" />}
        <g className={mode === "photo" ? "" : "animate-dance"} style={{ transformOrigin: "100px 200px" }}>
          <circle cx="100" cy="100" r="17" className={`${body} ${stroke}`} strokeWidth="2.5" strokeDasharray={skeleton ? "5 4" : undefined} />
          <path d="M70 205 C 70 140, 130 140, 130 205 Z" className={`${body} ${stroke}`} strokeWidth="2.5" strokeDasharray={skeleton ? "5 4" : undefined} />
          {mode !== "photo" && (
            <>
              <path d="M76 150 L48 118" className={arm} strokeWidth="6" strokeLinecap="round" fill="none" />
              <path d="M124 150 L152 120" className={arm} strokeWidth="6" strokeLinecap="round" fill="none" />
            </>
          )}
        </g>
        {skeleton && <path d="M26 168 C 56 128, 84 208, 118 158" className="stroke-primary" strokeWidth="3" strokeLinecap="round" strokeDasharray="2 9" fill="none" />}
        {mode === "photo" && (
          <g className="animate-pulse stroke-primary" strokeWidth="3" fill="none" strokeLinecap="round">
            <path d="M68 70v-14h14M132 70v-14h-14M68 130v14h14M132 130v14h-14" />
          </g>
        )}
      </svg>
      {skeleton && <span aria-hidden className="absolute inset-x-0 top-0 h-1/5 animate-scan bg-linear-to-b from-transparent via-primary/35 to-transparent" />}
    </div>
  );
}
