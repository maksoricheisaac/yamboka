import { ArrowRight } from "lucide-react";
import { Stagger, StaggerItem } from "@/components/motion/motion";
import { StudioScene, type FigureMode } from "@/components/studio/figure";
import { Still } from "@/components/studio/still";
import { getMedia } from "@/lib/media";

const STEPS: { mode: FigureMode; title: string; text: string }[] = [
  { mode: "video", title: "Choisissez un style", text: "Affiche, vidéo pub ou tendance : un style prêt à l’emploi." },
  { mode: "photo", title: "Ajoutez votre photo", text: "Votre produit ou votre selfie, depuis le téléphone." },
  { mode: "result", title: "Générez et partagez", text: "Le prix s’affiche avant de confirmer." },
];

/**
 * Trois étapes, chacune illustrée par l’état de l’écran à ce moment-là (image réelle si elle existe, sinon illustration).
 * Pas de défilement piloté : léger et lisible partout.
 */
export function Steps() {
  const media = getMedia();
  const images: Record<FigureMode, typeof media.danseAvant> = { video: media.danseAvant, photo: media.personnage, result: media.danseApres };
  return (
    <Stagger as="ol" className="grid gap-4 md:grid-cols-3 md:gap-0">
      {STEPS.map((s, i) => (
        <StaggerItem key={s.title} className="relative flex items-center gap-4 rounded-2xl border bg-card p-3 md:flex-col md:rounded-none md:border-0 md:bg-transparent md:p-0 md:px-5">
          <div className="relative w-24 shrink-0 md:w-40">
            <div aria-hidden className="overflow-hidden rounded-2xl border bg-card p-1 shadow-soft">
              <Still image={images[s.mode]} fallback={<StudioScene mode={s.mode} label="" />} className="rounded-xl" />
            </div>
            <span className="absolute -left-2 -top-2 grid size-8 place-items-center rounded-full bg-primary font-heading text-sm font-bold text-primary-foreground shadow-soft">
              {i + 1}
            </span>
          </div>
          <div className="md:mt-5 md:text-center">
            <h3 className="text-lg font-bold">{s.title}</h3>
            <p className="mt-1 text-muted-foreground">{s.text}</p>
          </div>
          {i < STEPS.length - 1 && (
            <ArrowRight aria-hidden className="absolute -right-3 top-[28%] hidden size-6 text-primary/50 md:block" />
          )}
        </StaggerItem>
      ))}
    </Stagger>
  );
}
