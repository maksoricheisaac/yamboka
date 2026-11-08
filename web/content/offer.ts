import { cacheLife, cacheTag } from 'next/cache';

/**
 * Offre commerciale du site public (source : cahier des charges §5.2, business plan §4.3).
 * Trois offres au maximum : une d'entrée, une recommandée, une pour les utilisateurs réguliers.
 * Les offres viennent de l'API (packs actifs ET publiés dans l'administration). Si l'API est injoignable,
 * on retombe sur les valeurs du business plan ci-dessous : le site reste utilisable.
 */

export interface PublicOffer {
  name: string;
  priceFcfa: number;
  totalCredits: number;
  bonusPercent: number;
  /** Ce que permet l'offre, en exemples concrets. */
  example: string;
  /** Nombre de vidéos que permet l'offre (même base que `example`). */
  videos: number;
  featured: boolean;
  /** Intitulé explicite de la place de l'offre dans la gamme. */
  role: string;
}

const MAX_PUBLIC_OFFERS = 3;

/** « ≈ 31 vidéos » : ce que permet le solde, en nombre de vidéos. */
export function exampleFor(videos: number): string {
  return videos > 0 ? `≈ ${videos} vidéo${videos > 1 ? 's' : ''}` : '';
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

/**
 * Offre de secours (API injoignable) : prix et crédits seulement. Aucun nombre de vidéos : il dépend des tarifs de
 * création, qui ne sont lus qu'à l'API (jamais recopiés ici, sinon ils finiraient par diverger).
 */
function staticOffer(name: string, priceFcfa: number, base: number, bonusPercent: number, featured = false) {
  const total = totalOf(base, bonusPercent);
  return { name, priceFcfa, totalCredits: total, bonusPercent, example: '', videos: 0, featured };
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
  equivalent: { videos: number };
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
    const res = await fetch(`${base}/api/catalog/packs/public`, { signal: AbortSignal.timeout(3000) });
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
      example: exampleFor(p.equivalent.videos),
      videos: p.equivalent.videos,
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
