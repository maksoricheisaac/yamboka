import type { CreationFormat } from "@yamboka/shared";
import { ImageIcon } from "lucide-react";
import { ratioOf } from "@/lib/creations";
import { cn } from "@/lib/utils";

/**
 * Aperçu de la photo choisie, au format de sortie. Sobre : état vide discret, puis la photo. Ce n'est pas le
 * résultat (créé par l'IA) ; `children` sert de calque pour l'attente et les erreurs.
 */
export function CreationPreview({
  format,
  photoUrl,
  caption,
  children,
  className,
}: {
  format: CreationFormat;
  photoUrl: string | null;
  caption?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const portrait = format === "9:16";
  return (
    <figure className={cn("mx-auto w-full", portrait ? "max-w-[8rem] sm:max-w-[13rem] lg:max-w-[15rem]" : format === "1:1" ? "max-w-[10rem] sm:max-w-[16rem] lg:max-w-[18rem]" : "max-w-[15rem] sm:max-w-xs", className)}>
      <div
        className={cn(
          "relative isolate overflow-hidden rounded-2xl transition-[aspect-ratio] duration-300 motion-reduce:transition-none",
          photoUrl ? "border bg-foreground/90 shadow-soft" : "border-2 border-dashed bg-muted/50",
        )}
        style={{ aspectRatio: ratioOf(format) }}
      >
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- aperçu local (blob)
          <img src={photoUrl} alt="Aperçu de votre photo" className="absolute inset-0 -z-10 size-full object-cover" />
        ) : (
          <div className="grid size-full place-content-center justify-items-center gap-2 px-4 text-center text-sm text-muted-foreground">
            <ImageIcon className="size-6" aria-hidden />
            Votre photo apparaîtra ici
          </div>
        )}
        {children}
      </div>
      <figcaption className="mt-2 text-center text-xs text-muted-foreground">{caption ?? `Format ${format}`}</figcaption>
    </figure>
  );
}
