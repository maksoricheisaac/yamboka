import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

/** Tolérance d'horodatage imposée par SasPay (anti-rejeu). */
export const WEBHOOK_TOLERANCE_SECONDS = 300;

export type WebhookCheck =
  { ok: true } | { ok: false; reason: 'missing' | 'timestamp' | 'signature' };

/**
 * Vérifie un webhook SasPay (docs § Webhooks) :
 *   attendu = hex( HMAC_SHA256(signing_secret, `${X-Webhook-Timestamp}.${corps brut}`) )
 * Le corps doit être le corps BRUT reçu, jamais re-sérialisé. Comparaison en temps constant.
 * Même signature valide, le contenu n'est jamais cru : il ne fait que déclencher une vérification (RG-04).
 */
export function verifySaspayWebhook(input: {
  rawBody: Buffer | string | undefined;
  signature: string | null | undefined;
  timestamp: string | null | undefined;
  secret: string;
  now?: Date;
}): WebhookCheck {
  const { rawBody, signature, timestamp, secret } = input;
  if (rawBody === undefined || !signature || !timestamp || !secret) {
    return { ok: false, reason: 'missing' };
  }
  if (!/^\d{1,12}$/.test(timestamp)) return { ok: false, reason: 'timestamp' };
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  if (Math.abs(nowSeconds - Number(timestamp)) > WEBHOOK_TOLERANCE_SECONDS) {
    return { ok: false, reason: 'timestamp' };
  }
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody);
  const expected = createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(`${timestamp}.`), body]))
    .digest();
  const received = /^[0-9a-fA-F]{64}$/.test(signature)
    ? Buffer.from(signature, 'hex')
    : null;
  if (!received || !timingSafeEqual(received, expected)) {
    return { ok: false, reason: 'signature' };
  }
  return { ok: true };
}

/** Événements de transaction (docs § Webhooks). Les autres (settlement.*, wallet_transfer.*, webhook.test) sont ignorés. */
export const TRANSACTION_EVENTS = [
  'transaction.created',
  'transaction.success',
  'transaction.failed',
  'transaction.cancelled',
] as const;

/**
 * Forme minimale utile d'une notification. `data.id` = identifiant de la transaction (= `id` renvoyé à l'initiation).
 * Le payload ne contient pas `metadata` : la jointure avec notre paiement se fait uniquement sur cet identifiant.
 * Tout le reste est conservé tel quel mais n'est jamais utilisé pour décider d'un crédit.
 */
export const saspayWebhookSchema = z.looseObject({
  event: z.string().min(1).max(100),
  data: z.looseObject({ id: z.string().trim().min(1).max(100) }),
});

export type SaspayWebhook = z.infer<typeof saspayWebhookSchema>;

export function isTransactionEvent(event: string): boolean {
  return (TRANSACTION_EVENTS as readonly string[]).includes(event);
}
