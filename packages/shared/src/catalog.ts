import { z } from 'zod';

/** Contrats du catalogue : packs de crédits, produits de génération, devis. */

/** Durée d'une vidéo Yamboka, en secondes : celle des vidéos de référence (Genjutsu Light, durée fixe). */
export const VIDEO_SECONDS = 4;

export interface PackView {
  id: string;
  name: string;
  currency: string;
  priceFcfa: number;
  baseCredits: number;
  bonusPercent: number;
  totalCredits: number;
  featured: boolean;
  /** Ce que permet le pack, calculé côté serveur à partir du produit vidéo actif (nombre de vidéos). */
  equivalent: { videos: number };
}

export interface ProductView {
  code: string;
  name: string;
  billingUnit: 'SECOND';
  creditsPerUnit: number;
  minSeconds: number | null;
  maxSeconds: number | null;
}

export interface QuoteView {
  productCode: string;
  credits: number;
  billableSeconds: number | null;
  creditValueFcfa: number;
  valueFcfa: number;
}

export const quoteSchema = z.object({
  productCode: z.string().trim().min(1).max(60),
  durationSeconds: z.number().positive().max(3600).optional(),
});
export type QuoteInput = z.infer<typeof quoteSchema>;
