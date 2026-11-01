import './isolate-setup-db';
import { INestApplication } from '@nestjs/common';
import { Client, createApp, prismaOf, uniqueEmail } from './helpers';
import { resetDatabase } from './reset-database';
import { TEST_ENV } from './test-env';

const SECRET = TEST_ENV.SETUP_SECRET;
const STRONG = 'Proprietaire-Yamboka-2026!';

describe('Setup Wizard (e2e)', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof prismaOf>;

  const body = (overrides: Record<string, unknown> = {}) => ({
    firstName: 'Awa',
    lastName: 'Ngoma',
    email: uniqueEmail('owner'),
    password: STRONG,
    confirmPassword: STRONG,
    acceptLegal: true,
    ...overrides,
  });

  const complete = (
    client: Client,
    payload: object,
    secret: string | undefined = SECRET,
  ) => {
    const req = client.agent
      .post('/v1/setup/complete')
      .set('X-Forwarded-For', client.ip);
    if (secret) req.set('X-Setup-Secret', secret);
    return req.send(payload);
  };

  beforeAll(async () => {
    // Base vierge : migrations seules, ni administrateur ni données de base.
    await resetDatabase(process.env.DATABASE_URL!, { seed: false });
    app = await createApp();
    prisma = prismaOf(app);
  }, 120_000);
  afterAll(async () => {
    await app.close();
  });

  it('avant l’installation : l’état est « non initialisé » et ne divulgue rien', async () => {
    const res = await new Client(app).get('/v1/setup/status').expect(200);
    expect(res.body).toEqual({ initialized: false, secretConfigured: true });
  });

  it('refuse l’accès sans secret ou avec un mauvais secret', async () => {
    const client = new Client(app);
    expect(
      (
        await client.agent
          .post('/v1/setup/check')
          .set('X-Forwarded-For', client.ip)
      ).status,
    ).toBe(401);
    expect(
      (
        await client.agent
          .post('/v1/setup/check')
          .set('X-Forwarded-For', client.ip)
          .set('X-Setup-Secret', 'faux'.repeat(10))
      ).status,
    ).toBe(401);
    expect((await complete(client, body(), 'faux'.repeat(10))).status).toBe(
      401,
    );
    expect(await prisma.user.count()).toBe(0);
  });

  it('le diagnostic est lisible et sans secret ni identifiant de base', async () => {
    const client = new Client(app);
    const res = await client.agent
      .post('/v1/setup/check')
      .set('X-Forwarded-For', client.ip)
      .set('X-Setup-Secret', SECRET)
      .expect(200);
    const keys = res.body.items.map((i: { key: string }) => i.key);
    expect(keys).toEqual(
      expect.arrayContaining(['database', 'email', 'providers', 'secrets']),
    );
    expect(res.body.canContinue).toBe(true);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('yamboka_dev_password');
    expect(text).not.toContain(TEST_ENV.SESSION_SECRET);
    expect(text).not.toContain(SECRET);
  });

  it('valide les informations : mot de passe robuste, confirmation, consentement', async () => {
    const client = new Client(app);
    const weak = await complete(
      client,
      body({ password: 'court', confirmPassword: 'court' }),
    );
    expect(weak.status).toBe(400);
    const noMix = await complete(
      client,
      body({
        password: 'uniquementdeslettres',
        confirmPassword: 'uniquementdeslettres',
      }),
    );
    expect(noMix.status).toBe(400);
    const mismatch = await complete(
      client,
      body({ confirmPassword: `${STRONG}x` }),
    );
    expect(mismatch.status).toBe(400);
    const noConsent = await complete(client, body({ acceptLegal: false }));
    expect(noConsent.status).toBe(400);
    expect(await prisma.user.count()).toBe(0);
  });

  it('deux requêtes simultanées ne créent qu’un seul administrateur initial', async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, () => complete(new Client(app), body())),
    );
    const created = results.filter((r) => r.status === 201);
    const locked = results.filter((r) => r.status === 403);
    expect(created).toHaveLength(1);
    expect(locked).toHaveLength(5);
    locked.forEach((r) => expect(r.body.code).toBe('SETUP_LOCKED'));
    expect(await prisma.user.count({ where: { role: 'ADMIN' } })).toBe(1);
    expect(await prisma.installState.count()).toBe(1);

    const winner = created[0];
    expect(winner.body.user.role).toBe('ADMIN');
    expect(winner.body.user.emailVerified).toBe(true);
    expect(winner.body.user.legalAccepted).toBe(true);
    expect(winner.headers['set-cookie']).toBeDefined();
    expect(winner.body.summary.baseData.packs).toBeGreaterThan(0);
  });

  it('initialise les données de base et journalise l’installation', async () => {
    expect(await prisma.creditPack.count()).toBeGreaterThan(0);
    expect(
      await prisma.generationProduct.count({ where: { active: true } }),
    ).toBeGreaterThan(0);
    expect(await prisma.legalDocument.count()).toBe(3);
    expect(await prisma.setting.count()).toBeGreaterThan(5);
    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'setup.completed' },
    });
    expect(log.actorId).not.toBeNull();
  });

  it('une fois installé : l’assistant est verrouillé, même avec le bon secret', async () => {
    const client = new Client(app);
    expect((await client.get('/v1/setup/status')).body.initialized).toBe(true);
    const check = await client.agent
      .post('/v1/setup/check')
      .set('X-Forwarded-For', client.ip)
      .set('X-Setup-Secret', SECRET);
    expect(check.status).toBe(403);
    expect(check.body.code).toBe('SETUP_LOCKED');
    const again = await complete(client, body());
    expect(again.status).toBe(403);
    expect(await prisma.user.count({ where: { role: 'ADMIN' } })).toBe(1);
  });

  it('le verrou survit à la perte de la ligne d’état (restauration) tant qu’un administrateur existe', async () => {
    await prisma.installState.deleteMany();
    const client = new Client(app);
    expect((await client.get('/v1/setup/status')).body.initialized).toBe(true);
    expect(await prisma.installState.count()).toBe(1);
    expect((await complete(client, body())).status).toBe(403);
  });

  it('l’inscription publique ne peut jamais donner le rôle administrateur', async () => {
    const client = new Client(app);
    const { res, email } = await client.register({ role: 'ADMIN' });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('USER');
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { email } })).role,
    ).toBe('USER');
  });

  it('aucune route ne permet de réinitialiser l’installation', async () => {
    const client = new Client(app);
    for (const [method, url] of [
      ['delete', '/v1/setup'],
      ['post', '/v1/setup/reset'],
      ['post', '/v1/setup/status'],
    ] as const) {
      const res = await client.agent[method](url)
        .set('X-Forwarded-For', client.ip)
        .set('X-Setup-Secret', SECRET);
      expect(res.status).toBeGreaterThanOrEqual(400);
    }
    expect(await prisma.installState.count()).toBe(1);
  });
});
