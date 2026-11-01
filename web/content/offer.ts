import { cacheLife, cacheTag } from 'next/cache';

/**
 * Offre commerciale du site public (source : cahier des charges §5.2, business plan §4.3).
 * Trois offres au maximum : une d'entrée, une recommandée, une pour les utilisateurs réguliers.
 * Les offres viennent de l'API (packs actifs ET publiés dans l'administration). Si l'API est injoignable,
 * on retombe sur les valeurs du business plan ci-dessous : le site reste utilisable.
 */

/** Tarif de référence : 1 vidéo de 10 s = 100 crédits (10 crédits par seconde). */
export const VIDEO_CREDITS_PER_SECOND = 10;
export const VIDEO_10S_CREDITS = VIDEO_CREDITS_PER_SECOND * 10;

export interface PublicOffer {
  name: string;
  priceFcfa: number;
  totalCredits: number;
  bonusPercent: number;
  /** Ce que permet l'offre, en exemples concrets. */
  example: string;
  /** Nombre de vidéos de 10 s et d'images que permet l'offre (mêmes bases que `example`). */
  videos: number;
  images: number;
  featured: boolean;
  /** Intitulé explicite de la place de l'offre dans la gamme. */
  role: string;
}

const MAX_PUBLIC_OFFERS = 3;
export const IMAGE_CREDITS = 2;

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

/** « 2 vidéos de 10 s ou 51 images » : deux façons de dépenser le même solde. */
export function exampleFor(videoSeconds: number, images: number): string {
  const videos = Math.floor(videoSeconds / 10);
  const parts: string[] = [];
  if (videos > 0) parts.push(`${plural(videos, 'vidéo')} de 10 s`);
  if (images > 0) parts.push(plural(images, 'image'));
  return parts.join(' ou ');
}

function withRoles(offers: Omit<PublicOffer, 'role'>[]): PublicOffer[] {
  const list = offers.slice(0, MAX_PUBLIC_OFFERS);
  // Une seule offre recommandée, même si plusieurs sont marquées côté serveur.
  const featuredIndex = list.findIndex((o) => o.featured);
  return list.map((o, i) => ({
    ...o,
    featured: i === featuredIndex,
    role:
      i === featuredIndex
        ? 'Recommandé'
        : i < (featuredIndex === -1 ? 1 : featuredIndex)
          ? 'Pour essayer'
          : 'Pour créer régulièrement',
  }));
}

const totalOf = (base: number, bonusPercent: number) => Math.floor((base * (100 + bonusPercent)) / 100);

function staticOffer(name: string, priceFcfa: number, base: number, bonusPercent: number, featured = false) {
  const total = totalOf(base, bonusPercent);
  return {
    name,
    priceFcfa,
    totalCredits: total,
    bonusPercent,
    example: exampleFor(Math.floor(total / VIDEO_CREDITS_PER_SECOND), Math.floor(total / IMAGE_CREDITS)),
    videos: Math.floor(total / VIDEO_CREDITS_PER_SECOND / 10),
    images: Math.floor(total / IMAGE_CREDITS),
    featured,
  };
}

/** Valeurs du business plan, utilisées si l'API ne répond pas. */
export const FALLBACK_OFFERS: PublicOffer[] = withRoles([
  staticOffer('Starter', 5000, 1250, 0),
  staticOffer('Pro', 10000, 2600, 0, true),
  staticOffer('Business', 25000, 6800, 0),
]);

interface ApiPack {
  name: string;
  priceFcfa: number;
  totalCredits: number;
  bonusPercent: number;
  featured: boolean;
  equivalent: { videoSeconds: number; images: number };
}

/**
 * Lecture mise en cache (1 min). L'échec est capturé ICI et renvoie `null` : une erreur levée dans une fonction
 * mise en cache fait échouer la compilation du site quand l'API n'est pas joignable (ce qui est normal à la
 * construction de l'image). Le résultat « indisponible » est donc mis en cache lui aussi, mais seulement une minute.
 */
async function fetchPublicPacks(): Promise<ApiPack[] | null> {
  'use cache';
  cacheLife('minutes');
  cacheTag('offers');
  try {
    const base = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';
    const res = await fetch(`${base}/v1/catalog/packs/public`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    return ((await res.json()) as { packs: ApiPack[] }).packs;
  } catch {
    return null;
  }
}

/** Offres publiques : celles que l'administrateur a publiées (3 au maximum). Valeurs du business plan seulement si l'API ne répond pas. */
export async function getPublicOffers(): Promise<PublicOffer[]> {
  const packs = await fetchPublicPacks();
  // API injoignable : valeurs du business plan. API joignable mais aucun pack publié : aucune offre (jamais de
  // prix inventés qui ne correspondraient à aucun pack réellement vendu).
  if (packs === null) return FALLBACK_OFFERS;
  return withRoles(
    packs.map((p) => ({
      name: p.name,
      priceFcfa: p.priceFcfa,
      totalCredits: p.totalCredits,
      bonusPercent: p.bonusPercent,
      example: exampleFor(p.equivalent.videoSeconds, p.equivalent.images),
      videos: Math.floor(p.equivalent.videoSeconds / 10),
      images: p.equivalent.images,
      featured: p.featured,
    })),
  );
}

export function formatFcfa(value: number): string {
  return `${new Intl.NumberFormat('fr-FR').format(value)} FCFA`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('fr-FR').format(value);
}

/** Consommation des créations disponibles (affichée en clair, sans tableau comparatif). */
export const UNIT_PRICES = [
  { label: 'Vidéo', detail: '5 ou 10 secondes', price: '10 crédits la seconde', example: '10 secondes = 100 crédits' },
  { label: 'Image portrait', detail: 'Portrait et mode', price: '2 crédits l’image', example: '2 crédits' },
];
