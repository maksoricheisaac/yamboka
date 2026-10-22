import { Briefcase, PartyPopper, Store, Video } from "lucide-react";
import type { Metadata } from "next";
import { CtaBand, PageHero, Section } from "@/components/site/blocks";

export const metadata: Metadata = {
  title: "Cas d’usage",
  description:
    "Créateurs de contenu, commerçants, organisateurs d’événements, agences : comment Yamboka répond à chaque besoin, à petit prix.",
  alternates: { canonical: "/cas-utilisation" },
};

const CASES = [
  {
    icon: Video,
    who: "Créateurs de contenu et jeunes urbains",
    problem: "Pas de carte bancaire, des outils en anglais.",
    answer: "Des vidéos virales en 3 clics, payées en mobile money, prêtes pour TikTok et WhatsApp.",
    example: "Un pack Découverte (1 000 FCFA) correspond à une vidéo de 10 secondes.",
  },
  {
    icon: Store,
    who: "Commerçants, restaurants, boutiques, salons",
    problem: "Pas de budget pour un vidéaste.",
    answer: "Des publicités courtes à partir d’une simple vidéo de téléphone, avec des modèles pour la pub.",
    example: "Un pack Pro (5 000 FCFA) correspond à environ 5 vidéos de 10 secondes.",
  },
  {
    icon: PartyPopper,
    who: "Événementiel, églises, associations",
    problem: "Des contenus de promotion coûteux.",
    answer: "Des vidéos et des visuels personnalisés à petit prix pour inviter, annoncer et remercier.",
    example: "Un pack Créateur (2 500 FCFA) correspond à environ 2 vidéos de 10 secondes et 11 images.",
  },
  {
    icon: Briefcase,
    who: "Agences et community managers",
    problem: "Une production lente.",
    answer: "Des packs volumineux au coût prévisible pour produire plus vite pour plusieurs clients.",
    example: "Un pack Agence (25 000 FCFA) correspond à environ 27 vidéos de 10 secondes.",
  },
];

export default function UseCasesPage() {
  return (
    <>
      <PageHero
        eyebrow="Cas d’usage"
        title="Pour ceux qui créent, vendent et organisent"
        lead="Yamboka s’adresse à celles et ceux qui ont besoin de contenu vidéo court, sans le budget ni les outils habituels."
      />
      <Section labelledBy="cases-title">
        <h2 id="cases-title" className="sr-only">Les usages</h2>
        <ul className="grid gap-6 md:grid-cols-2">
          {CASES.map((c) => (
            <li key={c.who} className="flex flex-col rounded-2xl border bg-card p-6 shadow-soft">
              <c.icon className="size-7 text-primary" aria-hidden />
              <h3 className="mt-3 text-xl font-bold">{c.who}</h3>
              <dl className="mt-3 space-y-2 text-muted-foreground">
                <div>
                  <dt className="inline font-semibold text-foreground">Le problème : </dt>
                  <dd className="inline">{c.problem}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold text-foreground">Avec Yamboka : </dt>
                  <dd className="inline">{c.answer}</dd>
                </div>
              </dl>
              <p className="mt-4 rounded-lg bg-muted p-3 text-sm">{c.example}</p>
            </li>
          ))}
        </ul>
      </Section>
      <CtaBand />
    </>
  );
}
