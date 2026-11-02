import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { HeroStage } from "@/components/home/hero-stage";
import { Showcase } from "@/components/home/showcase";
import { Steps } from "@/components/home/steps";
import { HeroItem, Reveal, TapScale } from "@/components/motion/motion";
import { Section, SectionHeading } from "@/components/site/blocks";
import { StudioScene } from "@/components/studio/figure";
import { Still } from "@/components/studio/still";
import { Button } from "@/components/ui/button";
import { formatFcfa, getPublicOffers } from "@/content/offer";
import { CTA_LABEL, signupUrl } from "@/content/site";
import { getMedia } from "@/lib/media";
import { JsonLd, organizationLd, pageMetadata, websiteLd } from "@/lib/seo";

export const metadata: Metadata = {
  ...pageMetadata({
    title: "Créez des vidéos et des images par IA, payées en mobile money",
    description:
      "Créez des vidéos et des images par IA, en français et sans carte bancaire. Payez par MTN Mobile Money ou Airtel Money. Né à Brazzaville, pensé pour le Congo.",
    path: "/",
  }),
  title: { absolute: "Yamboka — Créez des vidéos et des images par IA, payées en mobile money" },
};

/** Prix d’entrée réel (offre la moins chère publiée). Rien n’est affiché si les offres sont indisponibles. */
async function StartingPrice() {
  const offers = await getPublicOffers();
  const min = Math.min(...offers.map((o) => o.priceFcfa));
  if (!Number.isFinite(min)) return null;
  return <> Packs de crédits à partir de {formatFcfa(min)}, payés en mobile money.</>;
}

export default function HomePage() {
  const media = getMedia();
  return (
    <>
      <JsonLd data={organizationLd} />
      <JsonLd data={websiteLd} />

      {/* 1. Hero : comprendre et vouloir essayer */}
      <section aria-labelledby="hero-title" className="relative overflow-hidden">
        <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-full bg-[radial-gradient(60rem_30rem_at_85%_0%,color-mix(in_oklch,var(--accent),transparent_78%),transparent)]" />
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 pb-8 pt-10 sm:px-6 sm:pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14 lg:pb-16 lg:pt-20">
          <div className="space-y-6">
            <HeroItem delay={0.05}>
              <h1 id="hero-title" className="text-[2.6rem] font-bold leading-[1.05] sm:text-6xl">
                Transformez vos vidéos <span className="text-primary">avec l’IA.</span>
              </h1>
            </HeroItem>
            <HeroItem delay={0.1}>
              <p className="max-w-md text-lg text-muted-foreground sm:text-xl">
                Envoyez une vidéo et une photo : Yamboka crée la nouvelle version, en quelques minutes, depuis votre téléphone.
              </p>
            </HeroItem>
            <HeroItem delay={0.15} className="flex flex-col gap-3 sm:flex-row">
              <TapScale>
                <Button asChild size="lg" className="w-full rounded-full px-7 sm:w-auto">
                  <a href={signupUrl}>
                    {CTA_LABEL}
                    <ArrowRight aria-hidden />
                  </a>
                </Button>
              </TapScale>
              <Button asChild size="lg" variant="outline" className="rounded-full px-7">
                <a href="#exemples">Voir des exemples</a>
              </Button>
            </HeroItem>
          </div>
          <HeroItem delay={0.1}>
            <HeroStage />
          </HeroItem>
        </div>
      </section>

      {/* 2. Démonstration : voir ce que l’IA peut faire */}
      <Section labelledBy="gallery-title" id="exemples" tone="muted">
        <SectionHeading id="gallery-title" title="Ce que vous pouvez créer" lead="Glissez pour passer de votre vidéo à la création." />
        <Reveal>
          <Showcase demos={media.demos} />
        </Reveal>
        <p className="mt-8 text-sm text-muted-foreground">
          Des images aussi : portraits et visuels de mode à partir d’un modèle.{" "}
          <Link href="/galerie" className="font-medium text-primary underline-offset-4 hover:underline">
            Voir la galerie
          </Link>
        </p>
      </Section>

      {/* 3. Comment ça marche */}
      <Section labelledBy="steps-title">
        <SectionHeading id="steps-title" align="center" title="Trois étapes, c’est tout" />
        <Steps />
      </Section>

      {/* 4. Conversion finale */}
      <section aria-labelledby="cta-title" className="pb-4">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <div className="relative overflow-hidden rounded-3xl bg-primary px-6 py-12 text-primary-foreground sm:px-12 sm:py-16">
            <div aria-hidden className="absolute -right-16 -top-16 size-64 rounded-full bg-accent/30 blur-3xl" />
            <div aria-hidden className="absolute -bottom-6 right-8 hidden w-36 rotate-6 rounded-2xl border border-primary-foreground/20 bg-card p-1 shadow-soft md:block">
              <Still image={media.danseApres} fallback={<StudioScene mode="result" label="" />} />
            </div>
            <div className="relative max-w-xl space-y-4">
              <h2 id="cta-title" className="text-3xl font-bold sm:text-4xl">
                Votre première création est à quelques minutes.
              </h2>
              <p className="text-lg text-primary-foreground/85">
                Créez un compte, choisissez une vidéo, voyez le résultat.
                <Suspense fallback={null}>
                  <StartingPrice />
                </Suspense>
              </p>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-2">
                <TapScale>
                  <Button asChild size="lg" variant="secondary" className="rounded-full px-7">
                    <a href={signupUrl}>
                      {CTA_LABEL}
                      <ArrowRight aria-hidden />
                    </a>
                  </Button>
                </TapScale>
                <Link href="/tarifs" className="text-sm font-medium underline underline-offset-4 hover:opacity-80">
                  Voir les tarifs
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
