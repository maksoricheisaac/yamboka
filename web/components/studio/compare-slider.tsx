"use client";

import { MoveHorizontal } from "lucide-react";
import { useInView, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import type { DemoItem } from "@/content/demos";
import { DemoMedia } from "./demo-media";

/**
 * Comparateur avant / après. Au premier affichage, la poignée fait un aller-retour pour montrer qu’elle se déplace
 * (sauf « réduire les animations »). Se manipule au doigt, à la souris, au clavier (champ « range » natif étiqueté)
 * et avec les deux boutons Avant / Après, pratiques sur téléphone. La transition n’est active que pour les sauts
 * automatiques, jamais pendant un glissement.
 */
export function CompareSlider({ demo }: { demo: DemoItem }) {
  const id = useId();
  const reduce = useReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  const inView = useInView(box, { once: true, margin: "-20% 0px" });
  const [pos, setPos] = useState(50);
  const [smooth, setSmooth] = useState(false);

  const jump = (v: number) => {
    setSmooth(true);
    setPos(v);
  };

  useEffect(() => {
    if (!inView || reduce) return;
    const timers = [18, 82, 50].map((v, i) =>
      setTimeout(() => {
        setSmooth(true);
        setPos(v);
      }, 500 + i * 900),
    );
    return () => timers.forEach(clearTimeout);
  }, [inView, reduce]);

  const ease = smooth ? "transition-all duration-700 ease-out" : "";

  return (
    <div className="mx-auto w-full max-w-md">
      <div ref={box} className="relative select-none overflow-hidden rounded-3xl border bg-card p-2 shadow-soft">
        <div className="relative touch-pan-y">
          <DemoMedia media={demo.after} mode="result" tone={demo.tone} label={`${demo.label}, la création`} />
          <div className={`absolute inset-0 ${ease}`} style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
            <DemoMedia media={demo.before} mode="video" label={`${demo.label}, la vidéo de départ`} />
          </div>
          <span aria-hidden className={`absolute inset-y-0 w-0.5 bg-background shadow-[0_0_12px_rgb(0_0_0/0.35)] ${ease}`} style={{ left: `${pos}%` }}>
            <span className="absolute left-1/2 top-1/2 grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-background text-foreground shadow-soft">
              <MoveHorizontal className="size-5" />
            </span>
          </span>
          <label htmlFor={id} className="sr-only">Comparer la vidéo de départ et la création</label>
          <input
            id={id}
            type="range"
            min={0}
            max={100}
            value={pos}
            onChange={(e) => {
              setSmooth(false);
              setPos(Number(e.target.value));
            }}
            className="peer absolute inset-0 size-full cursor-ew-resize opacity-0"
          />
          <span aria-hidden className="pointer-events-none absolute inset-0 rounded-2xl peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring" />
        </div>
      </div>
      <div className="mt-4 flex justify-center gap-2" role="group" aria-label="Afficher">
        <button type="button" onClick={() => jump(100)} className="rounded-full border bg-card px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-muted active:scale-95">
          Avant
        </button>
        <button type="button" onClick={() => jump(0)} className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/85 active:scale-95">
          Après
        </button>
      </div>
    </div>
  );
}
