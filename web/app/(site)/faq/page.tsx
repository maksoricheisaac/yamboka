import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { CtaBand, PageHero, Section } from "@/components/site/blocks";
import { FaqList } from "@/components/site/faq-list";
import { FAQ } from "@/content/faq";

export const metadata: Metadata = pageMetadata({ title: "FAQ", description: "Réponses aux questions fréquentes sur Yamboka : crédits, prix, paiement mobile money, délais, conservation des fichiers et usage responsable.", path: "/faq" });

export default function FaqPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <PageHero path="/faq" eyebrow="FAQ" title="Questions fréquentes" lead="Vous ne trouvez pas votre réponse ? Écrivez-nous depuis la page contact." />
      <Section labelledBy="faq-list-title">
        <h2 id="faq-list-title" className="sr-only">Toutes les questions</h2>
        <FaqList items={FAQ} />
      </Section>
      <CtaBand />
    </>
  );
}
