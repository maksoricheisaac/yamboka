import type { Metadata } from "next";
import { PageHero, Prose } from "@/components/site/blocks";
import { LegalDraftNotice } from "@/components/site/legal-notice";

export const metadata: Metadata = {
  title: "Charte d’utilisation",
  description:
    "Règles d’usage responsable de Yamboka : contenus interdits, consentement, filigrane, signalement et modération.",
  alternates: { canonical: "/charte-utilisation" },
};

export default function CharterPage() {
  return (
    <>
      <PageHero eyebrow="Légal" title="Charte d’utilisation responsable" lead="Créer librement, sans nuire à personne." />
      <Prose>
        <LegalDraftNotice />
        <h2>Contenus interdits</h2>
        <p>Il est interdit de créer, de téléverser ou de diffuser avec Yamboka :</p>
        <ul>
          <li>du contenu sexuel ;</li>
          <li>tout contenu impliquant des mineurs de manière inappropriée ;</li>
          <li>l’usurpation d’identité, y compris les « deepfakes » destinés à tromper ;</li>
          <li>du contenu politique trompeur ;</li>
          <li>le harcèlement, l’incitation à la haine ou à la violence ;</li>
          <li>les arnaques et les contenus frauduleux.</li>
        </ul>

        <h2>Consentement</h2>
        <p>
          À chaque création, vous confirmez avoir le droit d’utiliser les images et vidéos envoyées, et que les
          personnes qui y figurent ont donné leur accord. Ce consentement est horodaté et conservé.
        </p>

        <h2>Filigrane</h2>
        <p>Toutes les vidéos générées portent un filigrane discret de la plateforme.</p>

        <h2>Signalement et modération</h2>
        <p>
          Tout contenu signalé est examiné sous 24 heures. Un contenu manifestement illicite est masqué
          immédiatement. Selon la gravité, un compte peut recevoir un avertissement, être suspendu temporairement ou
          être banni.
        </p>

        <h2>Traces conservées</h2>
        <p>
          Pour pouvoir répondre à une réquisition légale, Yamboka conserve des traces (utilisateur, horodatage,
          consentement, identifiants des fichiers, adresse IP), même après la suppression des fichiers.
        </p>
      </Prose>
    </>
  );
}
