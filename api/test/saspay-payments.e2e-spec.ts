import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { createHmac, randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import type { FeeTier } from '../src/billing/fees';
import { configureApp } from '../src/configure-app';
import { CreditsService } from '../src/credits/credits.service';
import { MockPaymentProvider } from '../src/payments/mock-payment.provider';
import { PaymentProviders } from '../src/payments/payment-providers.service';
import {
  InitiatePaymentRequest,
  InitiatePaymentResult,
  PaymentProvider,
  PaymentStatusResult,
  ProviderInvalidResponseError,
  ProviderRejectedError,
  ProviderUnavailableError,
} from '../src/payments/payment-provider';
import {
  PaymentsService,
  TIMEOUT_REASON,
} from '../src/payments/payments.service';
import { Client, prismaOf } from './helpers';
import { TEST_ENV } from './test-env';
import { ledgerOf, verifiedClient } from './finance-helpers';

const PHONE = '+242061234567';
const TIERS: FeeTier[] = [
  {
    minAmount: 0,
    maxAmount: 100000000,
    percent: 5.7,
    fixed: 0,
    feeChargeMode: 'ADD_ON',
  },
];

/**
 * Faux SasPay : imite le contrat documenté. Même Idempotency-Key + même corps = même réponse (aucun doublon) ;
 * même clé + corps différent = 409. Permet de simuler une réponse perdue (le paiement existe chez le fournisseur
 * mais l'appelant n'en sait rien), une panne, un refus, et les statuts renvoyés par verify.
 */
class FakeSaspay extends PaymentProvider {
  readonly name = 'saspay';
  override readonly idempotent = true;
  override readonly pendingTtlMs = 60 * 60 * 1000;

  /** Paiements réellement créés chez le fournisseur, par clé d'idempotence. */
  readonly created = new Map<
    string,
    { reference: string; request: InitiatePaymentRequest }
  >();
  initiateCalls: InitiatePaymentRequest[] = [];
  /** Comportement du prochain appel d'initiation. */
  next:
    | 'ok'
    | 'down-before' // panne avant d'atteindre le fournisseur : rien n'est créé
    | 'lost-response' // créé chez le fournisseur, mais la réponse n'arrive pas
    | 'invalid-response'
    | 'reject' = 'ok';
  /** Statut que renverra verify, par référence. */
  statuses = new Map<string, PaymentStatusResult | Error>();

  reset() {
    this.created.clear();
    this.initiateCalls = [];
    this.next = 'ok';
    this.statuses.clear();
  }

  override networkFor(operator: 'MTN' | 'AIRTEL') {
    return operator === 'MTN' ? 'mtn_cg' : 'airtel_cg';
  }
  override getPayinTiers() {
    return Promise.resolve(TIERS);
  }

  initiate(request: InitiatePaymentRequest): Promise<InitiatePaymentResult> {
    this.initiateCalls.push(request);
    const key = request.idempotencyKey;
    if (!key) throw new Error('clé d’idempotence manquante');
    const behaviour = this.next;
    if (behaviour !== 'ok') this.next = 'ok'; // une seule défaillance par scénario
    if (behaviour === 'down-before') {
      return Promise.reject(new ProviderUnavailableError('panne'));
    }
    if (behaviour === 'reject') {
      return Promise.reject(
        new ProviderRejectedError('no_route_available', 'aucune route'),
      );
    }
    let entry = this.created.get(key);
    if (entry) {
      // Rejeu : le corps doit être strictement identique, sinon SasPay répond 409.
      if (JSON.stringify(entry.request) !== JSON.stringify(request)) {
        return Promise.reject(new ProviderUnavailableError('409 conflit'));
      }
    } else {
      entry = { reference: `SP-${randomUUID()}`, request };
      this.created.set(key, entry);
    }
    if (behaviour === 'lost-response') {
      return Promise.reject(new ProviderUnavailableError('timeout'));
    }
    if (behaviour === 'invalid-response') {
      return Promise.reject(new ProviderInvalidResponseError('illisible'));
    }
    return Promise.resolve({
      reference: entry.reference,
      status: 'pending',
      checkoutUrl: null,
    });
  }

  getStatus(reference: string): Promise<PaymentStatusResult> {
    const s = this.statuses.get(reference);
    if (s instanceof Error) return Promise.reject(s);
    if (s) return Promise.resolve(s);
    const created = [...this.created.values()].find(
      (c) => c.reference === reference,
    );
    return Promise.resolve({
      status: 'pending',
      amount: created?.request.amount ?? 0,
      currency: 'XAF',
    });
  }
}

describe('Paiements SasPay (e2e, fournisseur SasPay simulé)', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof prismaOf>;
  let payments: PaymentsService;
  const fake = new FakeSaspay();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PaymentProviders)
      .useFactory({
        inject: [MockPaymentProvider],
        factory: (mock: MockPaymentProvider) => ({
          forCountry: () => fake,
          byName: (name: string) => (name === 'saspay' ? fake : mock),
        }),
      })
      .compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    configureApp(app);
    await app.init();
    prisma = prismaOf(app);
    payments = app.get(PaymentsService);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => fake.reset());

  const buy = async (client: Client, pack = 'Starter') =>
    client.post('/v1/payments', {
      packId: (
        await prisma.creditPack.findFirstOrThrow({ where: { name: pack } })
      ).id,
      operator: 'MTN',
      phone: PHONE,
    });

  const creditsOf = async (client: Client) =>
    (await client.get('/v1/auth/me')).body.user.credits as number;

  /** Statut « succès » chez SasPay pour le montant réellement demandé. */
  const confirm = (
    reference: string,
    over: Partial<PaymentStatusResult> = {},
  ) => {
    const sent = fake.initiateCalls.at(-1)!.amount;
    fake.statuses.set(reference, {
      status: 'success',
      amount: sent,
      currency: 'XAF',
      clientFee: 270,
      debitedAmount: sent + 270,
      ...over,
    });
  };

  async function started(pack = 'Starter') {
    const { client, userId } = await verifiedClient(app);
    const res = await buy(client, pack);
    expect(res.status).toBe(201);
    const row = await prisma.payment.findFirstOrThrow({ where: { userId } });
    return { client, userId, row, id: row.id };
  }

  describe('Création', () => {
    it('envoie le prix moins les frais absorbés, avec une clé d’idempotence et le client', async () => {
      const { row, userId } = await started();
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });
      // Starter 5 000 FCFA : plus grand A tel que A + ⌈5,7 % de A⌉ ≤ 5 000.
      expect(row.amount).toBe(5000);
      expect(row.sentAmount).toBe(4730);
      expect(row.network).toBe('mtn_cg');
      expect(row.status).toBe('PENDING');
      expect(row.externalReference).toMatch(/^SP-/);
      expect(row.idempotencyKey).toBeTruthy();
      expect((row.feeSnapshot as { fee: number }).fee).toBe(270);

      const sent = fake.initiateCalls[0];
      expect(sent.amount).toBe(4730);
      expect(sent.idempotencyKey).toBe(row.idempotencyKey);
      expect(sent.network).toBe('mtn_cg');
      expect(sent.customer).toEqual({
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      });
      expect(sent.returnUrl).toContain(`/app/credits/paiement/${row.id}`);
      // La requête rejouable est conservée telle quelle, sans aucun secret.
      expect(row.providerRequest).toEqual(JSON.parse(JSON.stringify(sent)));
    });

    it('ne crédite rien tant que le paiement n’est pas confirmé', async () => {
      const { client, id } = await started();
      expect(await creditsOf(client)).toBe(0);
      expect(
        await prisma.creditLedger.count({ where: { paymentId: id } }),
      ).toBe(0);
    });

    it('un refus définitif du fournisseur échoue le paiement sans rien créditer', async () => {
      const { client, userId } = await verifiedClient(app);
      fake.next = 'reject';
      const res = await buy(client);
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('PAYMENT_REJECTED');
      expect(res.body.message).toContain('Aucun montant n’a été débité');
      const p = await prisma.payment.findFirstOrThrow({ where: { userId } });
      expect(p.status).toBe('FAILED');
      expect(await creditsOf(client)).toBe(0);
    });
  });

  describe('Délai dépassé : le paiement reste en attente, sans doublon', () => {
    it('panne avant d’atteindre SasPay : INITIATED (pas FAILED), puis rejeu avec la même clé', async () => {
      const { client, userId } = await verifiedClient(app);
      fake.next = 'down-before';
      const res = await buy(client);
      expect(res.status).toBe(201); // pas d'erreur : le paiement est simplement « en cours »
      expect(res.body.payment.status).toBe('INITIATED');
      let p = await prisma.payment.findFirstOrThrow({ where: { userId } });
      expect(p.status).toBe('INITIATED');
      expect(p.externalReference).toBeNull();
      expect(fake.created.size).toBe(0);

      await payments.reconcile();
      p = await prisma.payment.findUniqueOrThrow({ where: { id: p.id } });
      expect(p.status).toBe('PENDING');
      expect(p.externalReference).toBeTruthy();
      expect(fake.created.size).toBe(1);
      // Deux appels, une seule clé, un seul paiement chez le fournisseur.
      expect(fake.initiateCalls).toHaveLength(2);
      expect(fake.initiateCalls[1]).toEqual(fake.initiateCalls[0]);
    });

    it('réponse perdue alors que SasPay a créé le paiement : le rejeu retrouve le MÊME, pas un second', async () => {
      const { client, userId } = await verifiedClient(app);
      fake.next = 'lost-response';
      const res = await buy(client);
      expect(res.body.payment.status).toBe('INITIATED');
      expect(fake.created.size).toBe(1);
      const [created] = [...fake.created.values()];

      await payments.reconcile();
      await payments.reconcile(); // un 2e passage ne change rien
      const p = await prisma.payment.findFirstOrThrow({ where: { userId } });
      expect(p.status).toBe('PENDING');
      expect(p.externalReference).toBe(created.reference);
      expect(fake.created.size).toBe(1);
      expect(await prisma.payment.count({ where: { userId } })).toBe(1);
    });

    it('réponse illisible : même traitement, jamais déclaré échoué', async () => {
      const { client, userId } = await verifiedClient(app);
      fake.next = 'invalid-response';
      const res = await buy(client);
      expect(res.body.payment.status).toBe('INITIATED');
      await payments.reconcile();
      const p = await prisma.payment.findFirstOrThrow({ where: { userId } });
      expect(p.status).toBe('PENDING');
      expect(fake.created.size).toBe(1);
    });

    it('un client qui renvoie le formulaire pendant l’attente ne crée pas un 2e paiement', async () => {
      const { client, userId } = await verifiedClient(app);
      fake.next = 'down-before';
      await buy(client);
      await buy(client);
      expect(await prisma.payment.count({ where: { userId } })).toBe(1);
    });

    it('un paiement jamais initié au bout de 10 minutes est déclaré échoué (on cesse de rejouer)', async () => {
      const { client, userId } = await verifiedClient(app);
      fake.next = 'down-before';
      await buy(client);
      const p = await prisma.payment.findFirstOrThrow({ where: { userId } });
      const later = new Date(Date.now() + 11 * 60 * 1000);
      await payments.reconcile(later);
      const after = await prisma.payment.findUniqueOrThrow({
        where: { id: p.id },
      });
      expect(after.status).toBe('FAILED');
      expect(after.failureReason).toBe(TIMEOUT_REASON);
      expect(await creditsOf(client)).toBe(0);
    });
  });

  describe('Confirmation et crédit unique', () => {
    it('crédite une seule fois quand SasPay confirme le montant demandé', async () => {
      const { client, userId, row, id } = await started();
      confirm(row.externalReference!);
      expect(await payments.verify(id)).toBe('SUCCESS');
      expect(await creditsOf(client)).toBe(1250 + 250); // pack + bonus de premier achat
      const rows = await prisma.creditLedger.findMany({
        where: { paymentId: id },
      });
      expect(rows.map((r) => `${r.type}:${r.amount}`).sort()).toEqual([
        'FIRST_PURCHASE_BONUS:250',
        'PURCHASE:1250',
      ]);
      const p = await prisma.payment.findUniqueOrThrow({ where: { id } });
      expect(p.clientFee).toBe(270);
      expect(p.debitedAmount).toBe(4730 + 270);
      expect((await ledgerOf(app, userId)).length).toBe(2);
    });

    it('vérifications simultanées et répétées : un seul crédit', async () => {
      const { client, row, id } = await started();
      confirm(row.externalReference!);
      await Promise.all(Array.from({ length: 6 }, () => payments.verify(id)));
      await payments.verify(id);
      await payments.reconcile();
      expect(await creditsOf(client)).toBe(1500);
      expect(
        await prisma.creditLedger.count({ where: { paymentId: id } }),
      ).toBe(2);
    });

    it('en attente chez SasPay : aucun crédit', async () => {
      const { client, row, id } = await started();
      fake.statuses.set(row.externalReference!, {
        status: 'pending',
        amount: row.sentAmount!,
        currency: 'XAF',
      });
      expect(await payments.verify(id)).toBe('PENDING');
      expect(await creditsOf(client)).toBe(0);
    });

    it.each(['failed', 'cancelled'] as const)(
      'paiement %s chez SasPay : aucun crédit',
      async (status) => {
        const { client, row, id } = await started();
        fake.statuses.set(row.externalReference!, {
          status,
          amount: row.sentAmount!,
          currency: 'XAF',
        });
        await payments.verify(id);
        expect(
          (await prisma.payment.findUniqueOrThrow({ where: { id } })).status,
        ).toBe(status === 'failed' ? 'FAILED' : 'CANCELLED');
        expect(await creditsOf(client)).toBe(0);
        // Une confirmation tardive et contradictoire ne ressuscite pas un échec constaté.
        confirm(row.externalReference!);
        await payments.verify(id);
        expect(await creditsOf(client)).toBe(0);
      },
    );

    it('montant incorrect (même le prix affiché au lieu du montant envoyé) : aucun crédit', async () => {
      const { client, row, id } = await started();
      confirm(row.externalReference!, { amount: row.amount }); // 5 000 ≠ 4 730
      expect(await payments.verify(id)).toBe('FAILED');
      const p = await prisma.payment.findUniqueOrThrow({ where: { id } });
      expect(p.failureReason).toContain('vérification manuelle');
      expect(await creditsOf(client)).toBe(0);
    });

    it('devise incorrecte : aucun crédit', async () => {
      const { client, row, id } = await started();
      confirm(row.externalReference!, { currency: 'USD' });
      expect(await payments.verify(id)).toBe('FAILED');
      expect(await creditsOf(client)).toBe(0);
    });

    it('SasPay injoignable ou réponse illisible à la vérification : reste en attente, jamais échoué', async () => {
      const { client, row, id } = await started();
      fake.statuses.set(
        row.externalReference!,
        new ProviderUnavailableError('x'),
      );
      expect(await payments.verify(id)).toBe('PENDING');
      fake.statuses.set(
        row.externalReference!,
        new ProviderInvalidResponseError('x'),
      );
      expect(await payments.verify(id)).toBe('PENDING');
      expect(await creditsOf(client)).toBe(0);
      // Au retour du service, la confirmation aboutit, une seule fois.
      confirm(row.externalReference!);
      expect(await payments.verify(id)).toBe('SUCCESS');
      expect(await creditsOf(client)).toBe(1500);
    });

    it('reprise après une panne interne : un paiement confirmé mais pas crédité est traité sans doublon', async () => {
      const { client, row, id } = await started();
      confirm(row.externalReference!);
      // Panne de base au moment du crédit : toute la transaction est annulée.
      const credits = app.get(CreditsService);
      const spy = jest
        .spyOn(credits, 'grantPurchase')
        .mockRejectedValueOnce(new Error('connexion perdue'));
      await expect(payments.verify(id)).rejects.toThrow('connexion perdue');
      spy.mockRestore();
      const mid = await prisma.payment.findUniqueOrThrow({ where: { id } });
      expect(mid.status).toBe('PENDING');
      expect(mid.creditedAt).toBeNull();
      expect(await creditsOf(client)).toBe(0);

      expect(await payments.verify(id)).toBe('SUCCESS');
      expect(await payments.verify(id)).toBe('SUCCESS');
      expect(await creditsOf(client)).toBe(1500);
    });
  });

  describe('Rattrapage des paiements restés en attente', () => {
    it('revérifie les paiements ouverts : un paiement confirmé sans webhook est crédité', async () => {
      const { client, row } = await started();
      confirm(row.externalReference!);
      await payments.reconcile();
      expect(await creditsOf(client)).toBe(1500);
    });

    it('au bout d’une heure sans confirmation, le paiement est déclaré échoué (pas d’attente infinie)', async () => {
      const { client, id } = await started();
      const later = new Date(Date.now() + 61 * 60 * 1000);
      const r = await payments.reconcile(later);
      expect(r.expired).toBeGreaterThanOrEqual(1);
      const p = await prisma.payment.findUniqueOrThrow({ where: { id } });
      expect(p.status).toBe('FAILED');
      expect(p.failureReason).toBe(TIMEOUT_REASON);
      expect(await creditsOf(client)).toBe(0);
    });

    it('un succès tardif confirmé par SasPay après ce délai est tout de même crédité, une fois', async () => {
      const { client, row, id } = await started();
      await payments.reconcile(new Date(Date.now() + 61 * 60 * 1000));
      expect(
        (await prisma.payment.findUniqueOrThrow({ where: { id } })).status,
      ).toBe('FAILED');
      confirm(row.externalReference!);
      await payments.reconcile();
      await payments.reconcile();
      expect(
        (await prisma.payment.findUniqueOrThrow({ where: { id } })).status,
      ).toBe('SUCCESS');
      expect(await creditsOf(client)).toBe(1500);
    });
  });

  describe('Webhook signé', () => {
    const secret = TEST_ENV.SASPAY_WEBHOOK_SECRET;
    const sign = (timestamp: string, body: string, key = secret) =>
      createHmac('sha256', key).update(`${timestamp}.${body}`).digest('hex');
    const nowTs = () => String(Math.floor(Date.now() / 1000));

    const body = (event: string, id: string, extra: object = {}) =>
      JSON.stringify({
        event,
        data: {
          id,
          reference: 'TXN-1',
          status: 'SUCCESS',
          amount: '4730.00',
          currency: 'XAF',
          msisdn: '242061234567',
          ...extra,
        },
      });

    /** Envoie le corps EXACT, signé comme le fait SasPay (horodatage + corps brut). */
    function post(
      raw: string,
      opts: { ts?: string; signature?: string; headers?: boolean } = {},
    ) {
      const ts = opts.ts ?? nowTs();
      const req = request(app.getHttpServer())
        .post('/v1/webhooks/saspay')
        .set('Content-Type', 'application/json');
      if (opts.headers !== false) {
        req
          .set('X-Webhook-Timestamp', ts)
          .set('X-Webhook-Signature', opts.signature ?? sign(ts, raw));
      }
      return req.send(raw);
    }

    const events = (id: string) =>
      prisma.paymentWebhookEvent.findMany({ where: { providerTxId: id } });
    const statusOf = async (id: string) =>
      (await prisma.payment.findUniqueOrThrow({ where: { id } })).status;

    it('signature valide : vérifie auprès de SasPay, puis crédite une seule fois', async () => {
      const { client, row, id } = await started();
      const ref = row.externalReference!;
      confirm(ref);
      const res = await post(body('transaction.success', ref));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
      expect(await statusOf(id)).toBe('SUCCESS');
      expect(await creditsOf(client)).toBe(1500);
      const [evt] = await events(ref);
      expect(evt.paymentId).toBe(id);
      expect(evt.processedAt).not.toBeNull();
      // Aucune donnée personnelle conservée : pas de numéro de téléphone.
      expect(JSON.stringify(evt.payload)).not.toContain('242061234567');
    });

    it('le même webhook reçu plusieurs fois (même en parallèle) ne crédite qu’une fois', async () => {
      const { client, row, id } = await started();
      const ref = row.externalReference!;
      confirm(ref);
      const raw = body('transaction.success', ref);
      const results = await Promise.all(
        Array.from({ length: 5 }, () => post(raw)),
      );
      expect(results.every((r) => r.status === 200)).toBe(true);
      await post(raw);
      expect(await creditsOf(client)).toBe(1500);
      expect(
        await prisma.creditLedger.count({ where: { paymentId: id } }),
      ).toBe(2);
      expect(await events(ref)).toHaveLength(1);
    });

    it('contenu « succès » mais SasPay dit « en attente » : aucun crédit (le contenu n’est jamais cru)', async () => {
      const { client, row, id } = await started();
      const ref = row.externalReference!;
      fake.statuses.set(ref, {
        status: 'pending',
        amount: row.sentAmount!,
        currency: 'XAF',
      });
      const res = await post(
        body('transaction.success', ref, { amount: '999999.00' }),
      );
      expect(res.status).toBe(200);
      expect(await statusOf(id)).toBe('PENDING');
      expect(await creditsOf(client)).toBe(0);
    });

    it('signature incorrecte : 403, aucun effet, rien d’enregistré', async () => {
      const { client, row } = await started();
      const ref = row.externalReference!;
      confirm(ref); // même si le paiement est réellement confirmé chez SasPay
      const raw = body('transaction.success', ref);
      const bad = await post(raw, {
        signature: sign(nowTs(), raw, 'autre-secret-0123456789'),
      });
      expect(bad.status).toBe(403);
      expect(bad.body.code).toBe('WEBHOOK_SIGNATURE_INVALID');
      expect(await events(ref)).toHaveLength(0);
      expect(await creditsOf(client)).toBe(0);
    });

    it('corps modifié après signature, en-têtes absents ou horodatage hors tolérance : 403', async () => {
      const { row } = await started();
      const ref = row.externalReference!;
      const raw = body('transaction.success', ref);
      const ts = nowTs();
      const tampered = raw.replace('4730.00', '1.00');
      expect(
        (await post(tampered, { ts, signature: sign(ts, raw) })).status,
      ).toBe(403);
      expect((await post(raw, { headers: false })).status).toBe(403);
      for (const delta of [-600, 600]) {
        const t = String(Number(ts) + delta);
        expect(
          (await post(raw, { ts: t, signature: sign(t, raw) })).status,
        ).toBe(403);
      }
      expect(await events(ref)).toHaveLength(0);
    });

    it('transaction inconnue : 200 sans rien créditer, notification gardée sans rattachement', async () => {
      const res = await post(body('transaction.success', 'TX-INCONNUE-1'));
      expect(res.status).toBe(200);
      const [evt] = await events('TX-INCONNUE-1');
      expect(evt.paymentId).toBeNull();
      expect(evt.processedAt).toBeNull();
    });

    it('événement sans rapport avec un achat (webhook.test) : 200, rien d’enregistré', async () => {
      const res = await post(body('webhook.test', 'TX-TEST-1'));
      expect(res.status).toBe(200);
      expect(await events('TX-TEST-1')).toHaveLength(0);
    });

    it('signée mais illisible ou sans identifiant : 400', async () => {
      expect((await post('pas du json')).status).toBe(400);
      expect(
        (await post(JSON.stringify({ event: 'transaction.success', data: {} })))
          .status,
      ).toBe(400);
    });

    it('échec annoncé et confirmé : paiement échoué, aucun crédit', async () => {
      const { client, row, id } = await started();
      const ref = row.externalReference!;
      fake.statuses.set(ref, {
        status: 'failed',
        amount: row.sentAmount!,
        currency: 'XAF',
      });
      await post(body('transaction.failed', ref, { status: 'FAILED' }));
      expect(await statusOf(id)).toBe('FAILED');
      expect(await creditsOf(client)).toBe(0);
    });

    it('notifications tardives ou répétées après confirmation : aucun second crédit', async () => {
      const { client, row } = await started();
      const ref = row.externalReference!;
      confirm(ref);
      await post(body('transaction.success', ref));
      await post(body('transaction.created', ref, { status: 'PENDING' }));
      await post(body('transaction.success', ref));
      expect(await creditsOf(client)).toBe(1500);
    });

    it('notification « succès » pour un échec déjà constaté : aucun crédit', async () => {
      const { client, row } = await started();
      const ref = row.externalReference!;
      fake.statuses.set(ref, {
        status: 'failed',
        amount: row.sentAmount!,
        currency: 'XAF',
      });
      await post(body('transaction.failed', ref, { status: 'FAILED' }));
      await post(body('transaction.success', ref)); // contradictoire : SasPay dit toujours « échec »
      expect(await creditsOf(client)).toBe(0);
    });

    it('vérification impossible pendant le webhook : le paiement reste en attente puis aboutit au rattrapage', async () => {
      const { client, row, id } = await started();
      const ref = row.externalReference!;
      fake.statuses.set(ref, new ProviderUnavailableError('panne'));
      const res = await post(body('transaction.success', ref));
      expect(res.status).toBe(200);
      expect(await statusOf(id)).toBe('PENDING');
      confirm(ref);
      await payments.reconcile();
      expect(await creditsOf(client)).toBe(1500);
    });
  });

  describe('Isolation', () => {
    it('un utilisateur ne voit pas le paiement d’un autre', async () => {
      const { id } = await started();
      const other = (await verifiedClient(app)).client;
      expect((await other.get(`/v1/payments/${id}`)).status).toBe(404);
      expect((await other.get('/v1/payments')).body.payments).toEqual([]);
    });
  });
});
