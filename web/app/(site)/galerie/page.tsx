import type { Metadata } from "next";
import { CtaBand, PageHero, Section, SectionHeading } from "@/components/site/blocks";
import { DemoKind, DemoVisual } from "@/components/site/demo-visual";

export const metadata: Metadata = {
  title: "Galerie",
  description:
    "Des idées de créations : danse, publicité de boutique, anniversaire, mode et événements. Illustrations de démonstration de Yamboka.",
  alternates: { canonical: "/galerie" },
};

const CATEGORIES: {
  title: string;
  text: string;
  items: { kind: DemoKind; label: string; video: boolean }[];
}[] = [
  {
    title: "Danse et créateurs",
    text: "Faites danser un personnage sur le mouvement de votre propre vidéo, pour TikTok et les statuts WhatsApp.",
    items: [
      { kind: "danse", label: "Danse afro", video: true },
      { kind: "portrait", label: "Portrait stylisé", video: false },
    ],
  },
  {
    title: "Commerces et publicité",
    text: "Une courte pub pour une boutique, un restaurant ou un salon, à partir d’une simple vidéo de téléphone.",
    items: [
      { kind: "boutique", label: "Pub de boutique", video: true },
      { kind: "mode", label: "Mode et vitrine", video: false },
    ],
  },
  {
    title: "Fêtes et événements",
    text: "Anniversaires, mariages, concerts, églises, associations : des contenus personnalisés pour inviter et remercier.",
    items: [
      { kind: "anniversaire", label: "Anniversaire", video: true },
      { kind: "evenement", label: "Invitation d’événement", video: false },
    ],
  },
];

export default function GalleryPage() {
  return (
    <>
      <PageHero
        eyebrow="Galerie"
        title="Des idées de créations pour vous inspirer"
        lead="Ces visuels sont des illustrations de démonstration, pas des résultats générés. Les vraies créations seront publiées avec l’accord de leurs auteurs."
      />
      {CATEGORIES.map((cat, i) => (
        <Section key={cat.title} tone={i % 2 ? "muted" : "default"} labelledBy={`cat-${i}`}>
          <SectionHeading id={`cat-${i}`} title={cat.title} lead={cat.text} />
          <div className="grid grid-cols-2 gap-4 sm:max-w-xl">
            {cat.items.map((item) => (
              <DemoVisual key={item.label} kind={item.kind} video={item.video} label={item.label} />
            ))}
          </div>
        </Section>
      ))}
      <CtaBand />
    </>
  );
}
