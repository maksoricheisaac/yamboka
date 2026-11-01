import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { MOCK_UNAVAILABLE_PHONE } from '../src/payments/mock-payment.provider';
import {
  PaymentsService,
  TIMEOUT_REASON,
} from '../src/payments/payments.service';
import { Client, createApp, prismaOf } from './helpers';
import { ledgerOf, verifiedClient } from './finance-helpers';

const PHONE = '242061234567';

describe('Paiements simulés (e2e)', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof prismaOf>;
  let payments: PaymentsService;

  beforeAll(async () => {
    app = await createApp();
    prisma = prismaOf(app);
    payments = app.get(PaymentsService);
  });
  afterAll(async () => {
    await app.close();
  });

  const packId = async (name: string) =>
    (await prisma.creditPack.findFirstOrThrow({ where: { name } })).id;

  async function buy(
    client: Client,
    pack = 'Starter',
    overrides: Record<string, unknown> = {},
  ) {
    return client.post('/v1/payments', {
      packId: await packId(pack),
      operator: 'MTN',
      phone: PHONE,
      ...overrides,
    });
  }

  const simulate = (
    client: Client,
    id: string,
    outcome: string,
    callbacks = 1,
  ) => client.post(`/v1/payments/${id}/simulate`, { outcome, callbacks });

  const creditsOf = async (client: Client) =>
    (await client.get('/v1/auth/me')).body.user.credits as number;
  const ledgerOfPayment = (paymentId: string) =>
    prisma.creditLedger.findMany({
      where: { paymentId },
      orderBy: { type: 'asc' },
    });

  describe('Création', () => {
    it('exige d’être connecté et d’avoir un e-mail vérifié', async () => {
      expect((await buy(new Client(app))).status).toBe(401);

      const unverified = new Client(app);
      await unverified.register();
      const res = await buy(unverified);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
    });

    it('crée un paiement en attente : montant et crédits calculés côté serveur', async () => {
      const { client } = await verifiedClient(app);
      const res = await buy(client, 'Starter');
      expect(res.status).toBe(201);
      expect(res.body.payment).toMatchObject({
        status: 'PENDING',
        packName: 'Starter',
        amountFcfa: 5000,
        credits: 1250, // crédits du pack ; le bonus de premier achat n'est connu qu'à la confirmation
        bonusCredits: 0,
        operator: 'MTN',
        simulated: true,
      });
      expect(res.body.payment.reference).toMatch(/^MOCK-/);
      expect(await creditsOf(client)).toBe(0);
    });

    it('ignore tout montant ou nombre de crédits envoyé par le client', async () => {
      const { client } = await verifiedClient(app);
      const res = await buy(client, 'Starter', {
        amount: 1,
        credits: 999999,
        amountFcfa: 1,
      });
      expect(res.status).toBe(201);
      expect(res.body.payment).toMatchObject({
        amountFcfa: 5000,
        credits: 1250,
      });
    });

    it('enregistre le numéro dans le profil au premier achat (UF-21), sans l’écraser ensuite', async () => {
      const { client } = await verifiedClient(app);
      expect((await client.get('/v1/auth/me')).body.user.phone).toBeNull();
      await buy(client, 'Starter');
      // Enregistré au format E.164, même si le client envoie l'ancien format.
      expect((await client.get('/v1/auth/me')).body.user.phone).toBe(
        `+${PHONE}`,
      );
      await buy(client, 'Starter', { phone: '242069999000' });
      expect((await client.get('/v1/auth/me')).body.user.phone).toBe(
        `+${PHONE}`,
      );
    });

    it('refuse un numéro qui n’est pas congolais : MTN et Airtel Money ne fonctionnent qu’au Congo', async () => {
      const { client } = await verifiedClient(app);
      const res = await buy(client, 'Starter', { phone: '+33612345678' });
      expect(res.status).toBe(400);
      // Le format E.164 congolais est accepté tel quel.
      expect(
        (await buy(client, 'Starter', { phone: '+242061234567' })).status,
      ).toBeLessThan(300);
    });

    it.each([
      ['numéro invalide', { phone: '0612345678' }],
      ['opérateur inconnu', { operator: 'ORANGE' }],
      ['pack mal formé', { packId: 'pas-un-uuid' }],
    ])('rejette : %s', async (_label, override) => {
      const { client } = await verifiedClient(app);
      const res = await buy(client, 'Starter', override);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('refuse un pack inexistant ou désactivé', async () => {
      const { client } = await verifiedClient(app);
      const unknown = await client.post('/v1/payments', {
        packId: '00000000-0000-4000-8000-000000000000',
        operator: 'MTN',
        phone: PHONE,
      });
      expect(unknown.status).toBe(404);
      expect(unknown.body.code).toBe('PACK_NOT_FOUND');

      const pack = await prisma.creditPack.findFirstOrThrow({
        where: { name: 'Starter' },
      });
      await prisma.creditPack.update({
        where: { id: pack.id },
        data: { active: false },
      });
      try {
        expect((await buy(client, 'Starter')).status).toBe(404);
      } finally {
        await prisma.creditPack.update({
          where: { id: pack.id },
          data: { active: true },
        });
      }
    });

    it('un double envoi ne crée qu’un paiement (même en parallèle)', async () => {
      const { client, userId } = await verifiedClient(app);
      const results = await Promise.all([
        buy(client),
        buy(client),
        buy(client),
        buy(client),
      ]);
      const ids = new Set(
        results.map((r) => (r.body as { payment: { id: string } }).payment.id),
      );
      expect(ids.size).toBe(1);
      expect(await prisma.payment.count({ where: { userId } })).toBe(1);
    });

    it('deux packs différents donnent deux paiements distincts', async () => {
      const { client, userId } = await verifiedClient(app);
      await buy(client, 'Starter');
      await buy(client, 'Business');
      expect(await prisma.payment.count({ where: { userId } })).toBe(2);
    });

    it('fournisseur indisponible : erreur claire, paiement échoué, aucun crédit', async () => {
      const { client, userId } = await verifiedClient(app);
      const res = await buy(client, 'Starter', {
        phone: MOCK_UNAVAILABLE_PHONE,
      });
      expect(res.status).toBe(503);
      expect(res.body.code).toBe('PAYMENT_PROVIDER_UNAVAILABLE');
      expect(res.body.message).toContain('Aucun montant n’a été débité');
      const p = await prisma.payment.findFirstOrThrow({ where: { userId } });
      expect(p.status).toBe('FAILED');
      expect(await creditsOf(client)).toBe(0);
    });
  });

  describe('Succès', () => {
    it('crédite le pack après confirmation : crédits de base + bonus, notification, reçu', async () => {
      const { client, userId } = await verifiedClient(app);
      const { body } = await buy(client, 'Starter');
      const id = body.payment.id as string;

      const done = await simulate(client, id, 'success');
      expect(done.status).toBe(200);
      expect(done.body.payment.status).toBe('SUCCESS');
      expect(done.body.payment.creditedAt).not.toBeNull();

      expect(await creditsOf(client)).toBe(1250 + 250);
      const rows = await ledgerOfPayment(id);
      expect(rows.map((r) => `${r.type}:${r.amount}`).sort()).toEqual([
        'FIRST_PURCHASE_BONUS:250',
        'PURCHASE:1250',
      ]);
      // Les crédits achetés expirent dans 12 mois.
      const months =
        (rows[0].expiresAt!.getTime() - Date.now()) / (30 * 86_400_000);
      expect(months).toBeGreaterThan(11);
      expect(months).toBeLessThan(13);

      const notif = await prisma.notification.findFirstOrThrow({
        where: { userId, type: 'PAYMENT_SUCCESS' },
      });
      expect(notif.body).toContain('1500 crédits');

      const receipt = await client
        .get(`/v1/payments/${id}/receipt`)
        .expect(200);
      expect(receipt.body.receipt).toMatchObject({
        amountFcfa: 5000,
        credits: 1500,
      });
      expect(receipt.body.receipt.receiptNumber).toMatch(/^YAM-/);
    });

    it('un pack à 0 % de bonus ne crée aucun mouvement de bonus', async () => {
      const { client } = await verifiedClient(app);
      const pack = await prisma.creditPack.findFirstOrThrow({
        where: { name: 'Pro' },
      });
      await prisma.creditPack.update({
        where: { id: pack.id },
        data: { firstPurchaseBonusPercent: 0 },
      });
      try {
        const { body } = await buy(client, 'Pro');
        await simulate(client, body.payment.id, 'success');
        const rows = await ledgerOfPayment(body.payment.id);
        expect(rows.map((r) => r.type)).toEqual(['PURCHASE']);
        expect(await creditsOf(client)).toBe(2600);
      } finally {
        await prisma.creditPack.update({
          where: { id: pack.id },
          data: { firstPurchaseBonusPercent: null },
        });
      }
    });

    it('le pourcentage de bonus propre au pack remplace la valeur par défaut', async () => {
      const { client } = await verifiedClient(app);
      const pack = await prisma.creditPack.findFirstOrThrow({
        where: { name: 'Pro' },
      });
      await prisma.creditPack.update({
        where: { id: pack.id },
        data: { firstPurchaseBonusPercent: 50 },
      });
      try {
        const { body } = await buy(client, 'Pro');
        const done = await simulate(client, body.payment.id, 'success');
        expect(done.body.payment).toMatchObject({
          credits: 3900,
          bonusCredits: 1300,
        });
        expect(await creditsOf(client)).toBe(3900);
      } finally {
        await prisma.creditPack.update({
          where: { id: pack.id },
          data: { firstPurchaseBonusPercent: null },
        });
      }
    });

    it('bonus désactivé dans les réglages : aucun bonus', async () => {
      const { client } = await verifiedClient(app);
      await prisma.setting.upsert({
        where: { key: 'firstPurchaseBonusEnabled' },
        update: { value: false },
        create: { key: 'firstPurchaseBonusEnabled', value: false },
      });
      try {
        const { body } = await buy(client, 'Pro');
        await simulate(client, body.payment.id, 'success');
        expect(await creditsOf(client)).toBe(2600);
      } finally {
        await prisma.setting.update({
          where: { key: 'firstPurchaseBonusEnabled' },
          data: { value: true },
        });
      }
    });

    it('le bonus est accordé une seule fois : le second achat réussi n’en reçoit pas', async () => {
      const { client } = await verifiedClient(app);
      const first = (await buy(client, 'Pro')).body.payment.id;
      await simulate(client, first, 'success');
      expect(await creditsOf(client)).toBe(3120);
      const second = (await buy(client, 'Starter')).body.payment.id;
      await simulate(client, second, 'success');
      expect(await creditsOf(client)).toBe(3120 + 1250);
      const bonuses = await prisma.creditLedger.count({
        where: { type: 'FIRST_PURCHASE_BONUS', payment: { id: first } },
      });
      expect(bonuses).toBe(1);
      expect(await ledgerOfPayment(second)).toHaveLength(1);
    });

    it('un paiement échoué ne donne pas le bonus : il va au premier paiement réussi', async () => {
      const { client } = await verifiedClient(app);
      const failed = (await buy(client, 'Pro')).body.payment.id;
      await simulate(client, failed, 'failed');
      expect(await creditsOf(client)).toBe(0);
      const ok = (await buy(client, 'Starter')).body.payment.id;
      await simulate(client, ok, 'success');
      expect(await creditsOf(client)).toBe(1250 + 250);
    });

    it('deux premiers paiements confirmés en même temps : un seul bonus', async () => {
      const { client, userId } = await verifiedClient(app);
      const a = (await buy(client, 'Pro', { phone: '242061111111' })).body
        .payment.id;
      const b = (await buy(client, 'Starter', { phone: '242062222222' })).body
        .payment.id;
      await Promise.all([
        simulate(client, a, 'success'),
        simulate(client, b, 'success'),
      ]);
      const bonuses = await prisma.creditLedger.findMany({
        where: { userId, type: 'FIRST_PURCHASE_BONUS' },
      });
      expect(bonuses).toHaveLength(1);
      const total = await creditsOf(client);
      expect([2600 + 1250 + 520, 2600 + 1250 + 250]).toContain(total);
    });

    it('callbacks dupliqués simultanés : crédité une seule fois (recette)', async () => {
      const { client } = await verifiedClient(app);
      const { body } = await buy(client, 'Starter');
      await simulate(client, body.payment.id, 'success', 5);
      expect(await creditsOf(client)).toBe(1500);
      expect(await ledgerOfPayment(body.payment.id)).toHaveLength(2);
    });

    it('callbacks reçus directement sur l’endpoint public, en rafale, après le succès : toujours une seule fois', async () => {
      const { client } = await verifiedClient(app);
      const { body } = await buy(client, 'Starter');
      await simulate(client, body.payment.id, 'success');
      const reference = body.payment.reference as string;
      const posts = await Promise.all(
        Array.from({ length: 8 }, () =>
          request(app.getHttpServer())
            .post('/v1/webhooks/payment')
            .send({ reference }),
        ),
      );
      expect(
        posts.every((r) => r.status === 200 && r.body.received === true),
      ).toBe(true);
      expect(await creditsOf(client)).toBe(1500);
    });

    it('plusieurs vérifications simultanées : une seule crédite', async () => {
      const { client } = await verifiedClient(app);
      const { body } = await buy(client, 'Starter');
      await prisma.mockPaymentTransaction.update({
        where: { reference: body.payment.reference },
        data: { status: 'success' },
      });
      await Promise.all(
        Array.from({ length: 10 }, () => payments.verify(body.payment.id)),
      );
      expect(await creditsOf(client)).toBe(1500);
      expect(await ledgerOfPayment(body.payment.id)).toHaveLength(2);
    });
  });

  describe('Échec, annulation, falsification', () => {
    it('paiement échoué : aucun crédit, motif clair, notification', async () => {
      const { client, userId } = await verifiedClient(app);
      const { body } = await buy(client);
      const done = await simulate(client, body.payment.id, 'failed');
      expect(done.body.payment).toMatchObject({
        status: 'FAILED',
        failureReason: 'Le paiement a échoué',
      });
      expect(await creditsOf(client)).toBe(0);
      expect(await ledgerOfPayment(body.payment.id)).toHaveLength(0);
      expect(
        await prisma.notification.count({
          where: { userId, type: 'PAYMENT_FAILED' },
        }),
      ).toBe(1);
    });

    it('paiement annulé : aucun crédit', async () => {
      const { client } = await verifiedClient(app);
      const { body } = await buy(client);
      const done = await simulate(client, body.payment.id, 'cancelled');
      expect(done.body.payment.status).toBe('CANCELLED');
      expect(await creditsOf(client)).toBe(0);
    });

    it('un échec ne peut plus devenir un succès (issue définitive)', async () => {
      const { client } = await verifiedClient(app);
      const { body } = await buy(client);
      await simulate(client, body.payment.id, 'failed');
      const later = await simulate(client, body.payment.id, 'success');
      expect(later.body.payment.status).toBe('FAILED');
      expect(await creditsOf(client)).toBe(0);
    });

    it('callback falsifié : le fournisseur dit toujours « en attente », donc aucun crédit (recette)', async () => {
      const { client } = await verifiedClient(app);
      const { body } = await buy(client);
      const res = await simulate(client, body.payment.id, 'forged_callback', 3);
      expect(res.body.payment.status).toBe('PENDING');
      expect(await creditsOf(client)).toBe(0);
    });

    it('un callback qui affirme « succès » dans son contenu n’a aucun effet : seul le fournisseur fait foi', async () => {
      const { client } = await verifiedClient(app);
      const { body } = await buy(client);
      const res = await request(app.getHttpServer())
        .post('/v1/webhooks/payment')
        .send({
          reference: body.payment.reference,
          status: 'success',
          amount: 5000,
          currency: 'XAF',
        });
      expect(res.status).toBe(200);
      expect(
        (await client.get(`/v1/payments/${body.payment.id}`)).body.payment
          .status,
      ).toBe('PENDING');
      expect(await creditsOf(client)).toBe(0);
    });

    it('référence inconnue ou corps invalide : réponse neutre, rien ne se passe', async () => {
      const unknown = await request(app.getHttpServer())
        .post('/v1/webhooks/payment')
        .send({ reference: 'MOCK-inconnu' });
      expect(unknown.status).toBe(200);
      expect(unknown.body).toEqual({ received: true });
      expect(
        (
          await request(app.getHttpServer())
            .post('/v1/webhooks/payment')
            .send({})
        ).status,
      ).toBe(400);
    });

    it('montant incohérent chez le fournisseur : jamais crédité, vérification manuelle demandée', async () => {
      const { client } = await verifiedClient(app);
      const { body } = await buy(client, 'Starter');
      await prisma.mockPaymentTransaction.update({
        where: { reference: body.payment.reference },
        data: { amount: 100 },
      });
      const res = await simulate(client, body.payment.id, 'success');
      expect(res.body.payment.status).toBe('FAILED');
      expect(res.body.payment.failureReason).toContain('Montant incohérent');
      expect(await creditsOf(client)).toBe(0);
    });
  });

  describe('Fournisseur défaillant', () => {
    it.each(['provider_error', 'invalid_response'])(
      '%s : aucune conclusion tirée, le paiement reste en attente, puis aboutit au retour du service',
      async (failure) => {
        const { client } = await verifiedClient(app);
        const { body } = await buy(client);
        const down = await simulate(client, body.payment.id, failure, 2);
        expect(down.body.payment.status).toBe('PENDING');
        expect(await creditsOf(client)).toBe(0);

        const back = await simulate(client, body.payment.id, 'success');
        expect(back.body.payment.status).toBe('SUCCESS');
        expect(await creditsOf(client)).toBe(1500);
      },
    );
  });

  describe('Rattrapage (callback perdu)', () => {
    it('revérifie les paiements ouverts et crédite ceux que le fournisseur confirme, une seule fois', async () => {
      const { client } = await verifiedClient(app);
      const { body } = await buy(client, 'Starter');
      // Le client a payé mais aucun callback n'est jamais arrivé.
      await prisma.mockPaymentTransaction.update({
        where: { reference: body.payment.reference },
        data: { status: 'success' },
      });
      expect(await creditsOf(client)).toBe(0);

      await payments.reconcile();
      expect(await creditsOf(client)).toBe(1500);
      await payments.reconcile();
      await payments.reconcile();
      expect(await creditsOf(client)).toBe(1500);
    });

    it('déclare échoué un paiement jamais confirmé au bout de 24 h', async () => {
      const { client } = await verifiedClient(app);
      const { body } = await buy(client);
      await prisma.payment.update({
        where: { id: body.payment.id },
        data: { createdAt: new Date(Date.now() - 25 * 3600 * 1000) },
      });
      await payments.reconcile();
      const p = (await client.get(`/v1/payments/${body.payment.id}`)).body
        .payment;
      expect(p).toMatchObject({
        status: 'FAILED',
        failureReason: TIMEOUT_REASON,
      });
    });

    it('un succès tardif confirmé par le fournisseur après le délai est tout de même crédité, une fois', async () => {
      const { client } = await verifiedClient(app);
      const { body } = await buy(client, 'Starter');
      await prisma.payment.update({
        where: { id: body.payment.id },
        data: { createdAt: new Date(Date.now() - 25 * 3600 * 1000) },
      });
      await payments.reconcile();
      expect(
        (await client.get(`/v1/payments/${body.payment.id}`)).body.payment
          .status,
      ).toBe('FAILED');

      await prisma.mockPaymentTransaction.update({
        where: { reference: body.payment.reference },
        data: { status: 'success' },
      });
      await Promise.all([
        payments.verify(body.payment.id),
        payments.verify(body.payment.id),
      ]);
      expect(
        (await client.get(`/v1/payments/${body.payment.id}`)).body.payment
          .status,
      ).toBe('SUCCESS');
      expect(await creditsOf(client)).toBe(1500);
    });

    it('un paiement qui n’a jamais joint le fournisseur est abandonné après 10 minutes', async () => {
      const { userId } = await verifiedClient(app);
      const packRow = await prisma.creditPack.findFirstOrThrow({
        where: { name: 'Starter' },
      });
      const orphan = await prisma.payment.create({
        data: {
          userId,
          packId: packRow.id,
          country: 'CG',
          currency: 'XAF',
          amount: 5000,
          credits: 1250,
          gateway: 'mock',
          operator: 'MTN',
          payerPhone: PHONE,
          status: 'INITIATED',
          createdAt: new Date(Date.now() - 15 * 60 * 1000),
        },
      });
      await payments.reconcile();
      expect(
        (await prisma.payment.findUniqueOrThrow({ where: { id: orphan.id } }))
          .status,
      ).toBe('FAILED');
    });
  });

  describe('Isolation et lecture', () => {
    it('un utilisateur ne voit, ne simule ni ne reçoit le reçu d’un paiement qui n’est pas le sien', async () => {
      const owner = await verifiedClient(app);
      const intruder = await verifiedClient(app);
      const { body } = await buy(owner.client);
      await simulate(owner.client, body.payment.id, 'success');
      const id = body.payment.id as string;

      expect((await intruder.client.get(`/v1/payments/${id}`)).status).toBe(
        404,
      );
      expect(
        (await intruder.client.get(`/v1/payments/${id}/receipt`)).status,
      ).toBe(404);
      expect((await simulate(intruder.client, id, 'failed')).status).toBe(404);
      expect(
        (await intruder.client.get('/v1/payments')).body.payments,
      ).toHaveLength(0);
    });

    it('le reçu n’existe que pour un achat réussi', async () => {
      const { client } = await verifiedClient(app);
      const { body } = await buy(client);
      const res = await client.get(`/v1/payments/${body.payment.id}/receipt`);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('RECEIPT_UNAVAILABLE');
    });

    it('l’historique liste les achats du plus récent au plus ancien', async () => {
      const { client } = await verifiedClient(app);
      await buy(client, 'Starter');
      await new Promise((r) => setTimeout(r, 20));
      await buy(client, 'Business');
      const list = (await client.get('/v1/payments').expect(200)).body.payments;
      expect(list.map((p: { packName: string }) => p.packName)).toEqual([
        'Business',
        'Starter',
      ]);
    });

    it('les routes de paiement refusent une origine étrangère (CSRF)', async () => {
      const { client } = await verifiedClient(app);
      const res = await client.post(
        '/v1/payments',
        { packId: await packId('Starter'), operator: 'MTN', phone: PHONE },
        'https://evil.example',
      );
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('CSRF_REJECTED');
    });

    it('un identifiant de paiement mal formé est rejeté', async () => {
      const { client } = await verifiedClient(app);
      expect((await client.get('/v1/payments/pas-un-uuid')).status).toBe(400);
    });
  });

  describe('Solde et registre côté utilisateur', () => {
    it('le solde et l’historique reflètent les mouvements, avec la valeur en FCFA', async () => {
      const { client, userId } = await verifiedClient(app);
      const { body } = await buy(client, 'Starter');
      await simulate(client, body.payment.id, 'success');

      const balance = (await client.get('/v1/credits/balance').expect(200))
        .body;
      expect(balance).toEqual({
        credits: 1500,
        creditValueFcfa: 4,
        valueFcfa: 1500 * 4,
      });

      const ledger = (await client.get('/v1/credits/ledger').expect(200)).body;
      expect(
        ledger.items
          .map((i: { type: string; amount: number }) => [i.type, i.amount])
          .sort(),
      ).toEqual([
        ['FIRST_PURCHASE_BONUS', 250],
        ['PURCHASE', 1250],
      ]);
      expect(ledger.nextCursor).toBeNull();
      expect((await ledgerOf(app, userId)).length).toBe(2);
    });

    it('l’historique est paginé et refuse un curseur ou une taille invalides', async () => {
      const { client } = await verifiedClient(app);
      const { body } = await buy(client, 'Starter');
      await simulate(client, body.payment.id, 'success'); // achat + bonus : deux mouvements
      const page = (await client.get('/v1/credits/ledger?limit=1').expect(200))
        .body;
      expect(page.items).toHaveLength(1);
      expect(page.nextCursor).not.toBeNull();
      expect((await client.get('/v1/credits/ledger?limit=0')).status).toBe(400);
      expect(
        (await client.get('/v1/credits/ledger?cursor=nimporte')).status,
      ).toBe(400);
    });

    it('exige d’être connecté', async () => {
      expect((await new Client(app).get('/v1/credits/balance')).status).toBe(
        401,
      );
      expect((await new Client(app).get('/v1/credits/ledger')).status).toBe(
        401,
      );
    });
  });
});
