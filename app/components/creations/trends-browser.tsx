"use client";

import type { CreationKind, StyleView } from "@yamboka/shared";
import { ArrowRight, Star } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { KINDS, credits } from "@/lib/creations";
import { cn } from "@/lib/utils";
import { StyleThumb } from "./style-picker";

type Filter = CreationKind | "all";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Tout" },
  { value: "fun", label: "Vidéos fun" },
  { value: "pub", label: "Vidéos pub" },
  { value: "affiche", label: "Affiches" },
];

/** Les tendances (vidéos fun) d'abord : c'est ce que l'on vient chercher ici. */
const ORDER: Record<CreationKind, number> = { fun: 0, pub: 1, affiche: 2 };

function TrendCard({ style: s, className }: { style: StyleView; className?: string }) {
  const Icon = KINDS[s.kind].icon;
  return (
    <Link
      href={`/app/creer?style=${s.id}`}
      aria-label={`${s.name} — ${KINDS[s.kind].label}, ${credits(s.credits)}. Utiliser`}
      className={cn("group block space-y-2.5 rounded-2xl outline-none focus-visible:ring-3 focus-visible:ring-ring/70", className)}
    >
      <div className="aspect-[3/4] overflow-hidden rounded-2xl border bg-muted shadow-soft">
        <StyleThumb style={s} className="transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none" />
      </div>
      <div className="space-y-1 px-0.5">
        <p className="truncate font-heading text-[0.95rem] font-bold leading-tight">{s.name}</p>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icon className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{KINDS[s.kind].label}</span>
          <span aria-hidden>·</span>
          <span className="shrink-0">{credits(s.credits)}</span>
        </p>
        <p className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
          Utiliser <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
        </p>
      </div>
    </Link>
  );
}

/**
 * Bibliothèque de tendances : une seule rangée de filtres (le type de création) et une grille régulière.
 * Chaque carte est un lien vers « Créer » avec le style déjà choisi. Titre, type et coût sont sous l'image,
 * jamais par-dessus : le visuel reste entier.
 */
export function TrendsBrowser({ styles }: { styles: StyleView[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const available = FILTERS.filter((f) => f.value === "all" || styles.some((s) => s.kind === f.value));
  const shown = styles.filter((s) => filter === "all" || s.kind === filter).sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);

  if (styles.length === 0) {
    return (
      <p className="rounded-3xl border border-dashed bg-card/60 p-10 text-center text-muted-foreground">
        Les tendances arrivent bientôt. Revenez très vite !
      </p>
    );
  }

  // « À la une » : uniquement ce que l'administrateur a choisi de mettre en avant. Aucune sélection : pas de section.
  const featured = styles.filter((s) => s.featured);

  return (
    <div className="space-y-8">
      {featured.length > 0 && (
        <section aria-labelledby="featured-title" className="space-y-3">
          <h2 id="featured-title" className="flex items-center gap-2 font-heading text-lg font-bold">
            <Star className="size-4 fill-accent text-accent" aria-hidden /> À la une
          </h2>
          <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
            {featured.map((s) => (
              <li key={s.id} className="w-40 shrink-0 snap-start sm:w-auto">
                <TrendCard style={s} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="all-title" className="space-y-5">
      {featured.length > 0 && <h2 id="all-title" className="font-heading text-lg font-bold">Toutes les tendances</h2>}
      {available.length > 2 && (
        <div role="group" aria-label="Type de création" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          {available.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "h-10 shrink-0 rounded-full border px-4 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/60",
                filter === f.value ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      <ul className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 sm:gap-x-4 lg:grid-cols-4 xl:grid-cols-5">
        {shown.map((s) => (
          <li key={s.id}>
            <TrendCard style={s} />
          </li>
        ))}
      </ul>
      </section>
    </div>
  );
}
