import { Clapperboard, Image as ImageIcon } from "lucide-react";
import { TapScale } from "@/components/motion/motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PublicOffer, formatFcfa, formatNumber } from "@/content/offer";
import { signupUrl } from "@/content/site";

/**
 * Offre publique : le prix d'abord, puis ce qu'elle permet (vidéos et images), puis un seul appel à l'action.
 * La barre compare les crédits des trois offres entre elles (largeur relative au plus grand pack) : une aide à la
 * comparaison faite uniquement de données réelles. Une seule offre porte le badge « Recommandé ».
 */
export function PackCard({ offer, maxCredits }: { offer: PublicOffer; maxCredits: number }) {
  const perCredit = offer.priceFcfa / offer.totalCredits;
  const share = Math.max(8, Math.round((offer.totalCredits / maxCredits) * 100));
  return (
    <article
      className={`group relative flex h-full flex-col rounded-3xl border bg-card p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${
        offer.featured ? "border-primary shadow-soft ring-2 ring-primary/30 md:-translate-y-2 md:hover:-translate-y-3" : "shadow-soft"
      }`}
    >
      {offer.featured && <Badge className="absolute -top-3 left-6 bg-accent text-accent-foreground">Recommandé</Badge>}
      {!offer.featured && <p className="text-sm font-medium text-muted-foreground">{offer.role}</p>}
      <h3 className="mt-1 text-2xl font-bold">{offer.name}</h3>
      <p className="mt-3 font-heading text-4xl font-bold tracking-tight">{formatFcfa(offer.priceFcfa)}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {formatNumber(offer.totalCredits)} crédits · {new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(perCredit)} FCFA le crédit
        {offer.bonusPercent > 0 && <span className="ml-1.5 font-medium text-success">dont +{offer.bonusPercent} % offerts</span>}
      </p>

      <div aria-hidden className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-[width] duration-700" style={{ width: `${share}%` }} />
      </div>

      <ul className="mt-5 space-y-2.5 text-sm">
        <li className="flex items-center gap-2.5">
          <Clapperboard className="size-4 shrink-0 text-primary" aria-hidden />
          <span>
            <strong className="text-base">{formatNumber(offer.videos)}</strong> vidéos de 10 s
          </span>
        </li>
        <li className="flex items-center gap-2.5">
          <ImageIcon className="size-4 shrink-0 text-primary" aria-hidden />
          <span>
            ou <strong className="text-base">{formatNumber(offer.images)}</strong> images
          </span>
        </li>
      </ul>
      <p className="sr-only">Par exemple : {offer.example}</p>

      <TapScale className="mt-6 w-full">
        <Button asChild size="lg" variant={offer.featured ? "default" : "outline"} className="w-full rounded-full">
          <a href={signupUrl}>Choisir {offer.name}</a>
        </Button>
      </TapScale>
    </article>
  );
}
