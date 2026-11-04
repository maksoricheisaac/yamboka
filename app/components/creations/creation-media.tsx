import type { CreationView } from "@yamboka/shared";
import { creationTitle, mediaUrl, ratioOf } from "@/lib/creations";
import { cn } from "@/lib/utils";

/** Résultat d'une création : vidéo, lue en ligne (sans téléchargement automatique), au format choisi. */
export function CreationMedia({ creation, className }: { creation: CreationView; className?: string }) {
  const src = mediaUrl(creation.fileUrl);
  const poster = mediaUrl(creation.thumbnailUrl) ?? undefined;
  const title = creationTitle(creation);
  const width = creation.options.format === "16:9" ? "max-w-xl" : creation.options.format === "1:1" ? "max-w-sm lg:max-w-md" : "max-w-[18rem] lg:max-w-[22rem]";
  return (
    <figure className={cn("mx-auto w-full", width, className)}>
      <div className="relative overflow-hidden rounded-3xl border bg-foreground shadow-soft" style={{ aspectRatio: ratioOf(creation.options.format) }}>
        {src && <video src={src} poster={poster} controls playsInline preload="metadata" className="size-full object-contain" aria-label={`Vidéo : ${title}`} />}
        {creation.simulated ? (
          <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-amber-400 px-2.5 py-1 text-[0.7rem] font-bold text-black">Simulation · aucune IA utilisée</span>
        ) : (
          <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/65 px-2.5 py-1 text-[0.7rem] font-medium text-white backdrop-blur">Généré par IA · Yamboka</span>
        )}
      </div>
    </figure>
  );
}
