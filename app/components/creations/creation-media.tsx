import type { CreationView } from "@yamboka/shared";
import { ratioOf, mediaUrl } from "@/lib/creations";
import { cn } from "@/lib/utils";

/** Résultat d'une création : vidéo (lecture en ligne, sans téléchargement automatique) ou image, au format choisi. */
export function CreationMedia({ creation, className }: { creation: CreationView; className?: string }) {
  const src = mediaUrl(creation.fileUrl);
  const poster = mediaUrl(creation.thumbnailUrl) ?? undefined;
  const portrait = creation.options.format === "9:16";
  return (
    <figure className={cn("mx-auto w-full", portrait ? "max-w-[18rem] lg:max-w-[22rem]" : "max-w-xl", className)}>
      <div className="relative overflow-hidden rounded-3xl border bg-foreground shadow-soft" style={{ aspectRatio: ratioOf(creation.options.format) }}>
        {src && creation.isVideo ? (
          <video src={src} poster={poster} controls playsInline preload="metadata" className="size-full object-contain" aria-label={`Vidéo : ${creation.styleName}`} />
        ) : src ? (
          // eslint-disable-next-line @next/next/no-img-element -- résultat privé servi par l'API (session requise)
          <img src={src} alt={`Affiche : ${creation.styleName}`} className="size-full object-contain" />
        ) : null}
        <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/65 px-2.5 py-1 text-[0.7rem] font-medium text-white backdrop-blur">Généré par IA · Yamboka</span>
      </div>
    </figure>
  );
}
