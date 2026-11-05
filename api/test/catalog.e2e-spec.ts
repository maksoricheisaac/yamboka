import { INestApplication } from '@nestjs/common';
import { Client, createApp } from './helpers';
import { verifiedClient } from './finance-helpers';

describe('Catalogue et devis (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp();
  });
  afterAll(async () => {
    await app.close();
  });

  describe('Packs et produits (publics)', () => {
    it('liste les 3 packs de lancement avec crédits et équivalents calculés côté serveur', async () => {
      const res = await new Client(app).get('/api/catalog/packs').expect(200);
      const packs = res.body.packs as {
        name: string;
        priceFcfa: number;
        totalCredits: number;
        equivalent: Record<string, { seconds: number; videos: number }>;
      }[];
      expect(packs.map((p) => [p.name, p.priceFcfa, p.totalCredits])).toEqual([
        ['Starter', 5000, 500],
        ['Pro', 10000, 1000],
        ['Business', 25000, 2500],
      ]);
      // Équivalences calculées depuis les tarifs en base (4 / 8 / 16 crédits par seconde), vidéos de 5 s.
      const byName = Object.fromEntries(
        packs.map((p) => [p.name, p.equivalent]),
      );
      expect(byName.Starter).toEqual({
        '480p': { seconds: 125, videos: 25 },
        '720p': { seconds: 62, videos: 12 },
        '1080p': { seconds: 31, videos: 6 },
      });
      expect(byName.Pro['480p']).toEqual({ seconds: 250, videos: 50 });
      expect(byName.Business['1080p']).toEqual({ seconds: 156, videos: 31 });
    });

    it('ne liste que les produits actifs', async () => {
      const res = await new Client(app)
        .get('/api/catalog/products')
        .expect(200);
      expect(
        res.body.products.map((p: { code: string }) => p.code).sort(),
      ).toEqual(['WAN_I2V_1080', 'WAN_I2V_480', 'WAN_I2V_720']);
    });

    it('n’expose aucun coût fournisseur', async () => {
      const res = await new Client(app)
        .get('/api/catalog/products')
        .expect(200);
      const json = JSON.stringify(res.body);
      expect(json).not.toMatch(/providerCost|usd|providerModel/i);
    });
  });

  describe('Devis', () => {
    it('exige d’être connecté', async () => {
      const res = await new Client(app).post('/api/catalog/quote', {
        productCode: 'WAN_I2V_480',
        durationSeconds: 10,
      });
      expect(res.status).toBe(401);
    });

    it.each([
      ['WAN_I2V_480', 5, 20],
      ['WAN_I2V_720', 5, 40],
      ['WAN_I2V_1080', 11, 176],
      ['WAN_I2V_480', 2, 8],
      ['WAN_I2V_1080', 30, 480],
    ])('%s, %i s : %i crédits (1 crédit = 10 FCFA)', async (productCode, durationSeconds, credits) => {
      const { client } = await verifiedClient(app);
      const res = await client
        .post('/api/catalog/quote', { productCode, durationSeconds })
        .expect(200);
      expect(res.body).toEqual({
        productCode,
        credits,
        billableSeconds: durationSeconds,
        creditValueFcfa: 10,
        valueFcfa: credits * 10,
      });
    });

    it('produit d’image abandonné : refusé, même s’il existe encore en base', async () => {
      const { client } = await verifiedClient(app);
      const res = await client
        .post('/api/catalog/quote', { productCode: 'IMAGE_EDIT_GROK' })
        .expect(400);
      expect(res.body.code).toBe('PRODUCT_UNAVAILABLE');
    });

    it.each([
      [
        'trop courte',
        { productCode: 'WAN_I2V_480', durationSeconds: 1 },
        'DURATION_TOO_SHORT',
      ],
      [
        'trop longue',
        { productCode: 'WAN_I2V_480', durationSeconds: 31 },
        'DURATION_TOO_LONG',
      ],
      ['sans durée', { productCode: 'WAN_I2V_480' }, 'DURATION_REQUIRED'],
      [
        'produit inconnu',
        { productCode: 'N_IMPORTE_QUOI', durationSeconds: 10 },
        'PRODUCT_UNAVAILABLE',
      ],
    ])('refuse une vidéo %s', async (_label, body, code) => {
      const { client } = await verifiedClient(app);
      const res = await client.post('/api/catalog/quote', body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe(code);
    });

    it('ignore tout prix envoyé par le client', async () => {
      const { client } = await verifiedClient(app);
      const res = await client
        .post('/api/catalog/quote', {
          productCode: 'WAN_I2V_480',
          durationSeconds: 10,
          credits: 1,
          creditsPerUnit: 0,
          price: 1,
        })
        .expect(200);
      expect(res.body.credits).toBe(40);
    });

    it('rejette une durée négative, nulle ou non numérique', async () => {
      const { client } = await verifiedClient(app);
      for (const durationSeconds of [-5, 0, 'dix']) {
        expect(
          (
            await client.post('/api/catalog/quote', {
              productCode: 'WAN_I2V_480',
              durationSeconds,
            })
          ).status,
        ).toBe(400);
      }
    });
  });
});
