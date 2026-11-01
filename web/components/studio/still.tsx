import Image from "next/image";
import type { ReactNode } from "react";
import type { StillImage } from "@/content/demos";

/**
 * Image fixe en 4:5 si elle existe, sinon l’illustration de repli (`fallback`). Les images sont déjà compressées
 * (WebP) : pas d’optimisation à la volée, donc rien à configurer côté serveur.
 */
export function Still({ image, fallback, className = "" }: { image?: StillImage; fallback: ReactNode; className?: string }) {
  if (!image) return <>{fallback}</>;
  return (
    <div className={`relative aspect-[4/5] overflow-hidden rounded-2xl bg-muted ${className}`}>
      <Image src={image.src} alt={image.alt} fill unoptimized sizes="(min-width: 768px) 20rem, 40vw" className="object-cover" />
    </div>
  );
}
