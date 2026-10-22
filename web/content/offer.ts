/**
 * Offre commerciale affichée sur le site (source : cahier des charges §5.2, business plan §4.3).
 * Valeurs d'affichage : l'application privée utilise les données de l'API, modifiables dans l'admin.
 */

export const CREDIT_VALUE_FCFA = 25;

export interface Pack {
  name: string;
  priceFcfa: number;
  baseCredits: number;
  bonusPercent: number;
  /** Exemple concret d'utilisation (business plan §4.3). */
  example: string;
  featured?: boolean;
}

export const PACKS: Pack[] = [
  { name: 'Mini', priceFcfa: 500, baseCredits: 20, bonusPercent: 0, example: '1 vidéo de 5 s' },
  { name: 'Découverte', priceFcfa: 1000, baseCredits: 40, bonusPercent: 0, example: '1 vidéo de 10 s' },
  {
    name: 'Créateur',
    priceFcfa: 2500,
    baseCredits: 100,
    bonusPercent: 3,
    example: '2 vidéos de 10 s + 11 images',
    featured: true,
  },
  { name: 'Pro', priceFcfa: 5000, baseCredits: 200, bonusPercent: 5, example: '5 vidéos de 10 s' },
  { name: 'Business', priceFcfa: 10000, baseCredits: 400, bonusPercent: 8, example: '10 vidéos de 10 s' },
  { name: 'Agence', priceFcfa: 25000, baseCredits: 1000, bonusPercent: 10, example: '27 vidéos de 10 s' },
];

/** Crédits totaux d'un pack (bonus inclus), en entiers. */
export function totalCredits(pack: Pack): number {
  return Math.floor((pack.baseCredits * (100 + pack.bonusPercent)) / 100);
}

export interface PriceRow {
  label: string;
  detail: string;
  credits: string;
  fcfa: string;
  available: boolean;
}

export const PRICES: PriceRow[] = [
  {
    label: 'Vidéo 480p',
    detail: 'Transfert de mouvement, 4 à 15 secondes',
    credits: '4 crédits / seconde',
    fcfa: '100 FCFA / seconde (10 s = 1 000 FCFA)',
    available: true,
  },
  {
    label: 'Image portrait',
    detail: 'Portrait et mode',
    credits: '2 crédits / image',
    fcfa: '50 FCFA / image',
    available: true,
  },
  {
    label: 'Vidéo 720p',
    detail: 'Meilleure définition',
    credits: '8 crédits / seconde',
    fcfa: '200 FCFA / seconde',
    available: false,
  },
  {
    label: 'Vidéo Pro',
    detail: 'Qualité supérieure, 480p ou 720p',
    credits: '13 à 28 crédits / seconde',
    fcfa: '325 à 700 FCFA / seconde',
    available: false,
  },
  {
    label: 'Affiche avec texte',
    detail: 'Visuels publicitaires',
    credits: '4 crédits / image',
    fcfa: '100 FCFA / image',
    available: false,
  },
];

export function formatFcfa(value: number): string {
  return `${new Intl.NumberFormat('fr-FR').format(value)} FCFA`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('fr-FR').format(value);
}
