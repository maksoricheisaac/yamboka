import type { Metadata } from "next";
import { Gallery } from "@/components/gallery/gallery";
import { CtaBand, PageHero, Section } from "@/components/site/blocks";
import { getMedia } from "@/lib/media";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Exemples",
  description:
    "Des idées de créations : danse, publicité de boutique, anniversaire, mode et événements. Illustrations de démonstration de Yamboka.",
  path: "/galerie",
});

export default function GalleryPage() {
  const { gallery, galleryComplete } = getMedia();
  return (
    <>
      <PageHero
        path="/galerie"
        eyebrow="Exemples"
        title="À quoi peuvent ressembler vos créations"
        lead={
          galleryComplete
            ? "Touchez un exemple pour l’agrandir. Ces exemples ont été générés avec Yamboka."
            : "Touchez un exemple pour l’agrandir. Les visuels étiquetés « Démo » sont des illustrations ; les vraies créations seront publiées avec l’accord de leurs auteurs."
        }
      />
      <Section labelledBy="gallery-title">
        <h2 id="gallery-title" className="sr-only">Galerie d’exemples</h2>
        <Gallery items={gallery} />
      </Section>
      <CtaBand title="Une idée en tête ?" lead="Créez un compte : le coût de chaque création s’affiche avant de confirmer." />
    </>
  );
}
