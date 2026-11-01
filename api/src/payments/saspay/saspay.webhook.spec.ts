import { createHmac } from 'node:crypto';
import {
  isTransactionEvent,
  saspayWebhookSchema,
  verifySaspayWebhook,
} from './saspay.webhook';

const secret = 'whsec_test_0123456789abcdef';
const now = new Date('2026-11-01T12:00:00Z');
const ts = String(Math.floor(now.getTime() / 1000));
const raw =
  '{"event":"transaction.success","data":{"id":"7c1a","amount":"9500.00"}}';
const sign = (timestamp: string, body: string, key = secret) =>
  createHmac('sha256', key).update(`${timestamp}.${body}`).digest('hex');

const check = (over: Partial<Parameters<typeof verifySaspayWebhook>[0]> = {}) =>
  verifySaspayWebhook({
    rawBody: raw,
    signature: sign(ts, raw),
    timestamp: ts,
    secret,
    now,
    ...over,
  });

describe('verifySaspayWebhook', () => {
  it('accepte une signature valide (corps en chaîne ou en Buffer)', () => {
    expect(check()).toEqual({ ok: true });
    expect(check({ rawBody: Buffer.from(raw) })).toEqual({ ok: true });
  });

  it('refuse une signature calculée avec un autre secret', () => {
    expect(
      check({ signature: sign(ts, raw, 'autre-secret-0123456789') }),
    ).toEqual({ ok: false, reason: 'signature' });
  });

  it('refuse un corps modifié (la signature porte sur le corps brut)', () => {
    expect(check({ rawBody: raw.replace('9500', '1') })).toEqual({
      ok: false,
      reason: 'signature',
    });
    // Re-sérialiser le JSON change les octets : la signature ne correspond plus.
    expect(
      check({ rawBody: JSON.stringify(JSON.parse(raw), null, 1) }),
    ).toEqual({
      ok: false,
      reason: 'signature',
    });
  });

  it('refuse une signature mal formée', () => {
    for (const signature of ['abc', 'z'.repeat(64), sign(ts, raw) + '00']) {
      expect(check({ signature })).toEqual({ ok: false, reason: 'signature' });
    }
  });

  it('refuse un horodatage trop ancien ou trop lointain (anti-rejeu, 300 s)', () => {
    for (const delta of [-301, 301, -86400]) {
      const t = String(Number(ts) + delta);
      expect(check({ timestamp: t, signature: sign(t, raw) })).toEqual({
        ok: false,
        reason: 'timestamp',
      });
    }
    const edge = String(Number(ts) - 300);
    expect(check({ timestamp: edge, signature: sign(edge, raw) })).toEqual({
      ok: true,
    });
  });

  it('refuse un horodatage qui n’est pas un entier', () => {
    expect(check({ timestamp: '12abc' })).toEqual({
      ok: false,
      reason: 'timestamp',
    });
    expect(check({ timestamp: '1e9' })).toEqual({
      ok: false,
      reason: 'timestamp',
    });
  });

  it('refuse quand un élément manque, même sans secret configuré', () => {
    for (const over of [
      { signature: undefined },
      { timestamp: undefined },
      { rawBody: undefined },
      { secret: '' },
    ]) {
      expect(check(over)).toEqual({ ok: false, reason: 'missing' });
    }
  });
});

describe('saspayWebhookSchema', () => {
  it('lit un événement de transaction et garde les champs inconnus', () => {
    const parsed = saspayWebhookSchema.parse(JSON.parse(raw));
    expect(parsed.event).toBe('transaction.success');
    expect(parsed.data.id).toBe('7c1a');
    expect(parsed.data.amount).toBe('9500.00');
  });

  it('refuse un événement sans identifiant de transaction', () => {
    expect(
      saspayWebhookSchema.safeParse({ event: 'transaction.success', data: {} })
        .success,
    ).toBe(false);
    expect(saspayWebhookSchema.safeParse({ data: { id: 'x' } }).success).toBe(
      false,
    );
  });

  it('distingue les événements de transaction des autres', () => {
    expect(isTransactionEvent('transaction.failed')).toBe(true);
    expect(isTransactionEvent('webhook.test')).toBe(false);
    expect(isTransactionEvent('settlement.success')).toBe(false);
  });
});
