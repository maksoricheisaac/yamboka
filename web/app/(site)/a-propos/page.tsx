import type { Metadata } from "next";
import { CtaBand, PageHero, Prose } from "@/components/site/blocks";

export const metadata: Metadata = {
  title: "À propos",
  description:
    "Yamboka, « du pays, de chez nous » en lingala : une plateforme de création vidéo et image par IA née à Brazzaville, pensée pour l’Afrique du mobile money.",
  alternates: { canonical: "/a-propos" },
};

export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="À propos"
        title="Né à Brazzaville, pensé pour l’Afrique"
        lead="Yamboka veut rendre la création vidéo par IA accessible à celles et ceux que les outils internationaux laissent de côté."
      />
      <Prose>
        <h2>Pourquoi ce nom</h2>
        <p>
          « Yamboka » vient du lingala <em>ya mboka</em> : « du pays, de chez nous ». Une plateforme qui part de
          notre réalité plutôt que de s’y adapter après coup.
        </p>

        <h2>Le constat</h2>
        <p>
          Les outils de vidéo par IA se paient en dollars, par carte bancaire internationale que la plupart des
          Congolais n’ont pas. Leurs interfaces sont en anglais, conçues pour des professionnels, et vendues par
          abonnement mensuel. Pourtant, le contenu vidéo court domine WhatsApp, TikTok et Facebook, et le paiement
          mobile (MTN Mobile Money, Airtel Money) est le moyen de paiement numérique dominant.
        </p>

        <h2>Notre approche</h2>
        <ul>
          <li>Une interface entièrement en français, simple, sans jargon.</li>
          <li>Des crédits prépayés à partir de 500 FCFA, sans abonnement.</li>
          <li>Un parcours de création en trois étapes, avec le prix affiché avant chaque action.</li>
          <li>Des modèles adaptés aux usages locaux : danse, publicité, anniversaire, mode.</li>
          <li>Un usage responsable : consentement, filigrane, modération et signalement.</li>
        </ul>

        <h2>La feuille de route</h2>
        <ul>
          <li>
            <strong>Lancement :</strong> vidéo 480p, images, premiers modèles, achat de crédits par mobile money.
          </li>
          <li>
            <strong>Ensuite :</strong> définition 720p, qualité Pro, affiches avec texte, notifications WhatsApp,
            offres pour entreprises et parrainage.
          </li>
          <li>
            <strong>Plus tard :</strong> ouverture à d’autres pays africains utilisant le mobile money, avec leurs
            devises, leurs prix et une interface en anglais.
          </li>
        </ul>
        <p>Ces étapes sont des intentions : leur calendrier dépend de la réussite de chaque phase précédente.</p>
      </Prose>
      <CtaBand />
    </>
  );
}
