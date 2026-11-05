import { z } from 'zod';
import type { VideoResolution } from './pricing';

/** Contrats du catalogue : packs de crédits, produits de génération, devis. */


export interface PackView {
  id: string;
  name: string;
  currency: string;
  priceFcfa: number;
  baseCredits: number;
  bonusPercent: number;
  totalCredits: number;
  featured: boolean;
  /** Ce que permet le pack à chaque résolution : secondes de vidéo et vidéos de 5 s, calculés depuis les tarifs en base. */
  equivalent: Record<VideoResolution, { seconds: number; videos: number }>;
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
