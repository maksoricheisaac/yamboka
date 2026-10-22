import type { Metadata } from "next";
import Link from "next/link";
import { PageHero, Prose } from "@/components/site/blocks";
import { LegalDraftNotice } from "@/components/site/legal-notice";

export const metadata: Metadata = {
  title: "Conditions d’utilisation",
  description: "Conditions générales d’utilisation de Yamboka : compte, crédits, créations, responsabilités et suspension.",
  alternates: { canonical: "/conditions-utilisation" },
};

export default function TermsPage() {
  return (
    <>
      <PageHero eyebrow="Légal" title="Conditions d’utilisation" lead="Les règles qui s’appliquent à l’utilisation de Yamboka." />
      <Prose>
        <LegalDraftNotice />
        <h2>Le service</h2>
        <p>
          Yamboka est une plateforme de génération de vidéos et d’images par intelligence artificielle, payable avec
          des crédits prépayés.
        </p>

        <h2>Compte</h2>
        <p>
          Vous pouvez créer un compte avec Google ou avec une adresse e-mail et un mot de passe. L’adresse e-mail doit
          être vérifiée pour acheter des crédits et lancer des créations. Vous acceptez les présentes conditions et la{" "}
          <Link href="/charte-utilisation" className="underline underline-offset-4">charte d’utilisation</Link> à
          l’inscription.
        </p>

        <h2>Crédits</h2>
        <ul>
          <li>1 crédit = 25 FCFA (valeur indicative susceptible d’évoluer).</li>
          <li>Les crédits ne sont ni remboursables en argent, ni transférables entre comptes.</li>
          <li>Les crédits achetés expirent 12 mois après l’achat ; les crédits de bienvenue après 30 jours.</li>
          <li>Les crédits sont réservés au lancement d’une création, débités si elle réussit, restitués si elle échoue.</li>
        </ul>

        <h2>Créations</h2>
        <p>
          Vous déclarez avoir le droit d’utiliser les contenus que vous envoyez et avoir obtenu l’accord des personnes
          qui y figurent. Vous restez responsable de l’usage que vous faites des créations. Les résultats générés par
          IA peuvent être imparfaits ; une création échouée est remboursée en crédits.
        </p>

        <h2>Conservation des fichiers</h2>
        <p>
          Les fichiers envoyés sont supprimés 7 jours après la génération et les créations après 90 jours. Pensez à
          télécharger ce que vous souhaitez conserver.
        </p>

        <h2>Suspension</h2>
        <p>
          En cas de non-respect de la charte, Yamboka peut masquer un contenu, avertir, suspendre ou bannir un compte.
        </p>

        <h2>Évolution des conditions</h2>
        <p>
          Les conditions peuvent évoluer. Une nouvelle version majeure doit être acceptée pour continuer à utiliser le
          service.
        </p>
      </Prose>
    </>
  );
}
