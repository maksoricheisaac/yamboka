import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import type { Queue } from 'bullmq';

type Helpers = typeof import('./helpers');
type FinanceHelpers = typeof import('./finance-helpers');

/**
 * Vraie file BullMQ + Redis (base 15, réservée aux tests). Les autres suites exécutent les tâches en direct ;
 * celle-ci prouve que le câblage file → worker → service fonctionne et reste idempotent.
 * Les variables d'environnement sont posées AVANT d'importer l'application : le choix de la file se fait au chargement.
 */
describe('File de tâches BullMQ (e2e, Redis requis)', () => {
  let app: INestApplication;
  let helpers: Helpers;
  let finance: FinanceHelpers;
  let paymentsQueue: Queue;
  let creditsQueue: Queue;
  const previous = {
    QUEUE_ENABLED: process.env.QUEUE_ENABLED,
    REDIS_URL: process.env.REDIS_URL,
  };

  beforeAll(async () => {
    process.env.QUEUE_ENABLED = 'true';
    process.env.REDIS_URL = 'redis://localhost:6380/15';
    helpers = await import('./helpers.js');
    finance = await import('./finance-helpers.js');
    app = await helpers.createApp();
    paymentsQueue = app.get<Queue>(getQueueToken('payments'));
    creditsQueue = app.get<Queue>(getQueueToken('credits'));
    // On vide les tâches en attente d'une exécution précédente, sans toucher aux planifications.
    await paymentsQueue.drain(true);
    await creditsQueue.drain(true);
  });

  afterAll(async () => {
    await app.close();
    for (const [k, v] of Object.entries(previous)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  async function until<T>(
    read: () => Promise<T>,
    done: (v: T) => boolean,
    ms = 15_000,
  ): Promise<T> {
    const deadline = Date.now() + ms;
    for (;;) {
      const value = await read();
      if (done(value)) return value;
      if (Date.now() > deadline)
        throw new Error(
          `Délai dépassé ; dernière valeur : ${JSON.stringify(value)}`,
        );
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  async function purchase() {
    const { client, userId } = await finance.verifiedClient(app);
    const pack = await helpers
      .prismaOf(app)
      .creditPack.findFirstOrThrow({ where: { name: 'Starter' } });
    const created = await client.post('/v1/payments', {
      packId: pack.id,
      operator: 'MTN',
      phone: '242061234567',
    });
    const payment = (
      created.body as { payment: { id: string; reference: string } }
    ).payment;
    return { client, userId, payment };
  }

  const status = async (id: string) =>
    (await helpers.prismaOf(app).payment.findUniqueOrThrow({ where: { id } }))
      .status;
  const ledgerOf = (userId: string) => finance.ledgerOf(app, userId);

  it('le callback met une tâche en file, le worker crédite, une seule fois malgré cinq callbacks', async () => {
    const { client, userId, payment } = await purchase();
    await client
      .post(`/v1/payments/${payment.id}/simulate`, {
        outcome: 'success',
        callbacks: 5,
      })
      .expect(200);

    await until(
      () => status(payment.id),
      (s) => s === 'SUCCESS',
    );
    const rows = await ledgerOf(userId);
    expect(
      rows
        .filter((r) => r.paymentId === payment.id)
        .map((r) => `${r.type}:${r.amount}`)
        .sort(),
    ).toEqual(['FIRST_PURCHASE_BONUS:250', 'PURCHASE:1250']);
    expect((await client.get('/v1/auth/me')).body.user.credits).toBe(1500);
  });

  it('un callback falsifié passe aussi par la file et ne crédite rien', async () => {
    const { client, payment } = await purchase();
    await client
      .post(`/v1/payments/${payment.id}/simulate`, {
        outcome: 'forged_callback',
        callbacks: 3,
      })
      .expect(200);
    // On attend que le worker ait réellement traité les tâches (file vidée), au lieu d'un délai arbitraire.
    // Les tâches planifiées futures sont « delayed » : on ne compte que ce qui attend ou s'exécute.
    await until(
      () => paymentsQueue.getJobCounts('waiting', 'active'),
      (c) => c.waiting + c.active === 0,
    );
    expect(await status(payment.id)).toBe('PENDING');
    expect((await client.get('/v1/auth/me')).body.user.credits).toBe(0);
  });

  it('la tâche de rattrapage récupère un paiement dont le callback a été perdu', async () => {
    const { client, payment } = await purchase();
    await helpers.prismaOf(app).mockPaymentTransaction.update({
      where: { reference: payment.reference },
      data: { status: 'success' },
    });
    await paymentsQueue.add('reconcile-payments', {});
    await until(
      () => status(payment.id),
      (s) => s === 'SUCCESS',
    );
    expect((await client.get('/v1/auth/me')).body.user.credits).toBe(1500);
  });

  it('planifie les tâches récurrentes : rattrapage toutes les 2 min, expiration chaque nuit', async () => {
    const reconcile = await paymentsQueue.getJobScheduler('reconcile-payments');
    expect(reconcile).toMatchObject({ every: 120_000 });
    const expiry = await creditsQueue.getJobScheduler('expire-credits');
    expect(expiry).toMatchObject({
      pattern: '0 3 * * *',
      tz: 'Africa/Brazzaville',
    });
  });

  it('la tâche d’expiration écrit les mouvements EXPIRE des lots échus', async () => {
    const user = await finance.userWithBalance(app);
    await finance.addLot(app, user.id, 7, { expiresInDays: -1 });
    await creditsQueue.add('expire-credits', {});
    await until(
      () => finance.ledgerOf(app, user.id),
      (rows) => rows.some((r) => r.type === 'EXPIRE'),
    );
    const total = (await finance.ledgerOf(app, user.id)).reduce(
      (s, r) => s + r.amount,
      0,
    );
    expect(total).toBe(0);
  });
});
