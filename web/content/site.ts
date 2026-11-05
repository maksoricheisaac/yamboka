/** Configuration éditoriale du site public. Textes en français (i18n prévue : tout est regroupé ici). */

export const SITE = {
  name: 'Yamboka',
  tagline: 'Crée des vidéos pro pour ton business en quelques clics.',
  description:
    'Yamboka est une plateforme en français pour créer des vidéos professionnelles par intelligence artificielle à partir d’une simple photo, avec des crédits prépayés à partir de 5 000 FCFA. Né à Brazzaville, pensé pour l’Afrique.',
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001',
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
  /** Numéro WhatsApp international sans « + » (ex. 242060000000). Le bouton est masqué s’il est absent. */
  whatsapp: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '',
} as const;

export const signupUrl = `${SITE.appUrl}/inscription`;
export const loginUrl = `${SITE.appUrl}/connexion`;
/** Espaces privés (le contrôle d'accès reste côté application et API) : /app pour un client, /admin pour un administrateur. */
export const userSpaceUrl = `${SITE.appUrl}/app`;
export const adminSpaceUrl = `${SITE.appUrl}/admin`;

export interface NavItem {
  label: string;
  href: string;
}

/** Navigation principale : toutes les cibles sont des pages existantes (aucun lien mort). */
export const MAIN_NAV: NavItem[] = [
  { label: 'Accueil', href: '/' },
  { label: 'Exemples', href: '/galerie' },
  { label: 'Fonctionnalités', href: '/fonctionnalites' },
  { label: 'Tarifs', href: '/tarifs' },
];

export const CTA_LABEL = 'Créer mon compte';

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
