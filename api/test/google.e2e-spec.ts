import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  GoogleOAuthClient,
  GoogleProfile,
} from '../src/auth/google-oauth.client';
import {
  APP_ORIGIN,
  Client,
  PASSWORD,
  createApp,
  prismaOf,
  otpFromEmail,
  uniqueEmail,
} from './helpers';

const APP = 'http://localhost:3001';

function profile(overrides: Partial<GoogleProfile> = {}): GoogleProfile {
  return {
    sub: `sub-${Math.random().toString(36).slice(2)}`,
    email: uniqueEmail('google'),
    emailVerified: true,
    givenName: 'Grace',
    familyName: 'Okemba',
    ...overrides,
  };
}

describe('Connexion Google (e2e, client Google simulé)', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof prismaOf>;
  let fetchProfile: jest.SpyInstance;

  beforeAll(async () => {
    app = await createApp();
    prisma = prismaOf(app);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    fetchProfile = jest.spyOn(app.get(GoogleOAuthClient), 'fetchProfile');
  });
  afterEach(() => jest.restoreAllMocks());

  /** Démarre le flux et renvoie le paramètre state attendu par Google. */
  async function start(client: Client): Promise<string> {
    const res = await client.get('/v1/auth/google');
    expect(res.status).toBe(302);
    return new URL(res.headers.location).searchParams.get('state')!;
  }

  async function callback(client: Client, state: string, p: GoogleProfile) {
    fetchProfile.mockResolvedValue(p);
    return client.get(`/v1/auth/google/callback?code=abc&state=${state}`);
  }

  it('redirige vers Google avec state, PKCE (S256) et des cookies httpOnly', async () => {
    const res = await new Client(app).get('/v1/auth/google');
    expect(res.status).toBe(302);
    const url = new URL(res.headers.location);
    expect(url.origin + url.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toHaveLength(32);
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies.filter((c) => c.includes('HttpOnly'))).toHaveLength(2);
  });

  it('rejette un retour avec un state falsifié ou sans cookie', async () => {
    const client = new Client(app);
    await start(client);
    const forged = await callback(client, 'etat-falsifie', profile());
    expect(forged.headers.location).toBe(`${APP}/connexion?erreur=google_etat`);

    const noCookie = await callback(new Client(app), 'x'.repeat(32), profile());
    expect(noCookie.headers.location).toBe(
      `${APP}/connexion?erreur=google_etat`,
    );
    expect(fetchProfile).not.toHaveBeenCalled();
  });

  it('crée un compte vérifié sans crédit offert, sans mot de passe, et demande les CGU', async () => {
    const client = new Client(app);
    const p = profile();
    const res = await callback(client, await start(client), p);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${APP}/app`);
    const me = await client.get('/v1/auth/me').expect(200);
    expect(me.body.user).toMatchObject({
      email: p.email,
      firstName: 'Grace',
      emailVerified: true,
      credits: 0,
      googleLinked: true,
      hasPassword: false,
      legalAccepted: false,
    });

    const accepted = await client.post('/v1/me/legal-acceptances').expect(200);
    expect(accepted.body.user.legalAccepted).toBe(true);
    // Aucune connexion par mot de passe n'est possible sur un compte Google seul.
    const pwd = await new Client(app).post('/v1/auth/login', {
      email: p.email,
      password: PASSWORD,
    });
    expect(pwd.status).toBe(401);
  });

  it('se reconnecte au même compte via son identifiant Google', async () => {
    const p = profile();
    const first = new Client(app);
    await callback(first, await start(first), p);
    const second = new Client(app);
    await callback(second, await start(second), {
      ...p,
      email: uniqueEmail('autre'),
    });
    const a = (await first.get('/v1/auth/me')).body.user.id;
    const b = (await second.get('/v1/auth/me')).body.user.id;
    expect(a).toBe(b);
  });

  it('relie un compte e-mail vérifié sans toucher à son mot de passe', async () => {
    const client = new Client(app);
    const { email } = await client.register();
    await client
      .post('/v1/auth/verify-email', { code: otpFromEmail(app, email) })
      .expect(200);
    const id = (await client.get('/v1/auth/me')).body.user.id;

    const g = new Client(app);
    await callback(g, await start(g), profile({ email }));
    expect((await g.get('/v1/auth/me')).body.user).toMatchObject({
      id,
      googleLinked: true,
      hasPassword: true,
    });
    expect(
      (
        await new Client(app).post('/v1/auth/login', {
          email,
          password: PASSWORD,
        })
      ).status,
    ).toBe(200);
  });

  it('relie un compte e-mail NON vérifié en effaçant son mot de passe (anti-détournement)', async () => {
    // Un tiers a pu s'inscrire avec l'adresse d'autrui : son mot de passe ne doit pas survivre à la liaison.
    const attacker = new Client(app);
    const { email } = await attacker.register();
    expect((await attacker.get('/v1/auth/me')).status).toBe(200);

    const owner = new Client(app);
    await callback(owner, await start(owner), profile({ email }));

    expect((await attacker.get('/v1/auth/me')).status).toBe(401);
    expect(
      (
        await new Client(app).post('/v1/auth/login', {
          email,
          password: PASSWORD,
        })
      ).status,
    ).toBe(401);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.passwordHash).toBeNull();
    expect(user.emailVerifiedAt).not.toBeNull();
    expect((await owner.get('/v1/auth/me')).status).toBe(200);
  });

  it("n'accepte jamais une adresse que Google n'a pas vérifiée", async () => {
    const client = new Client(app);
    const p = profile({ emailVerified: false });
    const res = await callback(client, await start(client), p);
    expect(res.headers.location).toBe(`${APP}/connexion?erreur=google_email`);
    expect(await prisma.user.count({ where: { email: p.email } })).toBe(0);
  });

  it('refuse un compte banni', async () => {
    const p = profile();
    const first = new Client(app);
    await callback(first, await start(first), p);
    await prisma.user.update({
      where: { email: p.email },
      data: { status: 'BANNED' },
    });

    const again = new Client(app);
    const res = await callback(again, await start(again), p);
    expect(res.headers.location).toBe(
      `${APP}/connexion?erreur=compte_suspendu`,
    );
    expect((await again.get('/v1/auth/me')).status).toBe(401);
  });

  it('une erreur renvoyée par Google ramène à la page de connexion', async () => {
    const client = new Client(app);
    await start(client);
    const res = await client.get(
      '/v1/auth/google/callback?error=access_denied',
    );
    expect(res.headers.location).toBe(`${APP}/connexion?erreur=google_refuse`);
  });

  it('indique si la connexion Google est disponible', async () => {
    const on = await new Client(app).get('/v1/auth/providers').expect(200);
    expect(on.body).toMatchObject({ google: true });
    expect(on.body.emailOtp).toEqual({
      length: 6,
      ttlMinutes: 10,
      resendCooldownSeconds: 0,
    });
    jest
      .spyOn(app.get(GoogleOAuthClient), 'isConfigured')
      .mockReturnValue(false);
    const off = await new Client(app).get('/v1/auth/providers').expect(200);
    expect(off.body).toMatchObject({ google: false });
  });

  it('renvoie 503 si Google n’est pas configuré', async () => {
    jest
      .spyOn(app.get(GoogleOAuthClient), 'isConfigured')
      .mockReturnValue(false);
    const res = await request(app.getHttpServer())
      .get('/v1/auth/google')
      .set('Origin', APP_ORIGIN);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('GOOGLE_NOT_CONFIGURED');
  });
});
