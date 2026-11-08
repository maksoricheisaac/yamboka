import './isolate-pagination-db';
import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { verifiedClient } from './finance-helpers';
import { Client, createApp, prismaOf } from './helpers';
import { resetDatabase } from './reset-database';
import { TEST_ENV } from './test-env';

const N = 2500; // clients, paiements, générations, entrées d'audit
const MINE = 130; // créations et mouvements du client connecté
/** Budget par requête paginée (base locale, plusieurs milliers de lignes) : large, il ne sert qu'à repérer une régression grossière. */
const BUDGET_MS = 1500;

interface PageBody {
  items: { id: string }[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

describe('Pagination serveur sur un gros volume (e2e)', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof prismaOf>;
  let admin: Client;
  let customer: Client;
  let customerId: string;
  let otherId: string;
  const slow: string[] = [];

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

    const product = await prisma.generationProduct.findFirstOrThrow();
    const now = Date.now();
    const at = (i: number) => new Date(now - i * 1000);
    const userIds = Array.from({ length: N }, () => randomUUID());
    await prisma.user.createMany({
      data: userIds.map((id, i) => ({
        id,
        firstName: `Prenom${i}`,
        lastName: `Nom${i % 40}`,
        email: `vol${i}@example.com`,
        status: (['ACTIVE', 'ACTIVE', 'ACTIVE', 'SUSPENDED'] as const)[i % 4],
        createdAt: at(i),
      })),
    });
    const COUNTRIES = ['CG', 'CM', 'RW'];
    const STATUSES = ['SUCCESS', 'FAILED', 'PENDING', 'SUCCESS'] as const;
    await prisma.payment.createMany({
      data: userIds.map((userId, i) => ({
        userId,
        country: COUNTRIES[i % 3],
        currency: i % 3 === 2 ? 'RWF' : 'XAF',
        amount: 5000 + (i % 7) * 100, // beaucoup de valeurs identiques : le départage par identifiant est testé
        credits: 500,
        gateway: i % 10 === 0 ? 'openpay' : 'saspay', // anciennes lignes OpenPay conservées
        operator: 'MTN' as const,
        payerPhone: '+242061234567',
        status: STATUSES[i % 4],
        network: 'mtn_cg',
        countryName: COUNTRIES[i % 3],
        methodCode: i % 2 ? 'MTN_MOMO' : 'AIRTEL_MONEY',
        methodName: i % 2 ? 'MTN MoMo' : 'Airtel Money',
        externalReference: `VOL-${i}`,
        createdAt: at(i % 600), // dates identiques entre plusieurs lignes
      })),
    });
    await prisma.generation.createMany({
      data: userIds.map((userId, i) => ({
        userId,
        productId: product.id,
        status: (['COMPLETED', 'FAILED', 'PENDING'] as const)[i % 3],
        creditsCost: 40,
        consentAt: new Date(),
        createdAt: at(i % 500),
      })),
    });
    await prisma.auditLog.createMany({
      data: Array.from({ length: N }, (_, i) => ({
        action: i % 2 ? 'country.status' : 'pack.update',
        entityType: 'Country',
        entityId: 'RW',
        reason: 'volume',
        createdAt: at(i % 300),
      })),
    });
    await prisma.report.createMany({
      data: Array.from({ length: 1200 }, (_, i) => ({
        reason: `motif ${i}`,
        status: (['NEW', 'RESOLVED'] as const)[i % 2],
        createdAt: at(i % 200),
      })),
    });

    ({ client: customer } = await verifiedClient(app));
    customerId = (
      await prisma.user.findFirstOrThrow({
        where: { email: { not: { startsWith: 'vol' } }, role: 'USER' },
        orderBy: { createdAt: 'desc' },
      })
    ).id;
    otherId = userIds[0];
    for (const userId of [customerId, otherId]) {
      await prisma.generation.createMany({
        data: Array.from({ length: MINE }, (_, i) => ({
          userId,
          productId: product.id,
          status: 'COMPLETED' as const,
          creditsCost: 40,
          consentAt: new Date(),
          createdAt: at(i),
        })),
      });
      await prisma.creditLedger.createMany({
        data: Array.from({ length: MINE }, (_, i) => ({
          userId,
          amount: i % 2 ? 10 : -5, // PURCHASE > 0, RESERVE < 0 (contrainte du registre)
          type: i % 2 ? ('PURCHASE' as const) : ('RESERVE' as const),
          reference: `vol:${userId}:${i}`,
          createdAt: at(i % 50),
        })),
      });
    }
  }, 180_000);
  afterAll(async () => {
    await app.close();
    if (slow.length) console.warn(`Requêtes lentes : ${slow.join(' | ')}`);
  });

  async function fetchPage(
    client: Client,
    url: string,
    page: number,
    pageSize: number,
  ): Promise<PageBody> {
    const sep = url.includes('?') ? '&' : '?';
    const t = Date.now();
    const res = await client
      .get(`${url}${sep}page=${page}&pageSize=${pageSize}`)
      .expect(200);
    const ms = Date.now() - t;
    if (ms > BUDGET_MS) slow.push(`${url} p${page}: ${ms} ms`);
    return res.body as PageBody;
  }

  /** Parcourt toutes les pages : aucun doublon, aucun oubli, méta cohérente. */
  async function crawl(client: Client, url: string, pageSize: number) {
    const first = await fetchPage(client, url, 1, pageSize);
    const ids: string[] = [...first.items.map((i) => i.id)];
    expect(first.totalPages).toBe(
      Math.max(Math.ceil(first.total / pageSize), 1),
    );
    expect(first.hasPreviousPage).toBe(false);
    expect(first.hasNextPage).toBe(first.totalPages > 1);
    for (let p = 2; p <= first.totalPages; p++) {
      const body = await fetchPage(client, url, p, pageSize);
      expect(body.page).toBe(p);
      expect(body.total).toBe(first.total);
      expect(body.hasPreviousPage).toBe(true);
      expect(body.hasNextPage).toBe(p < first.totalPages);
      ids.push(...body.items.map((i) => i.id));
    }
    expect(ids).toHaveLength(first.total);
    expect(new Set(ids).size).toBe(first.total);
    return { total: first.total, ids };
  }

  describe('les 8 pages prioritaires, pages entières parcourues', () => {
    it.each([
      ['/admin/utilisateurs', '/api/admin/users', N + 2],
      ['/admin/signalements', '/api/admin/reports', 1200],
      ['/admin/generations', '/api/admin/generations', N + 2 * MINE],
      ['/admin/paiements', '/api/admin/payments', N],
      ['/admin/audit', '/api/admin/audit', N],
    ])(
      '%s : tout est servi, sans doublon ni oubli',
      async (_page, url, expected) => {
        const { total } = await crawl(admin, url, 100);
        // L'audit contient aussi les traces des actions de la suite (connexions, etc.) : au moins le volume injecté.
        if (url.endsWith('/audit'))
          expect(total).toBeGreaterThanOrEqual(expected);
        else expect(total).toBeGreaterThanOrEqual(expected);
      },
      120_000,
    );

    it('/admin/packs : paginé avec sa synthèse', async () => {
      const body = (
        await admin.get('/api/admin/packs?pageSize=2&page=1').expect(200)
      ).body;
      expect(body.items).toHaveLength(2);
      expect(body.summary.total).toBeGreaterThanOrEqual(3);
      expect(body.totalPages).toBeGreaterThanOrEqual(2);
    });

    it('/app/creations : ses créations seulement, paginées', async () => {
      const { total, ids } = await crawl(customer, '/api/creations', 50);
      expect(total).toBe(MINE);
      const owners = await prisma.generation.findMany({
        where: { id: { in: ids } },
        select: { userId: true },
      });
      expect(owners.every((g) => g.userId === customerId)).toBe(true);
    }, 120_000);

    it('/app/historique : ses mouvements seulement, avec filtre et dates', async () => {
      const { total, ids } = await crawl(customer, '/api/credits/ledger', 50);
      expect(total).toBe(MINE);
      const owners = await prisma.creditLedger.findMany({
        where: { id: { in: ids } },
        select: { userId: true },
      });
      expect(owners.every((l) => l.userId === customerId)).toBe(true);
      const purchases = await fetchPage(
        customer,
        '/api/credits/ledger?filter=purchases',
        1,
        20,
      );
      expect(purchases.total).toBe(MINE / 2);
      const today = new Date().toISOString().slice(0, 10);
      const dated = await fetchPage(
        customer,
        `/api/credits/ledger?from=${today}&to=${today}`,
        1,
        20,
      );
      expect(dated.total).toBe(MINE);
    });

    it('un client ne peut lire ni les listes d’administration ni celles d’un autre', async () => {
      for (const url of [
        '/api/admin/users',
        '/api/admin/payments',
        '/api/admin/audit',
        '/api/admin/generations',
        '/api/admin/reports',
        '/api/admin/packs',
      ])
        await customer.get(url).expect(403);
      await new Client(app).get('/api/creations').expect(401);
      await new Client(app).get('/api/credits/ledger').expect(401);
      // Les créations d'un autre compte n'apparaissent jamais, même avec ses identifiants dans les filtres.
      const mine = await fetchPage(
        customer,
        `/api/creations?userId=${otherId}`,
        1,
        100,
      );
      expect(mine.total).toBe(MINE);
    });
  });

  describe('filtres, recherche et tri côté serveur', () => {
    it('recherche d’un utilisateur : seuls les résultats correspondants sont paginés', async () => {
      const body = await fetchPage(admin, '/api/admin/users?q=vol12', 1, 10);
      expect(body.total).toBeGreaterThan(1);
      expect(body.total).toBeLessThan(N / 10);
      const { total } = await crawl(admin, '/api/admin/users?q=vol12', 10);
      expect(total).toBe(body.total);
      const status = await fetchPage(
        admin,
        '/api/admin/users?status=SUSPENDED',
        1,
        20,
      );
      expect(status.total).toBe(N / 4);
    });

    it('paiements : pays, moyen, statut, fournisseur et période se combinent', async () => {
      const rw = await fetchPage(
        admin,
        '/api/admin/payments?country=RW',
        1,
        20,
      );
      expect(rw.total).toBe(Math.ceil((N - 2) / 3));
      const combined = await fetchPage(
        admin,
        '/api/admin/payments?country=RW&method=MTN_MOMO&status=SUCCESS&provider=saspay',
        1,
        20,
      );
      expect(combined.total).toBeGreaterThan(0);
      expect(combined.total).toBeLessThan(rw.total);
      const rows = (
        await admin
          .get(
            '/api/admin/payments?country=RW&method=MTN_MOMO&status=SUCCESS&provider=saspay&pageSize=100',
          )
          .expect(200)
      ).body.items as Record<string, unknown>[];
      expect(
        rows.every(
          (r) =>
            r.country === 'RW' &&
            r.methodCode === 'MTN_MOMO' &&
            r.status === 'SUCCESS' &&
            r.provider === 'saspay',
        ),
      ).toBe(true);
      // Les anciennes transactions OpenPay restent consultables, sans être mélangées aux nouvelles.
      const legacy = await fetchPage(
        admin,
        '/api/admin/payments?provider=openpay',
        1,
        100,
      );
      expect(legacy.total).toBe(N / 10);
      const today = new Date().toISOString().slice(0, 10);
      const day = await fetchPage(
        admin,
        `/api/admin/payments?from=${today}&to=${today}`,
        1,
        20,
      );
      expect(day.total).toBe(N);
      const user = await prisma.payment.findFirstOrThrow({
        where: { externalReference: 'VOL-7' },
      });
      const byUser = await fetchPage(
        admin,
        `/api/admin/payments?userId=${user.userId}`,
        1,
        20,
      );
      expect(byUser.total).toBe(1);
      await admin.get('/api/admin/payments?userId=pas-un-uuid').expect(400);
    });

    it('tri par colonne sur toute la liste, départagé par identifiant (pages stables)', async () => {
      const asc = await crawl(
        admin,
        '/api/admin/payments?sort=amount&dir=asc',
        100,
      );
      const desc = await crawl(
        admin,
        '/api/admin/payments?sort=amount&dir=desc',
        100,
      );
      expect(asc.ids.length).toBe(desc.ids.length);
      expect(asc.ids[0]).not.toBe(desc.ids[0]);
      const first = (
        await admin
          .get('/api/admin/payments?sort=amount&dir=desc&pageSize=10')
          .expect(200)
      ).body.items as { amount: number }[];
      expect(first.every((r) => r.amount === 5600)).toBe(true);
      // Une colonne hors liste blanche est ignorée (aucune erreur, tri par défaut).
      await admin
        .get('/api/admin/payments?sort=passwordHash&dir=asc')
        .expect(200);
    });

    it('une page hors limites est ramenée à la dernière page valide', async () => {
      const body = await fetchPage(admin, '/api/admin/audit', 9999, 100);
      expect(body.page).toBe(body.totalPages);
      expect(body.items.length).toBeGreaterThan(0);
      await admin.get('/api/admin/users?page=0').expect(400);
      await admin.get('/api/admin/users?pageSize=101').expect(400);
    });

    it('statut de signalement et date côté serveur', async () => {
      const neu = await fetchPage(
        admin,
        '/api/admin/reports?status=NEW',
        1,
        20,
      );
      expect(neu.total).toBe(600);
      const gen = await fetchPage(
        admin,
        '/api/admin/generations?status=FAILED',
        1,
        20,
      );
      expect(gen.total).toBeGreaterThanOrEqual(Math.floor(N / 3));
    });
  });
});
