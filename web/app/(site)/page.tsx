import {
  ArrowRight,
  Clock,
  Coins,
  Eye,
  Image as ImageIcon,
  Languages,
  RefreshCcw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Upload,
  Video,
  Wand2,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { HeroSceneLoader } from "@/components/home/hero-scene-loader";
import { Reveal } from "@/components/motion/reveal";
import { CtaBand, Section, SectionHeading } from "@/components/site/blocks";
import { DemoVisual } from "@/components/site/demo-visual";
import { FaqList } from "@/components/site/faq-list";
import { PackCard } from "@/components/site/pack-card";
import { Button } from "@/components/ui/button";
import { FAQ } from "@/content/faq";
import { PACKS } from "@/content/offer";
import { signupUrl } from "@/content/site";

export const metadata: Metadata = {
  title: { absolute: "Yamboka — Créez des vidéos et des images par IA, payées en mobile money" },
  description:
    "Créez des vidéos et des images par IA en français, sans carte bancaire. Crédits prépayés à partir de 500 FCFA, paiement par mobile money prévu au lancement. Né à Brazzaville.",
  alternates: { canonical: "/" },
};

const STEPS = [
  {
    icon: Upload,
    title: "Envoyez votre vidéo",
    text: "Une vidéo de 4 à 15 secondes depuis votre téléphone. Elle est compressée avant l’envoi pour économiser vos données.",
  },
  {
    icon: Wand2,
    title: "Choisissez le personnage ou un modèle",
    text: "Envoyez 1 à 4 photos, ou prenez un modèle prêt à l’emploi : danse, publicité, anniversaire, mode. Aucun texte obligatoire.",
  },
  {
    icon: ShieldCheck,
    title: "Vérifiez le coût et confirmez",
    text: "Le prix exact s’affiche en crédits et en FCFA. Vous confirmez, puis vous pouvez quitter : on vous prévient quand c’est prêt.",
  },
];

const BENEFITS = [
  { icon: Smartphone, title: "Pensé pour le mobile money", text: "Conçu autour de MTN Mobile Money et Airtel Money, pour ne plus dépendre d’une carte internationale." },
  { icon: Coins, title: "Petits montants, sans abonnement", text: "Vous payez à la demande : dès 500 FCFA, et seulement ce que vous créez." },
  { icon: Languages, title: "Entièrement en français", text: "Un vocabulaire simple, sans jargon technique, sur un téléphone d’entrée de gamme." },
  { icon: Sparkles, title: "Des modèles adaptés à chez nous", text: "Danses, publicités de boutique, anniversaires, mode : des modèles prêts à l’emploi." },
  { icon: RefreshCcw, title: "Remboursé si ça échoue", text: "Vos crédits sont réservés au lancement et restitués automatiquement en cas d’échec." },
  { icon: Eye, title: "Prix toujours visibles", text: "Le coût s’affiche en crédits et en FCFA avant chaque action payante." },
];

export default function HomePage() {
  const featured = PACKS.filter((p) => ["Découverte", "Créateur", "Pro"].includes(p.name));

  return (
    <>
      <section aria-labelledby="hero-title" className="relative overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 -z-10 h-full bg-[radial-gradient(60rem_30rem_at_80%_0%,color-mix(in_oklch,var(--accent),transparent_80%),transparent)]"
        />
        <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.05fr_1fr] lg:py-24">
          <Reveal className="space-y-7">
            <p className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-sm font-medium text-muted-foreground">
              <span className="size-2 rounded-full bg-accent" aria-hidden />
              Né à Brazzaville · bientôt ouvert
            </p>
            <h1 id="hero-title" className="text-5xl font-bold leading-[1.05] sm:text-6xl">
              Vos vidéos et images par IA, <span className="text-primary">payées en mobile money.</span>
            </h1>
            <p className="max-w-xl text-lg text-muted-foreground sm:text-xl">
              Envoyez une vidéo, choisissez un personnage ou un modèle, et laissez l’IA faire le reste. En français,
              à partir de 500 FCFA, sans carte bancaire.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <a href={signupUrl}>
                  Créer un compte
                  <ArrowRight aria-hidden />
                </a>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/tarifs">Voir les tarifs</Link>
              </Button>
            </div>
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2"><Clock className="size-4 text-primary" aria-hidden />3 étapes maximum</li>
              <li className="flex items-center gap-2"><Eye className="size-4 text-primary" aria-hidden />Coût affiché avant confirmation</li>
              <li className="flex items-center gap-2"><RefreshCcw className="size-4 text-primary" aria-hidden />Crédits remboursés si échec</li>
            </ul>
          </Reveal>

          <div className="relative mx-auto aspect-[5/6] w-full max-w-md lg:max-w-none">
            <HeroSceneLoader className="absolute inset-0 -z-0" />
            <div className="absolute inset-0 grid place-items-center">
              <div className="w-[58%] rotate-2 rounded-3xl border bg-card p-2 shadow-soft">
                <DemoVisual kind="danse" video label="Danse afro" />
                <p className="px-2 pb-1 pt-2 text-center text-xs text-muted-foreground">
                  Aperçu de démonstration — pas une création réelle
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Section labelledBy="steps-title" tone="muted">
        <SectionHeading
          id="steps-title"
          eyebrow="Comment ça marche"
          title="De votre téléphone à votre création en 3 étapes"
          lead="Chaque étape tient sur un écran. Aucun réglage technique à comprendre."
        />
        <ol className="grid gap-6 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title}>
              <Reveal delay={i * 0.08} className="h-full rounded-2xl border bg-card p-6 shadow-soft">
                <div className="mb-4 flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
                    <step.icon className="size-5" aria-hidden />
                  </span>
                  <span className="font-heading text-sm font-bold text-muted-foreground">Étape {i + 1}</span>
                </div>
                <h3 className="text-xl font-bold">{step.title}</h3>
                <p className="mt-2 text-muted-foreground">{step.text}</p>
              </Reveal>
            </li>
          ))}
        </ol>
        <p className="mt-8">
          <Button asChild variant="link" className="px-0 text-base">
            <Link href="/comment-ca-marche">Le parcours en détail <ArrowRight aria-hidden /></Link>
          </Button>
        </p>
      </Section>

      <Section labelledBy="types-title">
        <SectionHeading
          id="types-title"
          eyebrow="Ce que vous pouvez créer"
          title="Des vidéos et des images, à votre mesure"
        />
        <div className="grid gap-6 md:grid-cols-2">
          <article className="grid gap-5 rounded-2xl border bg-card p-6 shadow-soft sm:grid-cols-[1fr_9rem]">
            <div className="space-y-3">
              <Video className="size-7 text-primary" aria-hidden />
              <h3 className="text-2xl font-bold">Vidéo par transfert de mouvement</h3>
              <p className="text-muted-foreground">
                Votre vidéo donne le mouvement, vos photos donnent le personnage. Idéal pour la danse, la publicité et
                les messages personnalisés.
              </p>
              <p className="text-sm font-medium">480p · 4 à 15 secondes · 100 FCFA la seconde</p>
            </div>
            <DemoVisual kind="boutique" video label="Pub boutique" className="hidden sm:block" />
          </article>
          <article className="grid gap-5 rounded-2xl border bg-card p-6 shadow-soft sm:grid-cols-[1fr_9rem]">
            <div className="space-y-3">
              <ImageIcon className="size-7 text-primary" aria-hidden />
              <h3 className="text-2xl font-bold">Image portrait et mode</h3>
              <p className="text-muted-foreground">
                Créez un portrait à partir d’un modèle ou d’une simple description, et partagez-le sur WhatsApp ou
                TikTok.
              </p>
              <p className="text-sm font-medium">Prix fixe · 50 FCFA l’image</p>
            </div>
            <DemoVisual kind="mode" label="Portrait mode" className="hidden sm:block" />
          </article>
        </div>
      </Section>

      <Section labelledBy="why-title" tone="muted">
        <SectionHeading
          id="why-title"
          eyebrow="Pourquoi Yamboka"
          title="Les outils d’IA vidéo, enfin accessibles chez nous"
          lead="Les grands outils se paient en dollars, par carte internationale, en anglais. Yamboka part de la réalité locale."
        />
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map((b, i) => (
            <li key={b.title}>
              <Reveal delay={(i % 3) * 0.06} className="h-full rounded-2xl border bg-card p-6">
                <b.icon className="size-6 text-primary" aria-hidden />
                <h3 className="mt-3 text-lg font-bold">{b.title}</h3>
                <p className="mt-1.5 text-muted-foreground">{b.text}</p>
              </Reveal>
            </li>
          ))}
        </ul>
      </Section>

      <Section labelledBy="pricing-title">
        <SectionHeading
          id="pricing-title"
          eyebrow="Tarifs"
          title="Des crédits prépayés, sans abonnement"
          lead="1 crédit = 25 FCFA. Une vidéo de 10 secondes coûte 40 crédits, soit 1 000 FCFA. Une image, 50 FCFA."
        />
        <div className="grid gap-6 pt-3 md:grid-cols-3">
          {featured.map((pack) => (
            <PackCard key={pack.name} pack={pack} />
          ))}
        </div>
        <p className="mt-8">
          <Button asChild variant="link" className="px-0 text-base">
            <Link href="/tarifs">Tous les packs, de 500 à 25 000 FCFA <ArrowRight aria-hidden /></Link>
          </Button>
        </p>
      </Section>

      <Section labelledBy="payment-title" tone="muted">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div className="space-y-4">
            <SectionHeading
              id="payment-title"
              eyebrow="Paiement local"
              title="MTN Mobile Money et Airtel Money"
            />
            <p className="-mt-6 text-lg text-muted-foreground">
              Vous choisissez votre opérateur, saisissez votre numéro, puis confirmez le paiement sur votre téléphone.
              Vos crédits sont ajoutés dès que le paiement est confirmé.
            </p>
            <p className="rounded-xl border border-accent/60 bg-accent/15 p-4 text-sm">
              <strong>État du service :</strong> le paiement par mobile money sera ouvert au lancement. Ce site ne
              réalise aucun paiement pour le moment.
            </p>
          </div>
          <ul className="space-y-3">
            {[
              "Achat dès 500 FCFA, sans carte bancaire",
              "Crédits ajoutés une seule fois par paiement confirmé",
              "Historique de vos achats et reçu pour chaque paiement réussi",
            ].map((t) => (
              <li key={t} className="flex gap-3 rounded-xl border bg-card p-4">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section labelledBy="gallery-title">
        <SectionHeading
          id="gallery-title"
          eyebrow="Galerie"
          title="Des idées de créations"
          lead="Illustrations de démonstration. Les vraies créations seront publiées avec l’accord de leurs auteurs."
        />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <DemoVisual kind="danse" video label="Danse" />
          <DemoVisual kind="boutique" video label="Pub boutique" />
          <DemoVisual kind="anniversaire" video label="Anniversaire" />
          <DemoVisual kind="portrait" label="Portrait" />
        </div>
        <p className="mt-8">
          <Button asChild variant="link" className="px-0 text-base">
            <Link href="/galerie">Voir la galerie <ArrowRight aria-hidden /></Link>
          </Button>
        </p>
      </Section>

      <Section labelledBy="trust-title" tone="muted">
        <SectionHeading id="trust-title" eyebrow="Vos données et vos contenus" title="Des règles claires, appliquées" />
        <ul className="grid gap-4 sm:grid-cols-2">
          {[
            "Vos fichiers sont privés : accessibles uniquement par des liens temporaires.",
            "Vidéos et photos envoyées supprimées 7 jours après la génération ; créations conservées 90 jours.",
            "Consentement demandé à chaque création, filigrane sur toutes les vidéos.",
            "Contenus signalés examinés sous 24 heures ; contenu manifestement illicite masqué immédiatement.",
          ].map((t) => (
            <li key={t} className="flex gap-3 rounded-xl border bg-card p-4">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
              {t}
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm text-muted-foreground">
          Lire la <Link href="/charte-utilisation" className="underline underline-offset-4">charte d’utilisation</Link>{" "}
          et la <Link href="/confidentialite" className="underline underline-offset-4">politique de confidentialité</Link>.
        </p>
      </Section>

      <Section labelledBy="faq-title">
        <SectionHeading id="faq-title" eyebrow="FAQ" title="Questions fréquentes" />
        <FaqList items={FAQ.slice(0, 5)} />
        <p className="mt-6">
          <Button asChild variant="link" className="px-0 text-base">
            <Link href="/faq">Toutes les questions <ArrowRight aria-hidden /></Link>
          </Button>
        </p>
      </Section>

      <CtaBand />
    </>
  );
}
