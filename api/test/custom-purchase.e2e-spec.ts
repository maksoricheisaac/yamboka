import './isolate-purchase-db';
import { INestApplication } from '@nestjs/common';
import type { PricingView } from '@yamboka/shared';
import { Client, createApp, prismaOf } from './helpers';
import { resetDatabase } from './reset-database';
import { ledgerOf, verifiedClient } from './finance-helpers';
import { openCountries } from './catalog-helpers';

const PHONE_CG = '+242061234567';
const PHONE_CM = '+237670123456';
const PHONE_BJ = '+2290197123456';

describe('Achat de crédits sur mesure et paiements multi-pays (e2e)', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof prismaOf>;

  beforeAll(async () => {
    await resetDatabase(process.env.DATABASE_URL!);
    app = await createApp();
    prisma = prismaOf(app);
  }, 120_000);
  afterAll(async () => {
    await app.close();
  });

  const setSetting = (key: string, value: string | number) =>
    prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });

  const pricing = async (): Promise<PricingView> =>
    (await new Client(app).get('/api/catalog/pricing').expect(200))
      .body as PricingView;

  const simulate = (client: Client, id: string, outcome: string) =>
    client.post(`/api/payments/${id}/simulate`, { outcome, callbacks: 1 });

  describe('Tarification publique (source unique)', () => {
    it('est lisible sans connexion et décrit pays, moyens de paiement, packs et prix du crédit', async () => {
      const body = await pricing();
      const cg = body.countries.find((c: { iso: string }) => c.iso === 'CG');
      expect(cg!).toMatchObject({
        currency: 'XAF',
        dialCode: '+242',
        custom: { unitPrice: 10 },
      });
      expect(cg!.methods.map((m: { code: string }) => m.code)).toEqual([
        'mtn_cg',
        'airtel_cg',
      ]);
      expect(cg!.packs.length).toBeGreaterThanOrEqual(3);
    });

    it('les prix des packs sont ceux du catalogue, et les tarifs vidéo ceux du studio de création', async () => {
      const body = await pricing();
      const cg = body.countries.find((c: { iso: string }) => c.iso === 'CG');
      const { packs } = (
        await new Client(app).get('/api/catalog/packs').expect(200)
      ).body;
      expect(
        cg!.packs.map((p: { name: string; priceFcfa: number }) => [
          p.name,
          p.priceFcfa,
        ]),
      ).toEqual(
        packs.map((p: { name: string; priceFcfa: number }) => [
          p.name,
          p.priceFcfa,
        ]),
      );
      const { client } = await verifiedClient(app);
      const config = (await client.get('/api/creations/config').expect(200))
        .body;
      expect(body.rates).toEqual(config.rates);
    });

    it('une modification faite dans l’administration est répercutée immédiatement', async () => {
      const before = (await pricing()).countries[0].custom!.unitPrice;
      await setSetting('creditValueFcfa', 12);
      try {
        const body = await pricing();
        expect(body.countries[0].custom!.unitPrice).toBe(12);
        const { client } = await verifiedClient(app);
        const quote = await client
          .post('/api/payments/quote', { credits: 100, network: 'mtn_cg' })
          .expect(200);
        expect(quote.body).toMatchObject({ amount: 1200, credits: 100 });
      } finally {
        await setSetting('creditValueFcfa', before);
      }
    });

    it('ne propose ni réseau inactif ni réseau exigeant un code non géré', async () => {
      await openCountries(prisma, ['CG', 'CM', 'CI', 'SN']);
      try {
        const body = await pricing();
        const codes = body.countries.flatMap(
          (c: { methods: { code: string }[] }) => c.methods.map((m) => m.code),
        );
        expect(codes).toEqual(
          expect.arrayContaining(['mtn_cm', 'orange_cm', 'wave_ci', 'wave_sn']),
        );
        expect(codes).not.toContain('eu_mobile_cm'); // inactif chez SasPay
        expect(codes).not.toContain('orange_ci'); // code à générer avant paiement
        expect(codes).not.toContain('wizall_sn'); // code reçu après le push
      } finally {
        await openCountries(prisma, ['CG', 'CM']);
      }
    });
  });

  describe('Achat sur mesure', () => {
    it('le devis est recalculé par le serveur, sans bonus', async () => {
      const { client } = await verifiedClient(app);
      const res = await client
        .post('/api/payments/quote', { credits: 125 })
        .expect(200);
      expect(res.body).toEqual({
        country: 'CG',
        currency: 'XAF',
        amount: 1250,
        credits: 125,
        firstPurchaseBonusPercent: 0,
        custom: true,
        packName: 'Crédits sur mesure',
      });
    });

    it('crée un paiement au montant recalculé : un montant envoyé par le navigateur est ignoré', async () => {
      const { client } = await verifiedClient(app);
      const res = await client
        .post('/api/payments', {
          credits: 200,
          amount: 1,
          amountFcfa: 1,
          network: 'mtn_cg',
          phone: PHONE_CG,
        })
        .expect(201);
      expect(res.body.payment).toMatchObject({
        custom: true,
        packName: 'Crédits sur mesure',
        amountFcfa: 2000,
        credits: 200,
        bonusCredits: 0,
        country: 'CG',
        network: 'mtn_cg',
        methodLabel: 'MTN MoMo',
        operator: 'MTN',
      });
    });

    it('crédite exactement la quantité achetée, une seule fois, sans bonus de premier achat', async () => {
      const { client, userId } = await verifiedClient(app);
      const { body } = await client
        .post('/api/payments', {
          credits: 150,
          network: 'airtel_cg',
          phone: PHONE_CG,
        })
        .expect(201);
      await simulate(client, body.payment.id, 'success').expect(200);
      await simulate(client, body.payment.id, 'success').expect(200);

      const me = (await client.get('/api/auth/me')).body.user;
      expect(me.credits).toBe(150);
      const ledger = await ledgerOf(app, userId);
      expect(ledger.map((l) => [l.type, l.amount])).toEqual([
        ['PURCHASE', 150],
      ]);
      const receipt = (
        await client.get(`/api/payments/${body.payment.id}/receipt`).expect(200)
      ).body.receipt;
      expect(receipt).toMatchObject({ custom: true, amountFcfa: 1500 });
    });

    it('un pack garde son bonus de premier achat', async () => {
      const { client, userId } = await verifiedClient(app);
      const pack = await prisma.creditPack.findFirstOrThrow({
        where: { name: 'Starter', country: 'CG' },
      });
      const { body } = await client
        .post('/api/payments', {
          packId: pack.id,
          network: 'mtn_cg',
          phone: PHONE_CG,
        })
        .expect(201);
      await simulate(client, body.payment.id, 'success').expect(200);
      const types = (await ledgerOf(app, userId)).map((l) => l.type).sort();
      expect(types).toEqual(['FIRST_PURCHASE_BONUS', 'PURCHASE']);
    });

    it.each([
      ['en dessous du minimum', 5],
      ['au-dessus du maximum', 999_999],
    ])('refuse une quantité %s sans créer de paiement', async (_l, credits) => {
      const { client, userId } = await verifiedClient(app);
      const res = await client
        .post('/api/payments', { credits, network: 'mtn_cg', phone: PHONE_CG })
        .expect(422);
      expect(res.body.code).toBe('CUSTOM_CREDITS_OUT_OF_RANGE');
      expect(await prisma.payment.count({ where: { userId } })).toBe(0);
    });

    it('refuse de vendre à perte (prix du crédit inférieur au coût fournisseur)', async () => {
      const before = (await pricing()).countries[0].custom!.unitPrice;
      await setSetting('creditValueFcfa', 2); // coût fournisseur : 2,5 FCFA le crédit
      try {
        const { client, userId } = await verifiedClient(app);
        const res = await client
          .post('/api/payments', {
            credits: 1000,
            network: 'mtn_cg',
            phone: PHONE_CG,
          })
          .expect(422);
        expect(res.body.code).toBe('AMOUNT_TOO_LOW');
        expect(await prisma.payment.count({ where: { userId } })).toBe(0);
      } finally {
        await setSetting('creditValueFcfa', before);
      }
    });

    it('exige un pack ou une quantité, et un moyen de paiement', async () => {
      const { client } = await verifiedClient(app);
      await client
        .post('/api/payments', { network: 'mtn_cg', phone: PHONE_CG })
        .expect(400);
      await client
        .post('/api/payments', { credits: 200, phone: PHONE_CG })
        .expect(400);
    });
  });

  describe('Plusieurs pays', () => {
    it('Congo-Brazzaville : l’ancien contrat (operator MTN, sans pays) fonctionne toujours', async () => {
      const { client } = await verifiedClient(app);
      const pack = await prisma.creditPack.findFirstOrThrow({
        where: { name: 'Starter', country: 'CG' },
      });
      const res = await client
        .post('/api/payments', {
          packId: pack.id,
          operator: 'MTN',
          phone: PHONE_CG,
        })
        .expect(201);
      expect(res.body.payment).toMatchObject({
        country: 'CG',
        network: 'mtn_cg',
        currency: 'XAF',
      });
    });

    it('Cameroun : Orange Money avec un numéro camerounais', async () => {
      const { client } = await verifiedClient(app);
      const res = await client
        .post('/api/payments', {
          credits: 300,
          country: 'CM',
          network: 'orange_cm',
          phone: PHONE_CM,
        })
        .expect(201);
      expect(res.body.payment).toMatchObject({
        country: 'CM',
        currency: 'XAF',
        network: 'orange_cm',
        operator: 'OTHER',
        methodLabel: 'Orange Money',
        amountFcfa: 3000,
        payerPhone: PHONE_CM,
      });
    });

    it('les moyens de paiement proposés correspondent au pays : un réseau d’un autre pays est refusé', async () => {
      const { client } = await verifiedClient(app);
      const res = await client
        .post('/api/payments', {
          credits: 300,
          country: 'CM',
          network: 'airtel_cg',
          phone: PHONE_CM,
        })
        .expect(422);
      expect(res.body.code).toBe('PAYMENT_METHOD_UNAVAILABLE');
    });

    it('un numéro d’un autre pays que le moyen de paiement est refusé', async () => {
      const { client } = await verifiedClient(app);
      const res = await client
        .post('/api/payments', {
          credits: 300,
          country: 'CM',
          network: 'mtn_cm',
          phone: PHONE_CG,
        })
        .expect(400);
      expect(res.body.code).toBe('PHONE_COUNTRY_MISMATCH');
    });

    it('un pays non ouvert à la vente est refusé', async () => {
      const { client } = await verifiedClient(app);
      const res = await client
        .post('/api/payments', {
          credits: 300,
          country: 'BJ',
          network: 'mtn_bj',
          phone: PHONE_BJ,
        })
        .expect(422);
      expect(res.body.code).toBe('COUNTRY_NOT_SUPPORTED');
    });

    it('Bénin (XOF, à parité avec le XAF) une fois ouvert : même prix, devise XOF', async () => {
      await openCountries(prisma, ['CG', 'BJ']);
      try {
        const { client } = await verifiedClient(app);
        const body = await pricing();
        const bj = body.countries.find((c: { iso: string }) => c.iso === 'BJ');
        expect(bj!).toMatchObject({ currency: 'XOF', dialCode: '+229' });
        expect(bj!.packs[0].currency).toBe('XOF');
        const res = await client
          .post('/api/payments', {
            credits: 200,
            country: 'BJ',
            network: 'moov_bj',
            phone: PHONE_BJ,
          })
          .expect(201);
        expect(res.body.payment).toMatchObject({
          country: 'BJ',
          currency: 'XOF',
          amountFcfa: 2000,
        });
      } finally {
        await openCountries(prisma, ['CG', 'CM']);
      }
    });

    it('une devise sans prix du crédit ni pack n’est jamais proposée (aucun taux de change inventé)', async () => {
      await openCountries(prisma, ['CG', 'KE']);
      try {
        const body = await pricing();
        expect(body.countries.map((c: { iso: string }) => c.iso)).toEqual([
          'CG',
        ]);
      } finally {
        await openCountries(prisma, ['CG', 'CM']);
      }
    });
  });

  describe('Historique filtrable et synthèse', () => {
    it('filtre les opérations par famille et relie un achat à son reçu', async () => {
      const { client } = await verifiedClient(app);
      const pack = await prisma.creditPack.findFirstOrThrow({
        where: { name: 'Starter', country: 'CG' },
      });
      const { body } = await client
        .post('/api/payments', {
          packId: pack.id,
          network: 'mtn_cg',
          phone: PHONE_CG,
        })
        .expect(201);
      await simulate(client, body.payment.id, 'success').expect(200);

      const filter = async (f: string) =>
        (await client.get(`/api/credits/ledger?filter=${f}`).expect(200)).body
          .items as { type: string; paymentId: string | null }[];

      const purchases = await filter('purchases');
      expect(purchases.map((i) => i.type)).toEqual(['PURCHASE']);
      expect(purchases[0].paymentId).toBe(body.payment.id);
      expect((await filter('bonuses')).map((i) => i.type)).toEqual([
        'FIRST_PURCHASE_BONUS',
      ]);
      expect(await filter('generations')).toEqual([]);
      expect(await filter('refunds')).toEqual([]);
      expect((await filter('all')).length).toBe(2);
      await client.get('/api/credits/ledger?filter=nimporte').expect(400);
    });

    it('la synthèse d’activité compte les achats des 30 derniers jours', async () => {
      const { client } = await verifiedClient(app);
      const { body } = await client
        .post('/api/payments', {
          credits: 150,
          network: 'mtn_cg',
          phone: PHONE_CG,
        })
        .expect(201);
      await simulate(client, body.payment.id, 'success').expect(200);
      const summary = (await client.get('/api/credits/summary').expect(200))
        .body;
      expect(summary).toEqual({
        generationsTotal: 0,
        generations30d: 0,
        creditsSpent30d: 0,
        creditsPurchased30d: 150,
      });
    });

    it('exige d’être connecté', async () => {
      await new Client(app).get('/api/credits/summary').expect(401);
      await new Client(app)
        .post('/api/payments/quote', { credits: 200 })
        .expect(401);
    });
  });
});
