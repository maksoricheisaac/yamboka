import type { CreationView } from "@yamboka/shared";
import { Play, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { KINDS, creationTitle, isRunning, mediaUrl } from "@/lib/creations";
import { StatusPill } from "./status-pill";

/**
 * Vignette d'une création. Toutes les vignettes ont le même gabarit (4:5) pour que la grille reste régulière,
 * quel que soit le format choisi : le format est rappelé par une étiquette.
 */
export function CreationCard({ creation, priority = false }: { creation: CreationView; priority?: boolean }) {
  const thumb = mediaUrl(creation.thumbnailUrl);
  const running = isRunning(creation);
  const Icon = KINDS[creation.kind].icon;
  return (
    <Link
      href={`/app/creations/${creation.id}`}
      aria-label={`${creationTitle(creation)} — ${creation.status === "COMPLETED" ? "prête" : creation.status === "FAILED" ? "échec, crédits restitués" : "en cours"}`}
      className="group block overflow-hidden rounded-2xl border bg-card shadow-soft outline-none transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 focus-visible:ring-3 focus-visible:ring-ring/60 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-muted">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element -- fichier privé servi par l'API avec la session : pas d'optimiseur Next.
          <img
            src={thumb}
            alt=""
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            className={`size-full object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none ${running ? "scale-105 blur-sm" : ""} ${creation.status === "FAILED" ? "opacity-40 grayscale" : ""}`}
          />
        ) : (
          <div className="grid size-full place-items-center text-muted-foreground">
            {creation.status === "FAILED" ? <TriangleAlert className="size-8" aria-hidden /> : <Icon className="size-8" aria-hidden />}
          </div>
        )}
        {running && (
          <div className="absolute inset-0 grid place-items-center bg-foreground/25">
            <span aria-hidden className="size-10 animate-spin rounded-full border-4 border-background/40 border-t-background motion-reduce:animate-none" />
          </div>
        )}
        {creation.status === "COMPLETED" && creation.isVideo && (
          <span className="absolute bottom-2 right-2 grid size-8 place-items-center rounded-full bg-foreground/70 text-background" aria-hidden>
            <Play className="size-4 fill-current" />
          </span>
        )}
        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-background/90 px-2 py-0.5 text-[0.7rem] font-semibold shadow-sm">
          <Icon className="size-3" aria-hidden /> {KINDS[creation.kind].short}
        </span>
        <span className="absolute right-2 top-2 rounded-full bg-foreground/70 px-1.5 py-0.5 text-[0.65rem] font-semibold text-background">{creation.options.format}</span>
      </div>
      <div className="space-y-1.5 p-3">
        <p className="truncate text-sm font-semibold">{creation.styleName}</p>
        <StatusPill creation={creation} />
      </div>
    </Link>
  );
}
