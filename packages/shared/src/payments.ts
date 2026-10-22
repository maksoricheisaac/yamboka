import { z } from 'zod';
import { phoneSchema } from './auth';

export const MOBILE_OPERATORS = ['MTN', 'AIRTEL'] as const;
export type MobileOperator = (typeof MOBILE_OPERATORS)[number];

export type PaymentStatus = 'INITIATED' | 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';

export const createPaymentSchema = z.object({
  packId: z.uuid({ error: 'Pack invalide.' }),
  operator: z.enum(MOBILE_OPERATORS, { error: 'Choisissez MTN ou Airtel.' }),
  phone: phoneSchema,
});
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

export interface PaymentView {
  id: string;
  status: PaymentStatus;
  packName: string;
  amountFcfa: number;
  currency: string;
  credits: number;
  bonusCredits: number;
  operator: MobileOperator;
  payerPhone: string;
  reference: string | null;
  failureReason: string | null;
  createdAt: string;
  creditedAt: string | null;
  /** Vrai quand le fournisseur est simulé : l'écran d'attente propose alors le simulateur. */
  simulated: boolean;
}

export interface PaymentReceipt extends PaymentView {
  receiptNumber: string;
}

/** Scénarios du faux fournisseur (mode simulation uniquement). */
export const SIMULATION_OUTCOMES = [
  'success',
  'failed',
  'cancelled',
  'forged_callback',
  'provider_error',
  'invalid_response',
] as const;
export type SimulationOutcome = (typeof SIMULATION_OUTCOMES)[number];

export const simulatePaymentSchema = z.object({
  outcome: z.enum(SIMULATION_OUTCOMES),
  /** Nombre de callbacks envoyés pour ce scénario (test de callbacks dupliqués). */
  callbacks: z.number().int().min(1).max(5).default(1),
});
export type SimulatePaymentInput = z.infer<typeof simulatePaymentSchema>;
