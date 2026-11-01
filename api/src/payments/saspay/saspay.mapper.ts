import { toScaled } from '../../billing/decimal';
import {
  ProviderInvalidResponseError,
  ProviderStatus,
} from '../payment-provider';

/** Statuts d'une transaction SasPay (docs.saspay.me) → statuts normalisés. CANCELLED existe mais n'est atteint par aucun flux actuel. */
const STATUS: Record<string, ProviderStatus> = {
  PENDING: 'pending',
  SUCCESS: 'success',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

/** Statut inconnu = réponse inexploitable : jamais interprété comme un échec ni comme un succès. */
export function mapSaspayStatus(status: unknown): ProviderStatus {
  const mapped = typeof status === 'string' ? STATUS[status] : undefined;
  if (!mapped) {
    throw new ProviderInvalidResponseError('Statut SasPay inconnu.');
  }
  return mapped;
}

/** Réseaux mobile money SasPay au Congo-Brazzaville (relevés via GET /networks/ le 1er nov. 2026). */
export const SASPAY_NETWORK_BY_OPERATOR = {
  MTN: 'mtn_cg',
  AIRTEL: 'airtel_cg',
} as const;

/** Montant en chaîne décimale SasPay ("2500.00") → entier. Un montant avec centimes est refusé (XAF n'en a pas). */
export function parseWholeAmount(value: unknown, field: string): number {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new ProviderInvalidResponseError(`Montant SasPay absent : ${field}.`);
  }
  let scaled: bigint;
  try {
    scaled = toScaled(value, 2);
  } catch {
    throw new ProviderInvalidResponseError(
      `Montant SasPay invalide : ${field}.`,
    );
  }
  if (scaled < 0n || scaled % 100n !== 0n) {
    throw new ProviderInvalidResponseError(
      `Montant SasPay non entier : ${field}.`,
    );
  }
  return Number(scaled / 100n);
}

/** Variante facultative : champ absent ou nul → null. */
export function parseOptionalWholeAmount(
  value: unknown,
  field: string,
): number | null {
  if (value === undefined || value === null || value === '') return null;
  return parseWholeAmount(value, field);
}

/** Montant entier → chaîne décimale attendue par SasPay. Jamais de flottant. */
export function formatAmount(amount: number): string {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new RangeError('Montant à envoyer invalide.');
  }
  return `${amount}.00`;
}
