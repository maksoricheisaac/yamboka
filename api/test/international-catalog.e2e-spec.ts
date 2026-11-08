import './isolate-catalog-db';
import { INestApplication } from '@nestjs/common';
import type { PricingView } from '@yamboka/shared';
import { COUNTRIES, METHODS } from '../src/payments/catalog/catalog-data';
import { seedCountryCatalog } from '../src/payments/catalog/catalog-seed';
import { openCountries, setCountry, setMethod } from './catalog-helpers';
import { verifiedClient } from './finance-helpers';
import { Client, createApp, prismaOf } from './helpers';
import { resetDatabase } from './reset-database';
import { TEST_ENV } from './test-env';

const PHONE_CG = '+242061234567';
const PHONE_RW = '+250788123456';
const REASON = 'Ouverture commerciale progressive';

describe('Catalogue international des pays et moyens de paiement (e2e)', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof prismaOf>;
  let admin: Client;

  beforeAll(async () => {
    await resetDatabase(process.env.DATABASE_URL!);
    app = await createApp();
    prisma = prismaOf(app);
    admin = new Client(app);
    await admin
      .post('/api/auth/login', {
        email: TEST_ENV.ADMIN_EMAIL,
        password: TEST_ENV.ADMIN_PASSWORD,
      })
      .expect(200);
  }, 120_000);
  afterAll(async () => {
    await app.close();
  });

  const pricing = async () =>
    (await new Client(app).get('/api/catalog/pricing').expect(200))
      .body as PricingView;
  const setStatus = (iso: string, status: string) =>
    admin.post(`/api/admin/countries/${iso}/status`, {
      status,
      reason: REASON,
    });
  const setMethodStatus = (iso: string, code: string, status: string) =>
    admin.post(`/api/admin/countries/${iso}/methods/${code}/status`, {
      status,
      reason: REASON,
    });

  describe('Catalogue et seed', () => {
    it('contient les 21 pays de la mission et la zone International, avec leurs moyens', async () => {
      const countries = await prisma.country.findMany({
        include: { methods: true },
      });
      expect(countries).toHaveLength(22);
      expect(COUNTRIES.filter((c) => c.iso !== 'XX')).toHaveLength(21);
      const rw = countries.find((c) => c.iso === 'RW')!;
      expect(rw).toMatchObject({ currency: 'RWF', dialCode: '250' });
      expect(rw.methods.map((m) => m.methodCode).sort()).toEqual([
        'AIRTEL_MONEY',
        'CARD',
        'MTN_MOMO',
      ]);
      const intl = countries.find((c) => c.iso === 'XX')!;
      expect(intl.methods.map((m) => m.methodCode).sort()).toEqual([
        'MASTERCARD',
        'SWIFT',
        'VISA',
      ]);
      expect(await prisma.paymentMethod.count()).toBe(METHODS.length);
    });

    it('par défaut seuls le Congo-Brazzaville et le Cameroun sont ouverts (aucune régression)', async () => {
      const open = await prisma.country.findMany({
        where: { status: 'ACTIVE' },
        select: { iso: true },
      });
      expect(open.map((c) => c.iso).sort()).toEqual(['CG', 'CM']);
    });

    it('est idempotent : un second passage ne crée rien et ne réinitialise aucune activation', async () => {
      await prisma.country.update({
        where: { iso: 'RW' },
        data: { status: 'COMING_SOON' },
      });
      const before = {
        countries: await prisma.country.count(),
        assocs: await prisma.countryPaymentMethod.count(),
      };
      const result = await seedCountryCatalog(prisma);
      expect(result.created).toEqual({ countries: 0, associations: 0 });
      expect(await prisma.country.count()).toBe(before.countries);
      expect(await prisma.countryPaymentMethod.count()).toBe(before.assocs);
      expect(
        (await prisma.country.findUniqueOrThrow({ where: { iso: 'RW' } }))
          .status,
      ).toBe('COMING_SOON');
      await prisma.country.update({
        where: { iso: 'RW' },
        data: { status: 'DISABLED' },
      });
    });

    it('les frais indicatifs sont enregistrés', async () => {
      const ke = await prisma.country.findUniqueOrThrow({
        where: { iso: 'KE' },
      });
      expect(Number(ke.indicativeFeePercent)).toBe(1);
      const ml = await prisma.country.findUniqueOrThrow({
        where: { iso: 'ML' },
      });
      expect(ml.indicativeFeePercent).toBeNull();
      expect(ml.indicativeFeeNote).toBe('Non indiqué');
      const card = await prisma.countryPaymentMethod.findFirstOrThrow({
        where: { countryIso: 'KE', methodCode: 'CARD' },
      });
      expect(Number(card.indicativeFeePercent)).toBe(5);
    });
  });

  describe('Accès', () => {
    it('refuse un client et un visiteur sur toutes les routes du catalogue', async () => {
      const { client } = await verifiedClient(app);
      for (const url of [
        '/api/admin/countries',
        '/api/admin/countries/RW',
        '/api/admin/payment-methods',
      ]) {
        await client.get(url).expect(403);
        await new Client(app).get(url).expect(401);
      }
      await client
        .post('/api/admin/countries/RW/status', {
          status: 'ACTIVE',
          reason: REASON,
        })
        .expect(403);
    });

    it('exige un motif pour toute modification', async () => {
      await admin
        .post('/api/admin/countries/GA/status', { status: 'COMING_SOON' })
        .expect(400);
    });
  });

  describe('Scénarios métier', () => {
    beforeEach(async () => {
      await openCountries(prisma, ['CG', 'CM']);
    });

    it('1 · Rwanda : pays actif, MTN actif, Airtel bientôt disponible, carte non activable', async () => {
      // Sans tarification en RWF, le pays ne peut pas être ouvert (aucun taux de change inventé).
      const refused = await setStatus('RW', 'ACTIVE').expect(400);
      expect(refused.body.code).toBe('CURRENCY_NOT_CONFIGURED');

      await admin
        .post('/api/admin/countries/RW/pricing', {
          creditValue: 50,
          minAmount: 1000,
          maxAmount: 500000,
          active: true,
          reason: REASON,
        })
        .expect(200);
      await setStatus('RW', 'ACTIVE').expect(200);
      await setMethodStatus('RW', 'MTN_MOMO', 'ACTIVE').expect(200);
      await setMethodStatus('RW', 'AIRTEL_MONEY', 'COMING_SOON').expect(200);
      // La carte (USD, page hébergée) n'est pas encore intégrée : refus explicite côté serveur.
      const card = await setMethodStatus('RW', 'CARD', 'ACTIVE').expect(400);
      expect(card.body.code).toBe('PAYMENT_METHOD_NOT_ACTIVATABLE');

      const rw = (await pricing()).countries.find((c) => c.iso === 'RW')!;
      expect(rw.currency).toBe('RWF');
      expect(rw.methods).toEqual([
        { code: 'mtn_rw', name: 'MTN MoMo', status: 'ACTIVE' },
        { code: 'airtel_rw', name: 'Airtel Money', status: 'COMING_SOON' },
      ]);

      const { client } = await verifiedClient(app);
      // MTN : accepté.
      const ok = await client
        .post('/api/payments', {
          credits: 100,
          country: 'RW',
          network: 'mtn_rw',
          phone: PHONE_RW,
        })
        .expect(201);
      expect(ok.body.payment).toMatchObject({ country: 'RW', currency: 'RWF' });
      // Airtel « bientôt » : refusé côté serveur même si l'interface est contournée.
      const soon = await client
        .post('/api/payments', {
          credits: 100,
          country: 'RW',
          network: 'airtel_rw',
          phone: PHONE_RW,
        })
        .expect(422);
      expect(soon.body.code).toBe('PAYMENT_METHOD_UNAVAILABLE');
      // Airtel désactivé : plus du tout proposé.
      await setMethodStatus('RW', 'AIRTEL_MONEY', 'DISABLED').expect(200);
      const rw2 = (await pricing()).countries.find((c) => c.iso === 'RW')!;
      expect(rw2.methods.map((m) => m.code)).toEqual(['mtn_rw']);
    });

    it('2 · Congo-Brazzaville : MTN sélectionnable, Airtel « Bientôt disponible »', async () => {
      await setMethod(prisma, 'CG', 'AIRTEL_MONEY', 'COMING_SOON');
      const cg = (await pricing()).countries.find((c) => c.iso === 'CG')!;
      expect(cg.methods).toEqual([
        { code: 'mtn_cg', name: 'MTN MoMo', status: 'ACTIVE' },
        { code: 'airtel_cg', name: 'Airtel Money', status: 'COMING_SOON' },
      ]);
      const { client } = await verifiedClient(app);
      const res = await client
        .post('/api/payments', {
          credits: 100,
          country: 'CG',
          network: 'airtel_cg',
          phone: PHONE_CG,
        })
        .expect(422);
      expect(res.body.code).toBe('PAYMENT_METHOD_UNAVAILABLE');
      await client
        .post('/api/payments', {
          credits: 100,
          country: 'CG',
          network: 'mtn_cg',
          phone: PHONE_CG,
        })
        .expect(201);
    });

    it('3 · Gabon « Bientôt disponible » : listé mais aucun paiement possible', async () => {
      await setStatus('GA', 'COMING_SOON').expect(200);
      const body = await pricing();
      expect(body.upcomingCountries.map((c) => c.iso)).toContain('GA');
      expect(body.countries.map((c) => c.iso)).not.toContain('GA');
      const { client } = await verifiedClient(app);
      const res = await client
        .post('/api/payments', {
          credits: 100,
          country: 'GA',
          network: 'airtel_ga',
          phone: '+24104123456',
        })
        .expect(422);
      expect(res.body.code).toBe('COUNTRY_NOT_SUPPORTED');
    });

    it('4 · Nigeria désactivé : ni proposé ni accepté', async () => {
      await setStatus('NG', 'DISABLED').expect(200);
      const body = await pricing();
      expect(body.countries.map((c) => c.iso)).not.toContain('NG');
      expect(body.upcomingCountries.map((c) => c.iso)).not.toContain('NG');
      const { client } = await verifiedClient(app);
      const res = await client
        .post('/api/payments', {
          credits: 100,
          country: 'NG',
          network: 'mtn_ng',
          phone: '+2348031234567',
        })
        .expect(422);
      expect(res.body.code).toBe('COUNTRY_NOT_SUPPORTED');
    });

    it('un pays désactivé rend ses moyens inutilisables même s’ils sont actifs', async () => {
      await setCountry(prisma, 'CM', 'DISABLED');
      const { client } = await verifiedClient(app);
      const res = await client
        .post('/api/payments', {
          credits: 100,
          country: 'CM',
          network: 'mtn_cm',
          phone: '+237670123456',
        })
        .expect(422);
      expect(res.body.code).toBe('COUNTRY_NOT_SUPPORTED');
      expect((await pricing()).countries.map((c) => c.iso).includes('CM')).toBe(
        false,
      );
    });

    it('un moyen absent de la documentation SasPay ne peut pas être activé', async () => {
      const res = await setMethodStatus('GA', 'AIRTEL_MONEY', 'ACTIVE').expect(
        400,
      );
      expect(res.body.code).toBe('PAYMENT_METHOD_NOT_ACTIVATABLE');
      const swift = await setMethodStatus('XX', 'SWIFT', 'ACTIVE').expect(400);
      expect(swift.body.code).toBe('PAYMENT_METHOD_NOT_ACTIVATABLE');
    });

    it('5 · les modifications d’administration sont auditées, répercutées et laissent les anciens paiements intacts', async () => {
      const { client } = await verifiedClient(app);
      const bought = await client
        .post('/api/payments', {
          credits: 100,
          country: 'CG',
          network: 'mtn_cg',
          phone: PHONE_CG,
        })
        .expect(201);
      const id = bought.body.payment.id as string;
      const before = await prisma.payment.findUniqueOrThrow({ where: { id } });
      expect(before).toMatchObject({
        countryName: 'Congo-Brazzaville',
        methodCode: 'MTN_MOMO',
        methodName: 'MTN MoMo',
        network: 'mtn_cg',
        currency: 'XAF',
        gateway: 'mock',
      });

      await setStatus('CG', 'DISABLED').expect(200);
      await setMethodStatus('CM', 'ORANGE_MONEY', 'DISABLED').expect(200);
      await setMethodStatus('CM', 'ORANGE_MONEY', 'ACTIVE').expect(200);
      await setMethodStatus('CM', 'MTN_MOMO', 'DISABLED').expect(200);

      const body = await pricing();
      expect(body.countries.map((c) => c.iso)).not.toContain('CG');
      expect(
        body.countries.find((c) => c.iso === 'CM')!.methods.map((m) => m.code),
      ).toEqual(['orange_cm']);

      const after = await prisma.payment.findUniqueOrThrow({ where: { id } });
      expect(after).toMatchObject({
        countryName: before.countryName,
        methodCode: before.methodCode,
        amount: before.amount,
        status: before.status,
        gateway: before.gateway,
      });
      const audits = await prisma.auditLog.findMany({
        where: { action: { in: ['country.status', 'country_method.status'] } },
      });
      expect(audits.length).toBeGreaterThanOrEqual(4);
      expect(audits.every((a) => a.reason === REASON)).toBe(true);
    });
  });

  describe('Pagination serveur des listes du catalogue', () => {
    it('pages cohérentes : total, nombre de pages, aucun doublon, aucun oubli', async () => {
      const seen: string[] = [];
      let totalPages = 0;
      for (let page = 1; page <= 3; page++) {
        const body = (
          await admin
            .get(`/api/admin/countries?page=${page}&pageSize=10`)
            .expect(200)
        ).body;
        expect(body).toMatchObject({
          total: 22,
          page,
          pageSize: 10,
          totalPages: 3,
          hasPreviousPage: page > 1,
          hasNextPage: page < 3,
        });
        totalPages = body.totalPages;
        seen.push(...body.items.map((c: { iso: string }) => c.iso));
      }
      expect(totalPages).toBe(3);
      expect(seen).toHaveLength(22);
      expect(new Set(seen).size).toBe(22);
    });

    it('recherche et filtre de statut côté serveur, page invalide ramenée à la dernière', async () => {
      const found = (await admin.get('/api/admin/countries?q=rwanda')).body;
      expect(found.items.map((c: { iso: string }) => c.iso)).toEqual(['RW']);
      const active = (await admin.get('/api/admin/countries?status=ACTIVE'))
        .body;
      expect(
        active.items.every((c: { status: string }) => c.status === 'ACTIVE'),
      ).toBe(true);
      const beyond = (
        await admin.get('/api/admin/countries?page=99&pageSize=10')
      ).body;
      expect(beyond.page).toBe(3);
      expect(beyond.items).toHaveLength(2);
      await admin.get('/api/admin/countries?pageSize=500').expect(400);
    });

    it('liste des moyens de paiement paginée avec ses compteurs', async () => {
      const body = (await admin.get('/api/admin/payment-methods?pageSize=10'))
        .body;
      expect(body.total).toBe(METHODS.length);
      expect(body.items[0]).toEqual(
        expect.objectContaining({ countries: expect.any(Number) }),
      );
    });
  });
});
