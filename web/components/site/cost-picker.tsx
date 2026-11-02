"use client";

import { Clapperboard, Image as ImageIcon } from "lucide-react";
import { useState } from "react";
/** Combien coûte une création ? Trois choix, la réponse change sur place. Les tarifs sont passés par le serveur (content/offer.ts), jamais écrits ici. */
export function CostPicker({ videoPerSecond, imageCredits }: { videoPerSecond: number; imageCredits: number }) {
  const CHOICES = [
    { id: "v5", label: "Vidéo 5 s", credits: 5 * videoPerSecond, icon: Clapperboard },
    { id: "v10", label: "Vidéo 10 s", credits: 10 * videoPerSecond, icon: Clapperboard },
    { id: "img", label: "Image", credits: imageCredits, icon: ImageIcon },
  ];
  const [id, setId] = useState("v10");
  const current = CHOICES.find((c) => c.id === id) ?? CHOICES[1];
  return (
    <div className="grid items-center gap-6 md:grid-cols-[auto_1fr] md:gap-12">
      <div role="group" aria-label="Type de création" className="flex flex-wrap gap-2">
        {CHOICES.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={c.id === id}
            onClick={() => setId(c.id)}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold transition-all active:scale-95 ${
              c.id === id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/50"
            }`}
          >
            <c.icon className="size-4" aria-hidden />
            {c.label}
          </button>
        ))}
      </div>
      <p aria-live="polite" className="font-heading text-4xl font-bold sm:text-5xl">
        <span key={current.id} className="inline-block animate-pop text-primary">{current.credits}</span>{" "}
        <span className="text-xl font-semibold text-foreground sm:text-2xl">crédits</span>
      </p>
    </div>
  );
}
