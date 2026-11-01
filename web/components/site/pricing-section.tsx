import { Stagger, StaggerItem } from "@/components/motion/motion";
import { PackCard } from "@/components/site/pack-card";
import { getPublicOffers } from "@/content/offer";

/** Trois offres au maximum, lues depuis l'administration. Rendu côté serveur : aucun JavaScript pour afficher les prix. */
export async function Offers() {
  const offers = await getPublicOffers();
  if (offers.length === 0) {
    return <p className="rounded-2xl border border-dashed p-6 text-center text-muted-foreground">Les offres de crédits seront bientôt disponibles.</p>;
  }
  const maxCredits = Math.max(...offers.map((o) => o.totalCredits));
  return (
    <Stagger className="grid gap-6 pt-3 md:grid-cols-3 md:items-stretch">
      {offers.map((offer) => (
        <StaggerItem key={offer.name}>
          <PackCard offer={offer} maxCredits={maxCredits} />
        </StaggerItem>
      ))}
    </Stagger>
  );
}
