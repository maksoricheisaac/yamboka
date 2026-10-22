/** Configuration éditoriale du site public. Textes en français (i18n prévue : tout est regroupé ici). */

export const SITE = {
  name: 'Yamboka',
  tagline: 'Créez des vidéos et des images par IA, payées en mobile money.',
  description:
    'Yamboka est une plateforme en français pour créer des vidéos et des images par intelligence artificielle, avec des crédits prépayés à partir de 500 FCFA. Né à Brazzaville, pensé pour l’Afrique.',
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001',
  /** Numéro WhatsApp international sans « + » (ex. 242060000000). Le bouton est masqué s’il est absent. */
  whatsapp: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '',
} as const;

export const signupUrl = `${SITE.appUrl}/inscription`;
export const loginUrl = `${SITE.appUrl}/connexion`;

export interface NavItem {
  label: string;
  href: string;
}

export const MAIN_NAV: NavItem[] = [
  { label: 'Fonctionnalités', href: '/fonctionnalites' },
  { label: 'Comment ça marche', href: '/comment-ca-marche' },
  { label: 'Tarifs', href: '/tarifs' },
  { label: 'Galerie', href: '/galerie' },
  { label: 'Cas d’usage', href: '/cas-utilisation' },
];

export const FOOTER_NAV: { title: string; links: NavItem[] }[] = [
  {
    title: 'Produit',
    links: [
      { label: 'Fonctionnalités', href: '/fonctionnalites' },
      { label: 'Comment ça marche', href: '/comment-ca-marche' },
      { label: 'Tarifs', href: '/tarifs' },
      { label: 'Galerie', href: '/galerie' },
    ],
  },
  {
    title: 'Entreprise',
    links: [
      { label: 'À propos', href: '/a-propos' },
      { label: 'Cas d’usage', href: '/cas-utilisation' },
      { label: 'FAQ', href: '/faq' },
      { label: 'Contact', href: '/contact' },
    ],
  },
  {
    title: 'Légal',
    links: [
      { label: 'Conditions d’utilisation', href: '/conditions-utilisation' },
      { label: 'Charte d’utilisation', href: '/charte-utilisation' },
      { label: 'Confidentialité', href: '/confidentialite' },
    ],
  },
];

export function whatsappLink(message = 'Bonjour Yamboka,'): string | null {
  if (!SITE.whatsapp) return null;
  return `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(message)}`;
}
