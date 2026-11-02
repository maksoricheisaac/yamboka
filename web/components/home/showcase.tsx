"use client";

import { useState } from "react";
import { CompareSlider } from "@/components/studio/compare-slider";
import { StudioScene } from "@/components/studio/figure";
import { Still } from "@/components/studio/still";
import type { DemoItem } from "@/content/demos";

/**
 * Choix d’une démonstration (trois au maximum) puis comparaison avant / après. Sans JavaScript, la première reste visible.
 * Les démonstrations arrivent avec leurs médias déjà détectés (lib/media.ts) ; sans média, illustration.
 */
export function Showcase({ demos }: { demos: DemoItem[] }) {
  const [id, setId] = useState(demos[0].id);
  const demo = demos.find((d) => d.id === id) ?? demos[0];

  return (
    <div className="grid items-center gap-8 lg:grid-cols-[28rem_auto] lg:justify-center lg:gap-16">
      <div key={demo.id} className="animate-pop">
        <CompareSlider demo={demo} />
      </div>
      <ul className="flex gap-3 lg:flex-col" aria-label="Exemples">
        {demos.map((d) => (
          <li key={d.id} className="flex-1">
            <button
              type="button"
              onClick={() => setId(d.id)}
              aria-pressed={d.id === id}
              className={`flex w-full items-center gap-3 rounded-2xl border p-2 text-left transition-all active:scale-[0.98] lg:pr-10 ${
                d.id === id ? "border-primary bg-primary/5 shadow-soft" : "bg-card hover:border-primary/40"
              }`}
            >
              <span aria-hidden className="hidden w-14 shrink-0 overflow-hidden rounded-xl sm:block">
                <Still
                  image={d.after && { src: d.after.poster, alt: "" }}
                  fallback={<StudioScene mode="result" tone={d.tone} label="" />}
                />
              </span>
              <span className="px-1 text-sm font-semibold sm:text-base">{d.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
