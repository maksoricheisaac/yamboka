import { DemoMedia } from "@/components/studio/demo-media";
import { StudioScene } from "@/components/studio/figure";
import { Still } from "@/components/studio/still";
import { getMedia } from "@/lib/media";

/**
 * Pièce maîtresse du hero : la vidéo de départ se transforme en création sous un rideau qui balaie l’écran
 * (une seule animation, en CSS pur : aucune bibliothèque, aucun minuteur). Les deux sources — la vidéo et la photo —
 * sont posées en cartes superposées pour montrer d’où vient le résultat.
 * Chaque média n’apparaît que s’il existe (voir lib/media.ts) ; sinon c’est une illustration étiquetée « Démo ».
 */
export function HeroStage() {
  const { hero, danseAvant, personnage } = getMedia();
  return (
    <div className="relative mx-auto w-full max-w-[22rem] pb-12 sm:max-w-sm">
      <div className="relative rounded-[2rem] border bg-card p-2.5 shadow-soft ring-1 ring-primary/10">
        {hero ? (
          <DemoMedia media={hero} mode="result" label="Création Yamboka" priority />
        ) : (
          <div className="relative overflow-hidden rounded-2xl">
            <StudioScene mode="result" label="Illustration : la création terminée" />
            <div aria-hidden className="hero-wipe absolute inset-0">
              <StudioScene mode="video" label="" />
            </div>
            <div aria-hidden className="hero-edge pointer-events-none absolute inset-y-0 left-0 w-full">
              <span className="absolute inset-y-0 right-0 w-0.5 bg-background shadow-[0_0_14px_rgb(255_255_255/0.7)]" />
            </div>
            <span className="absolute right-2 top-2 rounded-full bg-background/90 px-2 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wide text-foreground">
              Démo
            </span>
          </div>
        )}
        <p className="mt-2.5 text-center text-xs font-medium text-muted-foreground">
          {hero ? "Exemple généré avec Yamboka" : "Aperçu illustratif"}
        </p>
      </div>

      {/* Les deux sources, légèrement superposées */}
      <figure aria-hidden className="absolute -bottom-1 -left-3 w-[26%] -rotate-6 rounded-xl border bg-card p-1 shadow-soft sm:-left-8">
        <Still image={danseAvant} fallback={<StudioScene mode="video" label="" />} className="rounded-lg" />
        <figcaption className="px-1 pt-1 text-center text-[0.65rem] font-semibold leading-tight">Votre vidéo</figcaption>
      </figure>
      <figure aria-hidden className="absolute -bottom-1 -right-3 w-[26%] rotate-6 rounded-xl border bg-card p-1 shadow-soft sm:-right-8">
        <Still image={personnage} fallback={<StudioScene mode="photo" label="" />} className="rounded-lg" />
        <figcaption className="px-1 pt-1 text-center text-[0.65rem] font-semibold leading-tight">Votre photo</figcaption>
      </figure>
    </div>
  );
}
