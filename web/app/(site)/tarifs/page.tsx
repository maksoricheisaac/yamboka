import type { Metadata } from "next";
import { Suspense } from "react";
import { CtaBand, PageHero, Section, SectionHeading } from "@/components/site/blocks";
import { Ban, CalendarClock, Info, RotateCcw } from "lucide-react";
import { Stagger, StaggerItem } from "@/components/motion/motion";
import { CostPicker } from "@/components/site/cost-picker";
import { Offers } from "@/components/site/pricing-section";
import { IMAGE_CREDITS, VIDEO_CREDITS_PER_SECOND, getPublicOffers } from "@/content/offer";
import { SITE } from "@/content/site";
import { JsonLd, pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Tarifs",
  description:
    "Trois offres de crédits, sans abonnement, payables en mobile money. Prix tout compris, frais Mobile Money inclus : une vidéo de 10 secondes consomme 100 crédits, une image 2 crédits.",
  path: "/tarifs",
});

/** Données structurées des offres : les prix et crédits visibles sur la page, rien de plus (ni note, ni avis). */
async function OffersLd() {
  const offers = await getPublicOffers();
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@graph": offers.map((o) => ({
          "@type": "Product",
          name: `Crédits Yamboka — offre ${o.name}`,
          description: `${o.totalCredits} crédits pour créer des vidéos et des images par IA. Par exemple : ${o.example}.`,
          brand: { "@type": "Brand", name: SITE.name },
          offers: {
            "@type": "Offer",
            price: o.priceFcfa,
            priceCurrency: "XAF",
            url: `${SITE.url}/tarifs`,
          },
        })),
      }}
    />
  );
}

const RULES = [
  { icon: CalendarClock, text: "Crédits valables 12 mois après l’achat ; les plus anciens sont utilisés en premier." },
  { icon: RotateCcw, text: "Crédits réservés au lancement d’une création, restitués si elle échoue ou est annulée." },
  { icon: Ban, text: "Ni remboursables en argent, ni transférables entre comptes." },
];

export default function PricingPage() {
  return (
    <>
      <PageHero
        path="/tarifs"
        eyebrow="Tarifs"
        title="Des crédits, pas d’abonnement"
        lead="Vous achetez des crédits en mobile money, puis vous les dépensez quand vous créez. Prix tout compris, frais Mobile Money inclus."
      />

      <Section labelledBy="packs-title">
        <SectionHeading id="packs-title" title="Choisissez votre offre" lead="Plus l’offre est grande, moins le crédit coûte cher." />
        <Suspense fallback={<div className="h-72 rounded-2xl border bg-card/50" aria-hidden />}>
          <Offers />
          <OffersLd />
        </Suspense>
        <p className="mt-6 flex items-start gap-3 rounded-2xl border border-accent/60 bg-accent/15 p-4 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-accent-foreground" aria-hidden />
          <span>
            <strong>État du service :</strong> le paiement par MTN Mobile Money et Airtel Money ouvre au lancement. Les boutons mènent à la
            création de compte ; aucun paiement n’est réalisé sur ce site.
          </span>
        </p>
      </Section>

      <Section tone="muted" labelledBy="costs-title">
        <SectionHeading id="costs-title" title="Combien coûte une création ?" lead="Le coût exact est toujours affiché, en crédits et en FCFA, avant que vous confirmiez." />
        <CostPicker videoPerSecond={VIDEO_CREDITS_PER_SECOND} imageCredits={IMAGE_CREDITS} />
        <p className="mt-6 text-sm text-muted-foreground">
          La durée d’une vidéo est arrondie à la seconde supérieure. Les tarifs peuvent évoluer ; le prix affiché au moment de confirmer fait foi.
        </p>
      </Section>

      <Section labelledBy="rules-title">
        <SectionHeading id="rules-title" title="Les règles des crédits" />
        <Stagger className="grid gap-6 md:grid-cols-3">
          {RULES.map((r) => (
            <StaggerItem key={r.text} className="flex gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <r.icon className="size-5" aria-hidden />
              </span>
              <p className="pt-1.5">{r.text}</p>
            </StaggerItem>
          ))}
        </Stagger>
      </Section>
      <CtaBand />
    </>
  );
}
