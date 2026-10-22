import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pack, formatFcfa, formatNumber, totalCredits } from "@/content/offer";
import { signupUrl } from "@/content/site";

export function PackCard({ pack }: { pack: Pack }) {
  const credits = totalCredits(pack);
  return (
    <article
      className={`relative flex flex-col rounded-2xl border bg-card p-6 shadow-soft ${
        pack.featured ? "border-primary ring-2 ring-primary/30" : ""
      }`}
    >
      {pack.featured && (
        <Badge className="absolute -top-3 left-6 bg-accent text-accent-foreground">Recommandé pour débuter</Badge>
      )}
      <h3 className="text-xl font-bold">{pack.name}</h3>
      <p className="mt-3 font-heading text-4xl font-bold tracking-tight">{formatFcfa(pack.priceFcfa)}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {formatNumber(credits)} crédits
        {pack.bonusPercent > 0 && (
          <span className="ml-1.5 font-medium text-success">(dont +{pack.bonusPercent} % offerts)</span>
        )}
      </p>
      <p className="mt-5 flex items-start gap-2 text-sm">
        <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <span>≈ {pack.example}</span>
      </p>
      <Button asChild variant={pack.featured ? "default" : "outline"} className="mt-6">
        <a href={signupUrl} aria-label={`Choisir le pack ${pack.name} : créer un compte`}>
          Choisir ce pack
        </a>
      </Button>
    </article>
  );
}
