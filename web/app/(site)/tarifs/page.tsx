import type { Metadata } from "next";
import { Suspense } from "react";
import { CtaBand, PageHero, Section, SectionHeading } from "@/components/site/blocks";
import { Ban, CalendarClock, Globe2, Info, RotateCcw } from "lucide-react";
import { Stagger, StaggerItem } from "@/components/motion/motion";
import { Offers } from "@/components/site/pricing-section";
import { CostCalculator } from "@/components/site/cost-calculator";
import { formatFcfa, formatNumber, getPublicOffers } from "@/content/offer";
import { getPricing } from "@/content/pricing";
import { SITE } from "@/content/site";
import { JsonLd, pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Tarifs",
  description:
    "Trois offres de crédits, sans abonnement, payables en mobile money. Prix tout compris, frais Mobile Money inclus : une vidéo consomme un nombre fixe de crédits, affiché avant de confirmer.",
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
          description: `${o.totalCredits} crédits pour créer des vidéos pro par IA. Par exemple : ${o.example}.`,
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

/** Calculateur et petits montants : toutes les valeurs viennent de l'API (même source que le studio et l'espace client). */
async function Costs() {
  const pricing = await getPricing();
  if (!pricing) {
    return <p className="rounded-2xl border border-dashed p-6 text-center text-muted-foreground">Les tarifs détaillés sont momentanément indisponibles. Le coût exact est affiché avant chaque création.</p>;
  }
  const home = pricing.countries.find((c) => c.custom) ?? null;
  const custom = home?.custom ?? null;
  const currencyLabel = home && ["XAF", "XOF"].includes(home.currency) ? "FCFA" : (home?.currency ?? "");
  const cheapest = pricing.resolutions.reduce((min, r) => (r.creditsPerSecond < min.creditsPerSecond ? r : min), pricing.resolutions[0]);
  const shortestCredits = cheapest.creditsPerSecond * pricing.duration.min;
  return (
    <div className="space-y-8">
      <CostCalculator resolutions={pricing.resolutions} duration={pricing.duration} unitPrice={custom?.unitPrice ?? null} currencyLabel={currencyLabel} />

      <ul className="grid gap-3 sm:grid-cols-3">
        {pricing.resolutions.map((r) => (
          <li key={r.id} className="rounded-3xl bg-card shadow-card p-4">
            <p className="text-sm text-muted-foreground">{r.label}</p>
            <p className="font-heading text-2xl font-bold tabular-nums">{formatNumber(r.creditsPerSecond)} <span className="text-sm font-medium text-muted-foreground">crédits par seconde</span></p>
            <p className="text-sm text-muted-foreground">5 secondes : {formatNumber(r.creditsPerSecond * 5)} crédits</p>
          </li>
        ))}
      </ul>

      {custom && home && (
        <div className="rounded-3xl border border-primary/30 bg-primary/5 p-5 sm:p-6">
          <h3 className="text-xl font-bold">Pas envie d’un pack ? Achetez juste ce qu’il vous faut</h3>
          <p className="mt-2 text-muted-foreground">
            Choisissez vous-même le nombre de crédits, à partir de <strong className="text-foreground">{formatNumber(custom.minCredits)} crédits ({formatFcfa(Math.ceil(custom.minCredits * custom.unitPrice))})</strong>.
            {" "}Une vidéo de {pricing.duration.min} secondes en qualité {cheapest.label.toLowerCase()} demande {formatNumber(shortestCredits)} crédits : de quoi tester Yamboka sans engagement. Le montant se calcule en direct à l’achat ; les bonus restent réservés aux packs.
          </p>
        </div>
      )}

      {pricing.countries.length > 0 && (
        <div>
          <h3 className="flex items-center gap-2 text-xl font-bold"><Globe2 className="size-5 text-primary" aria-hidden /> Moyens de paiement par pays</h3>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {pricing.countries.map((c) => (
              <li key={c.iso} className="rounded-3xl bg-card shadow-card p-4">
                <p className="font-semibold">{c.name} <span className="text-sm font-normal text-muted-foreground">· {c.currency}</span></p>
                <p className="text-sm text-muted-foreground">{c.methods.filter((m) => m.status !== "COMING_SOON").map((m) => m.name).join(" · ")}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-sm text-muted-foreground">Les tarifs peuvent évoluer ; le prix affiché au moment de confirmer fait foi. Aucun frais caché : vous ne payez jamais plus que le montant affiché.</p>
    </div>
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
            <strong>État du service :</strong> le paiement par mobile money ouvre au lancement. Les boutons mènent à la
            création de compte ; aucun paiement n’est réalisé sur ce site.
          </span>
        </p>
      </Section>

      <Section tone="muted" labelledBy="costs-title">
        <SectionHeading id="costs-title" title="Combien coûte une création ?" lead="Le coût exact est toujours affiché, en crédits, avant que vous confirmiez. Calculez-le ici." />
        <Suspense fallback={<div className="h-64 rounded-3xl border bg-card/50" aria-hidden />}>
          <Costs />
        </Suspense>
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
