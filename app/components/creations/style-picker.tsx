"use client";

import type { StyleView } from "@yamboka/shared";
import { Check, ImageOff } from "lucide-react";
import { useId } from "react";
import { credits, mediaUrl } from "@/lib/creations";
import { cn } from "@/lib/utils";

/** Visuel d'un style : sa vignette, ou un dégradé neutre tant que l'administrateur n'en a pas publié. */
export function StyleThumb({ style, className }: { style: Pick<StyleView, "thumbnailUrl" | "name">; className?: string }) {
  const url = mediaUrl(style.thumbnailUrl);
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- vignette servie par l'API (session requise)
    <img src={url} alt="" loading="lazy" decoding="async" className={cn("size-full object-cover", className)} />
  ) : (
    <div className={cn("grid size-full place-items-center bg-linear-to-br from-secondary to-muted text-muted-foreground", className)}>
      <ImageOff className="size-6" aria-hidden />
    </div>
  );
}

/**
 * Choix du style, en boutons radio natifs (clavier et lecteurs d'écran gratuits). Sur mobile : défilement
 * horizontal avec aimantation, pour garder la page courte ; dès sm : grille.
 */
export function StylePicker({
  styles,
  value,
  onChange,
  legend,
  disabled,
}: {
  styles: StyleView[];
  value: string | null;
  onChange: (id: string) => void;
  legend: string;
  disabled?: boolean;
}) {
  const name = useId();
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="sr-only">{legend}</legend>
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0 xl:grid-cols-4">
        {styles.map((s) => (
          <label
            key={s.id}
            className="group relative block w-36 shrink-0 snap-start cursor-pointer sm:w-auto"
          >
            <input type="radio" name={name} value={s.id} checked={value === s.id} onChange={() => onChange(s.id)} className="peer sr-only" />
            <span className="block overflow-hidden rounded-2xl border bg-card shadow-soft transition-all peer-checked:border-primary peer-checked:ring-2 peer-checked:ring-primary/40 peer-focus-visible:ring-3 peer-focus-visible:ring-ring/70 group-hover:border-primary/50 group-active:scale-[0.98] motion-reduce:transition-none">
              <span className="relative block aspect-[3/4] overflow-hidden bg-muted">
                <StyleThumb style={s} className="transition-transform duration-300 group-hover:scale-[1.04] motion-reduce:transition-none" />
                <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-primary text-primary-foreground opacity-0 shadow transition-opacity group-has-[:checked]:opacity-100">
                  <Check className="size-3.5" aria-hidden />
                </span>
              </span>
              <span className="block px-2.5 py-2">
                <span className="block truncate text-sm font-semibold">{s.name}</span>
                <span className="block text-xs text-muted-foreground">{credits(s.credits)}</span>
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
