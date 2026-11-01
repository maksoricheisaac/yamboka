import type { Metadata } from "next";
import Image from "next/image";
import { getMedia } from "@/lib/media";
import { pageMetadata } from "@/lib/seo";
import { CtaBand, PageHero, Section, SectionHeading } from "@/components/site/blocks";
import { FaqList } from "@/components/site/faq-list";
import { FAQ } from "@/content/faq";

export const metadata: Metadata = pageMetadata({ title: "Comment ça marche", description: "Du compte à la création : inscription, achat de crédits, création d’une vidéo en 3 étapes, suivi et téléchargement. Le parcours Yamboka expliqué pas à pas.", path: "/comment-ca-marche" });

const JOURNEY = [
  {
    title: "Créez votre compte",
    text: "Avec Google en un clic, ou avec votre adresse e-mail et un mot de passe. Vous acceptez les conditions d’utilisation et la charte. Un lien de vérification est envoyé à votre adresse e-mail (valable 24 heures).",
    note: "Tant que l’adresse n’est pas vérifiée, vous pouvez explorer l’application, mais pas acheter ni créer.",
  },
  {
    title: "Achetez des crédits",
    text: "Choisissez un pack, votre opérateur (MTN ou Airtel) et votre numéro, puis confirmez sur votre téléphone. L’écran se met à jour tout seul. Vos crédits sont ajoutés après confirmation du paiement.",
    note: "Le paiement mobile money ouvrira au lancement.",
  },
  {
    title: "Créez votre vidéo ou votre image",
    text: "Trois étapes : le style, votre photo, puis la confirmation avec le coût exact, votre solde restant et le consentement.",
    note: "Si votre solde est insuffisant, le pack le plus adapté vous est proposé.",
  },
  {
    title: "Suivez, téléchargez, partagez",
    text: "La création s’effectue en arrière-plan. Vous êtes prévenu quand elle est prête. Vous pouvez alors la lire, la télécharger, la partager sur WhatsApp ou la supprimer.",
    note: "Si la création échoue, vos crédits vous sont rendus automatiquement.",
  },
];

export default function HowItWorksPage() {
  const { comment } = getMedia();
  return (
    <>
      <PageHero path="/comment-ca-marche"
        eyebrow="Comment ça marche"
        title="Du compte à la création, pas à pas"
        lead="Chaque écran est pensé pour un téléphone et pour des connexions lentes."
      />
      <Section labelledBy="journey-title">
        <SectionHeading id="journey-title" title="Le parcours complet" />
        <ol className="space-y-6">
          {JOURNEY.map((step, i) => (
            <li key={step.title} className={`grid gap-4 rounded-2xl border bg-card p-6 shadow-soft ${comment[i] ? "sm:grid-cols-[4rem_1fr_9rem]" : "sm:grid-cols-[4rem_1fr]"}`}>
              <span
                aria-hidden
                className="grid size-12 place-items-center rounded-xl bg-primary font-heading text-xl font-bold text-primary-foreground"
              >
                {i + 1}
              </span>
              <div>
                <h3 className="text-xl font-bold">{step.title}</h3>
                <p className="mt-1.5 text-muted-foreground">{step.text}</p>
                <p className="mt-3 text-sm font-medium text-primary">{step.note}</p>
              </div>
              {comment[i] && (
                <div className="relative mx-auto aspect-[540/1170] w-36 overflow-hidden rounded-2xl border bg-muted shadow-soft sm:w-full">
                  <Image src={comment[i]!.src} alt={comment[i]!.alt} fill unoptimized sizes="9rem" className="object-cover object-top" />
                </div>
              )}
            </li>
          ))}
        </ol>
      </Section>
      <Section tone="muted" labelledBy="rules-title">
        <SectionHeading
          id="rules-title"
          title="Ce qu’il faut savoir avant de lancer une vidéo"
        />
        <ul className="grid gap-4 md:grid-cols-2">
          {[
            "Photo : une image JPG, PNG ou WebP, 10 Mo maximum (elle est réduite automatiquement avant l’envoi).",
            "Le coût en crédits s’affiche avant de lancer, et les crédits sont restitués si la création échoue.",
            "Au plus 2 créations en cours en même temps par compte.",
            "Une création sans résultat après une heure est déclarée échouée et remboursée.",
            "Les fichiers que vous envoyez sont supprimés 7 jours après la génération.",
            "Vos créations sont conservées 90 jours, avec un rappel 7 jours avant la suppression.",
          ].map((t) => (
            <li key={t} className="rounded-xl border bg-card p-4">
              {t}
            </li>
          ))}
        </ul>
      </Section>
      <Section labelledBy="faq-title">
        <SectionHeading id="faq-title" title="Une question ?" />
        <FaqList items={FAQ.slice(0, 6)} />
      </Section>
      <CtaBand />
    </>
  );
}
