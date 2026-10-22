import { INestApplication } from '@nestjs/common';
import { Client, PASSWORD, createApp, uniqueEmail } from './helpers';

/** Limitation de débit réelle : les autres suites la désactivent (NODE_ENV=test), celle-ci l'active. */
describe('Limitation de débit (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.THROTTLE_TESTS = '1';
    app = await createApp();
  });
  afterAll(async () => {
    await app.close();
    delete process.env.THROTTLE_TESTS;
  });

  it('bloque la 6e tentative de connexion sur un même couple IP + e-mail, en français', async () => {
    const client = new Client(app);
    const email = uniqueEmail('force-brute');
    for (let i = 0; i < 5; i++) {
      const res = await client.post('/v1/auth/login', {
        email,
        password: 'mauvais',
      });
      expect(res.status).toBe(401);
    }
    const blocked = await client.post('/v1/auth/login', {
      email,
      password: PASSWORD,
    });
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('TOO_MANY_REQUESTS');
    expect(blocked.body.message).toContain('Trop de tentatives');
    expect(Number(blocked.headers['retry-after-auth'])).toBeGreaterThan(0);
  });

  it('un autre e-mail depuis la même IP reste possible, mais l’IP elle-même est plafonnée', async () => {
    const client = new Client(app);
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) {
      const res = await client.post('/v1/auth/login', {
        email: uniqueEmail('balayage'),
        password: 'mauvais',
      });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 30).every((s) => s === 401)).toBe(true);
    expect(statuses[30]).toBe(429);
  });

  it('une autre IP n’est pas affectée', async () => {
    const res = await new Client(app).post('/v1/auth/login', {
      email: uniqueEmail('autre-ip'),
      password: 'mauvais',
    });
    expect(res.status).toBe(401);
  });
});
