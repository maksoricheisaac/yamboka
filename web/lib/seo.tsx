import type { Metadata } from "next";
import { SITE } from "@/content/site";

/**
 * Métadonnées d'une page publique : titre, description, URL canonique, Open Graph et Twitter/X.
 * (Un `openGraph` défini sur une page REMPLACE celui du layout : on le répète donc ici, en entier.)
 * L'image de partage (1200×630) est générée par app/opengraph-image.tsx et app/twitter-image.tsx.
 */
export function pageMetadata({ title, description, path }: { title: string; description: string; path: string }): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      locale: "fr_FR",
      siteName: SITE.name,
      title: `${title} | ${SITE.name}`,
      description,
      url: path,
      images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: `${SITE.name} — vidéos et images par IA, payées en mobile money` }],
    },
    twitter: { card: "summary_large_image", title: `${title} | ${SITE.name}`, description, images: ["/twitter-image"] },
  };
}

/** Données structurées JSON-LD. Le « < » est neutralisé : le contenu ne peut pas fermer la balise <script>. */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

export const organizationLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE.name,
  url: SITE.url,
  logo: `${SITE.url}/icon.svg`,
  description: SITE.description,
  address: { "@type": "PostalAddress", addressLocality: "Brazzaville", addressCountry: "CG" },
};

export const websiteLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE.name,
  url: SITE.url,
  inLanguage: "fr",
};

export function breadcrumbLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: `${SITE.url}${item.path}`,
    })),
  };
}
