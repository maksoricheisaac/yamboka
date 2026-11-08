import { cacheLife, cacheTag } from 'next/cache';

/**
 * Tarification du site public, lue sur l'API (GET /api/catalog/pricing) : la MÊME source que l'espace client et que
 * le moteur de génération. Aucun tarif n'est écrit ici : une modification faite dans l'administration apparaît sur
 * cette page à la prochaine actualisation du cache (une minute).
 */

export interface PricingResolution {
  id: string;
  label: string;
  creditsPerSecond: number;
}

export interface PricingCountry {
  iso: string;
  name: string;
  currency: string;
  dialCode: string;
  methods: { code: string; name: string }[];
  custom: { unitPrice: number; minCredits: number; maxCredits: number } | null;
}

export interface PricingData {
  duration: { min: number; max: number; default: number };
  resolutions: PricingResolution[];
  countries: PricingCountry[];
}

/** Échec capturé ICI (voir offer.ts) : une erreur levée dans une fonction mise en cache ferait échouer la compilation hors ligne. */
export async function getPricing(): Promise<PricingData | null> {
  'use cache';
  cacheLife('minutes');
  cacheTag('offers');
  try {
    const base = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';
    const res = await fetch(`${base}/api/catalog/pricing`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const json = (await res.json()) as PricingData;
    // Une réponse sans tarif vidéo n'est pas exploitable : on l'ignore plutôt que d'afficher des zéros.
    return json.resolutions.some((r) => r.creditsPerSecond > 0) ? json : null;
  } catch {
    return null;
  }
}

/** Montant à la carte d'une quantité de crédits : même formule que le serveur (⌈ crédits × prix ⌉, en centièmes entiers). */
export function amountFor(credits: number, unitPrice: number): number {
  return Math.ceil((credits * Math.round(unitPrice * 100)) / 100);
}
