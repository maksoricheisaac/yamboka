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
    it('liste les 6 packs avec crédits totaux, bonus et équivalents calculés côté serveur', async () => {
      const res = await new Client(app).get('/v1/catalog/packs').expect(200);
      const packs = res.body.packs as {
        name: string;
        priceFcfa: number;
        totalCredits: number;
        equivalent: { videoSeconds: number; images: number };
      }[];
      expect(packs.map((p) => [p.name, p.priceFcfa, p.totalCredits])).toEqual([
        ['Mini', 500, 20],
        ['Découverte', 1000, 40],
        ['Créateur', 2500, 103],
        ['Pro', 5000, 210],
        ['Business', 10000, 432],
        ['Agence', 25000, 1100],
      ]);
      // Équivalents du business plan : Découverte = 1 vidéo de 10 s ; Pro = 5 vidéos de 10 s ; Agence = 27.
      const byName = Object.fromEntries(
        packs.map((p) => [p.name, p.equivalent]),
      );
      expect(byName.Mini.videoSeconds).toBe(5);
      expect(byName.Découverte.videoSeconds).toBe(10);
      expect(byName.Pro.videoSeconds).toBe(52);
      expect(Math.floor(byName.Agence.videoSeconds / 10)).toBe(27);
      expect(byName.Créateur).toEqual({ videoSeconds: 25, images: 51 });
    });

    it('ne liste que les produits actifs', async () => {
      const res = await new Client(app).get('/v1/catalog/products').expect(200);
      expect(
        res.body.products.map((p: { code: string }) => p.code).sort(),
      ).toEqual(['IMAGE_SOUL2', 'VIDEO_LIGHT_480']);
    });

    it('n’expose aucun coût fournisseur', async () => {
      const res = await new Client(app).get('/v1/catalog/products').expect(200);
      const json = JSON.stringify(res.body);
      expect(json).not.toMatch(/providerCost|usd|providerModel/i);
    });
  });

  describe('Devis', () => {
    it('exige d’être connecté', async () => {
      const res = await new Client(app).post('/v1/catalog/quote', {
        productCode: 'IMAGE_SOUL2',
      });
      expect(res.status).toBe(401);
    });

    it('vidéo de 10 s : 40 crédits, 1 000 FCFA', async () => {
      const { client } = await verifiedClient(app);
      const res = await client
        .post('/v1/catalog/quote', {
          productCode: 'VIDEO_LIGHT_480',
          durationSeconds: 10,
        })
        .expect(200);
      expect(res.body).toEqual({
        productCode: 'VIDEO_LIGHT_480',
        credits: 40,
        billableSeconds: 10,
        creditValueFcfa: 25,
        valueFcfa: 1000,
      });
    });

    it('arrondit à la seconde supérieure', async () => {
      const { client } = await verifiedClient(app);
      const res = await client
        .post('/v1/catalog/quote', {
          productCode: 'VIDEO_LIGHT_480',
          durationSeconds: 9.2,
        })
        .expect(200);
      expect(res.body).toMatchObject({ billableSeconds: 10, credits: 40 });
    });

    it('image : 2 crédits, 50 FCFA, sans durée', async () => {
      const { client } = await verifiedClient(app);
      const res = await client
        .post('/v1/catalog/quote', { productCode: 'IMAGE_SOUL2' })
        .expect(200);
      expect(res.body).toMatchObject({
        credits: 2,
        valueFcfa: 50,
        billableSeconds: null,
      });
    });

    it.each([
      [
        'trop courte',
        { productCode: 'VIDEO_LIGHT_480', durationSeconds: 3 },
        'DURATION_TOO_SHORT',
      ],
      [
        'trop longue',
        { productCode: 'VIDEO_LIGHT_480', durationSeconds: 16 },
        'DURATION_TOO_LONG',
      ],
      ['sans durée', { productCode: 'VIDEO_LIGHT_480' }, 'DURATION_REQUIRED'],
      [
        'produit inactif',
        { productCode: 'VIDEO_LIGHT_720', durationSeconds: 10 },
        'PRODUCT_UNAVAILABLE',
      ],
      [
        'produit inconnu',
        { productCode: 'N_IMPORTE_QUOI', durationSeconds: 10 },
        'PRODUCT_UNAVAILABLE',
      ],
    ])('refuse une vidéo %s', async (_label, body, code) => {
      const { client } = await verifiedClient(app);
      const res = await client.post('/v1/catalog/quote', body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe(code);
    });

    it('ignore tout prix envoyé par le client', async () => {
      const { client } = await verifiedClient(app);
      const res = await client
        .post('/v1/catalog/quote', {
          productCode: 'VIDEO_LIGHT_480',
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
            await client.post('/v1/catalog/quote', {
              productCode: 'VIDEO_LIGHT_480',
              durationSeconds,
            })
          ).status,
        ).toBe(400);
      }
    });
  });
});
