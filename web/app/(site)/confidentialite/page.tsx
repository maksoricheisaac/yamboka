import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { PageHero, Prose } from "@/components/site/blocks";
import { LegalDraftNotice } from "@/components/site/legal-notice";

export const metadata: Metadata = pageMetadata({ title: "Politique de confidentialité", description: "Quelles données Yamboka collecte, combien de temps elles sont conservées, où elles sont stockées et comment demander leur suppression.", path: "/confidentialite" });

export default function PrivacyPage() {
  return (
    <>
      <PageHero path="/confidentialite" eyebrow="Légal" title="Politique de confidentialité" lead="Nous limitons les données au strict nécessaire." />
      <Prose>
        <LegalDraftNotice />
        <h2>Données collectées</h2>
        <ul>
          <li>Compte : prénom, nom, adresse e-mail, mot de passe (stocké sous forme chiffrée irréversible).</li>
          <li>Facultatif : numéro de téléphone mobile money, utilisé pour préremplir le paiement et vous contacter.</li>
          <li>Connexion avec Google : prénom, nom et adresse e-mail issus de votre compte Google.</li>
          <li>Vos fichiers : vidéos et photos envoyées, et créations générées.</li>
          <li>Traces techniques : adresse IP, horodatages, consentements, historique des crédits et des achats.</li>
        </ul>

        <h2>Durées de conservation</h2>
        <ul>
          <li>Vidéos et photos que vous envoyez : supprimées 7 jours après la génération.</li>
          <li>Créations générées : conservées 90 jours, avec un rappel 7 jours avant la suppression.</li>
          <li>
            Fichiers liés à un signalement en cours : conservés jusqu’à la clôture du signalement.
          </li>
          <li>
            Traces (sans les fichiers) : conservées pour répondre à une réquisition légale.
          </li>
        </ul>

        <h2>Où sont stockées vos données</h2>
        <p>
          Les fichiers sont stockés de manière privée sur Cloudflare R2 et ne sont accessibles que par des liens
          temporaires. Pour générer votre création, vos fichiers sont envoyés au fournisseur de génération par IA.
        </p>

        <h2>Vos droits</h2>
        <p>
          Vous pouvez consulter et modifier votre profil, supprimer une création, et demander la suppression de votre
          compte. Les données personnelles sont limitées au nécessaire.
        </p>

        <h2>Cookies</h2>
        <p>
          Yamboka utilise un cookie de session sécurisé pour vous maintenir connecté, et mémorise votre préférence de
          thème (clair ou sombre) sur votre appareil. Aucun suivi publicitaire n’est utilisé.
        </p>
      </Prose>
    </>
  );
}
