"use client";

import { ArrowRight, ChevronLeft, ChevronRight, Play, X } from "lucide-react";
import Image from "next/image";
import { Dialog } from "radix-ui";
import { useRef, useState } from "react";
import { DemoVisual, type DemoKind } from "@/components/site/demo-visual";
import { CompareSlider } from "@/components/studio/compare-slider";
import { Still } from "@/components/studio/still";
import { Button } from "@/components/ui/button";
import { GALLERY_CATEGORIES, type GalleryCategory, type GalleryEntry } from "@/content/gallery";
import { CTA_LABEL, signupUrl } from "@/content/site";

const TONE: Record<DemoKind, "primary" | "terracotta" | "sky"> = {
  danse: "primary",
  portrait: "primary",
  boutique: "terracotta",
  mode: "terracotta",
  anniversaire: "sky",
  evenement: "sky",
};

/** Un exemple a son média réel : la paire avant / après pour une vidéo, l'image pour une image. */
const hasMedia = (i: GalleryEntry) => (i.video ? !!(i.before && i.after) : !!i.image);

/**
 * Galerie : filtres simples (boutons à état), mosaïque où les vidéos prennent plus de place que les images, et fenêtre
 * de consultation (Dialog Radix : focus piégé, Échap, fermeture au clic extérieur). Sur téléphone la fenêtre se pose
 * en bas de l'écran et défile si besoin. Aucun média n'est chargé tant qu'il n'est pas ouvert.
 * Les exemples arrivent avec leurs médias déjà détectés (lib/media.ts) : sans média, c'est l'illustration « Démo ».
 */
export function Gallery({ items: all }: { items: GalleryEntry[] }) {
  const [filter, setFilter] = useState<GalleryCategory | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  // Pas de Dialog.Trigger ici : on mémorise le bouton qui a ouvert l'aperçu pour lui rendre le focus à la fermeture.
  const openerRef = useRef<HTMLElement | null>(null);
  const items = all.filter((i) => filter === "all" || i.category === filter);
  const index = items.findIndex((i) => i.id === openId);
  const current: GalleryEntry | undefined = index >= 0 ? items[index] : undefined;

  const step = (d: number) => setOpenId(items[(index + d + items.length) % items.length].id);

  return (
    <div className="space-y-8">
      <div role="group" aria-label="Filtrer les exemples" className="flex flex-wrap gap-2">
        {[{ id: "all" as const, label: "Tout" }, ...GALLERY_CATEGORIES].map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={filter === c.id}
            onClick={() => setFilter(c.id)}
            className={`rounded-full border px-4 py-2.5 text-sm font-semibold transition-all active:scale-95 ${
              filter === c.id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/50"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <ul className="grid grid-flow-dense grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-6">
        {items.map((item, i) => (
          <li key={item.id} className={`animate-pop ${item.video ? "col-span-2 lg:col-span-4" : "lg:col-span-2"}`} style={{ animationDelay: `${i * 60}ms` }}>
            <button
              type="button"
              onClick={(e) => {
                openerRef.current = e.currentTarget;
                setOpenId(item.id);
              }}
              aria-label={`Ouvrir : ${item.label}${item.video ? " (vidéo)" : ""}`}
              className="group block w-full overflow-hidden rounded-2xl text-left outline-offset-4 transition-transform duration-300 hover:-translate-y-1 active:scale-[0.98] motion-reduce:transition-none"
            >
              {hasMedia(item) ? (
                <figure
                  style={item.video ? { aspectRatio: "16/10" } : undefined}
                  className="relative isolate aspect-[4/5] overflow-hidden rounded-2xl bg-muted transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none"
                >
                  {item.video ? (
                    <>
                      {/* La vidéo est verticale (4:5), la carte est large (16:10) : on la montre entière et nette, sur son propre flou. */}
                      <Image src={item.after!.poster} alt="" aria-hidden fill unoptimized sizes="10rem" className="scale-125 object-cover opacity-80 blur-2xl" />
                      <Image src={item.after!.poster} alt={`${item.label}, aperçu de la création`} fill unoptimized sizes="(min-width: 1024px) 30rem, 80vw" className="object-contain" />
                    </>
                  ) : (
                    <Image src={item.image!.src} alt={item.image!.alt} fill unoptimized sizes="(min-width: 1024px) 20rem, 50vw" className="object-cover" />
                  )}
                  {item.video && (
                    <span aria-hidden className="absolute left-1/2 top-1/2 grid size-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-background/85 text-foreground shadow-soft">
                      <Play className="ml-0.5 size-5 fill-current" />
                    </span>
                  )}
                  <figcaption className="absolute inset-x-0 bottom-0 bg-linear-to-t from-foreground/70 to-transparent p-3 text-sm font-medium text-background">
                    {item.label}
                  </figcaption>
                </figure>
              ) : (
                <DemoVisual
                  kind={item.kind}
                  video={item.video}
                  label={item.label}
                  ratio={item.video ? "16/10" : undefined}
                  className="transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none"
                />
              )}
            </button>
          </li>
        ))}
      </ul>

      <Dialog.Root open={!!current} onOpenChange={(o) => !o && setOpenId(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/50 backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
          <Dialog.Content
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              openerRef.current?.focus();
            }}
            className="fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-3xl border bg-background p-5 shadow-lg outline-none data-open:animate-in data-open:slide-in-from-bottom-10 data-closed:animate-out data-closed:slide-out-to-bottom-10 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-[min(92vw,30rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:data-open:zoom-in-95"
          >
            {current && (
              <>
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <Dialog.Title className="font-heading text-2xl font-bold">{current.label}</Dialog.Title>
                    <Dialog.Description className="mt-1 text-muted-foreground">{current.blurb}</Dialog.Description>
                  </div>
                  <Dialog.Close aria-label="Fermer" className="grid size-10 shrink-0 place-items-center rounded-full border hover:bg-muted">
                    <X className="size-5" aria-hidden />
                  </Dialog.Close>
                </div>

                {current.video ? (
                  <CompareSlider demo={{ id: current.id, label: current.label, tone: TONE[current.kind], before: current.before, after: current.after }} />
                ) : (
                  <div className="mx-auto max-w-xs">
                    <Still image={current.image} fallback={<DemoVisual kind={current.kind} label={current.label} />} />
                  </div>
                )}
                <p className="mt-3 text-center text-xs text-muted-foreground">
                  {hasMedia(current) ? "Exemple généré avec Yamboka." : "Illustration de démonstration, pas une création réelle."}
                </p>

                <div className="mt-5 flex items-center gap-3">
                  <div className="flex shrink-0 gap-2">
                    <button type="button" onClick={() => step(-1)} aria-label="Exemple précédent" className="grid size-11 place-items-center rounded-full border hover:bg-muted active:scale-95">
                      <ChevronLeft className="size-5" aria-hidden />
                    </button>
                    <button type="button" onClick={() => step(1)} aria-label="Exemple suivant" className="grid size-11 place-items-center rounded-full border hover:bg-muted active:scale-95">
                      <ChevronRight className="size-5" aria-hidden />
                    </button>
                  </div>
                  <Button asChild size="lg" className="min-w-0 flex-1 rounded-full px-4">
                    <a href={signupUrl}>{CTA_LABEL} <ArrowRight aria-hidden /></a>
                  </Button>
                </div>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
