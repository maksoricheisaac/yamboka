"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { DemoMediaSource } from "@/content/demos";
import { StudioScene, type FigureMode, type FigureTone } from "./figure";

/**
 * Un média de démonstration : la vraie vidéo si elle existe, sinon l’illustration étiquetée « Démo ».
 * La vidéo est muette, ne se charge qu’à l’approche de l’écran (`preload="none"` + lecture à la visibilité),
 * ne démarre pas avec « réduire les animations » et offre un bouton pause. Si elle échoue, l’illustration prend
 * le relais : la page reste compréhensible sans média.
 */
export function DemoMedia({
  media,
  mode,
  tone,
  label,
  priority = false,
}: {
  media?: DemoMediaSource;
  mode: FigureMode;
  tone?: FigureTone;
  label: string;
  priority?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || !media) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) el.play().catch(() => {});
        else el.pause();
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [media]);

  if (!media || failed) {
    return (
      <div className="relative">
        <StudioScene mode={mode} tone={tone} label={`Illustration : ${label}`} />
        <span className="absolute bottom-2 right-2 rounded-full bg-background/90 px-2 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wide text-foreground">
          Démo
        </span>
      </div>
    );
  }

  return (
    <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-muted">
      <video
        ref={ref}
        className="size-full object-cover"
        muted
        loop
        playsInline
        preload={priority ? "metadata" : "none"}
        poster={media.poster}
        aria-label={media.alt}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => setFailed(true)}
      >
        <source src={media.video} type="video/mp4" />
      </video>
      <button
        type="button"
        onClick={() => (playing ? ref.current?.pause() : ref.current?.play().catch(() => {}))}
        aria-label={playing ? "Mettre la vidéo en pause" : "Lire la vidéo"}
        className="absolute bottom-2 left-2 grid size-10 place-items-center rounded-full bg-background/90 text-foreground shadow-soft transition-transform hover:scale-105 active:scale-95"
      >
        {playing ? <Pause className="size-4" aria-hidden /> : <Play className="ml-0.5 size-4" aria-hidden />}
      </button>
    </div>
  );
}
