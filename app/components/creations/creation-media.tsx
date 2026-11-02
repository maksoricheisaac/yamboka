import type { CreationView } from "@yamboka/shared";
import { creationTitle, mediaUrl, ratioOf } from "@/lib/creations";
import { cn } from "@/lib/utils";

/** Résultat d'une création : vidéo (lecture en ligne, sans téléchargement automatique) ou image, au format choisi. */
export function CreationMedia({ creation, className }: { creation: CreationView; className?: string }) {
  const src = mediaUrl(creation.fileUrl);
  const poster = mediaUrl(creation.thumbnailUrl) ?? undefined;
  const title = creationTitle(creation);
  // Résultat plus grand que l'aperçu : même logique de proportions, avec des largeurs un peu plus généreuses.
  const width = creation.isVideo || creation.options.format === "9:16" ? "max-w-[18rem] lg:max-w-[22rem]" : creation.options.format === "2:3" || creation.options.format === "3:4" ? "max-w-sm lg:max-w-md" : "max-w-xl";
  return (
    <figure className={cn("mx-auto w-full", width, className)}>
      <div className="relative overflow-hidden rounded-3xl border bg-foreground shadow-soft" style={{ aspectRatio: ratioOf(creation.options.format) }}>
        {src && creation.isVideo ? (
          <video src={src} poster={poster} controls playsInline preload="metadata" className="size-full object-contain" aria-label={`Vidéo : ${title}`} />
        ) : src ? (
          // eslint-disable-next-line @next/next/no-img-element -- résultat privé servi par l'API (session requise)
          <img src={src} alt={`Affiche : ${title}`} className="size-full object-contain" />
        ) : null}
        {creation.simulated ? (
          <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-amber-400 px-2.5 py-1 text-[0.7rem] font-bold text-black">Simulation · aucune IA utilisée</span>
        ) : (
          <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/65 px-2.5 py-1 text-[0.7rem] font-medium text-white backdrop-blur">Généré par IA · Yamboka</span>
        )}
      </div>
    </figure>
  );
}
