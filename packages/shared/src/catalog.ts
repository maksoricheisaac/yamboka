import { z } from 'zod';

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
  /** Ce que permet le pack, calculé côté serveur à partir des produits actifs (secondes de vidéo OU images). */
  equivalent: { videoSeconds: number; images: number };
}

export interface ProductView {
  code: string;
  name: string;
  billingUnit: 'SECOND' | 'IMAGE';
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
