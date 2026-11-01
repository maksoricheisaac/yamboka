import './isolate-otp-env';
import { INestApplication } from '@nestjs/common';
import { EmailDeliveryError, EmailProvider } from '../src/email/email.provider';
import { SettingsService } from '../src/settings/settings.service';
import {
  Client,
  createApp,
  lastEmailFor,
  otpFromEmail,
  prismaOf,
  uniqueEmail,
  PASSWORD,
} from './helpers';

describe('Codes à usage unique par e-mail (e2e)', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof prismaOf>;

  beforeAll(async () => {
    app = await createApp();
    prisma = prismaOf(app);
  });
  afterAll(async () => {
    await app.close();
  });

  afterEach(() => jest.restoreAllMocks());

  it('génère un code à six chiffres et ne le stocke jamais en clair', async () => {
    const client = new Client(app);
    const { res, email } = await client.register();
    expect(res.body.emailSent).toBe(true);
    const code = otpFromEmail(app, email);
    expect(code).toMatch(/^\d{6}$/);

    const row = await prisma.emailOtp.findFirstOrThrow({ where: { email } });
    expect(row.purpose).toBe('VERIFY_EMAIL');
    expect(row.codeHash).not.toContain(code);
    expect(JSON.stringify(row)).not.toContain(code);
    const ttl = (row.expiresAt.getTime() - row.createdAt.getTime()) / 60_000;
    expect(Math.round(ttl)).toBe(10);
  });

  it('un mauvais code consomme un essai ; au-delà de 5 essais, même le bon code est refusé', async () => {
    const client = new Client(app);
    const { email } = await client.register();
    const code = otpFromEmail(app, email);
    const wrong = code === '000000' ? '111111' : '000000';

    const first = await client.post('/v1/auth/verify-email', { code: wrong });
    expect(first.status).toBe(400);
    expect(first.body.code).toBe('OTP_INVALID');
    expect(first.body.details.attemptsLeft).toBe(4);

    for (let i = 0; i < 3; i++) {
      await client.post('/v1/auth/verify-email', { code: wrong });
    }
    const last = await client.post('/v1/auth/verify-email', { code: wrong });
    expect(last.body.details.attemptsLeft).toBe(0);

    const afterLock = await client.post('/v1/auth/verify-email', { code });
    expect(afterLock.status).toBe(400);
    expect((await client.get('/v1/auth/me')).body.user.emailVerified).toBe(
      false,
    );
  });

  it('des tentatives parallèles ne dépassent pas le plafond d’essais', async () => {
    const client = new Client(app);
    const { email } = await client.register();
    const wrong = otpFromEmail(app, email) === '123456' ? '654321' : '123456';
    await Promise.all(
      Array.from({ length: 12 }, () =>
        client.post('/v1/auth/verify-email', { code: wrong }),
      ),
    );
    const row = await prisma.emailOtp.findFirstOrThrow({ where: { email } });
    expect(row.attempts).toBeLessThanOrEqual(5);
  });

  it('limite le renvoi : délai entre deux codes, puis plafond horaire', async () => {
    const client = new Client(app);
    const { email } = await client.register();

    const tooSoon = await client.post('/v1/auth/resend-verification');
    expect(tooSoon.status).toBe(429);
    expect(tooSoon.body.code).toBe('OTP_COOLDOWN');
    expect(tooSoon.body.details.retryAfterSeconds).toBeGreaterThan(0);

    // Plafond horaire : 5 envois déjà faits il y a plus d'une minute.
    await prisma.emailOtp.deleteMany({ where: { email } });
    await prisma.emailOtp.createMany({
      data: Array.from({ length: 5 }, (_, i) => ({
        email,
        purpose: 'VERIFY_EMAIL' as const,
        codeHash: `x${i}`,
        usedAt: new Date(),
        createdAt: new Date(Date.now() - (2 + i) * 60_000),
        expiresAt: new Date(Date.now() - 60_000),
      })),
    });
    const capped = await client.post('/v1/auth/resend-verification');
    expect(capped.status).toBe(429);
    expect(capped.body.code).toBe('OTP_RATE_LIMIT');
  });

  it('un échec SMTP est explicite : l’inscription réussit mais rien n’est présenté comme envoyé', async () => {
    jest
      .spyOn(app.get(EmailProvider), 'send')
      .mockRejectedValue(new EmailDeliveryError('connection'));

    const client = new Client(app);
    const { res, email } = await client.register();
    expect(res.status).toBe(201);
    expect(res.body.emailSent).toBe(false);
    // Aucun code orphelin : une nouvelle demande n'est pas bloquée par un envoi qui n'a jamais eu lieu.
    expect(await prisma.emailOtp.count({ where: { email } })).toBe(0);

    const resend = await client.post('/v1/auth/resend-verification');
    expect(resend.status).toBe(503);
    expect(resend.body.code).toBe('EMAIL_UNAVAILABLE');
    expect(JSON.stringify(resend.body)).not.toMatch(/smtp|connection|host/i);
  });

  it('un code de connexion ne vaut pas code de vérification (objectif distinct)', async () => {
    const client = new Client(app);
    const { email } = await client.register();
    const code = otpFromEmail(app, email);
    const res = await client.post('/v1/auth/login/verify', { email, code });
    expect(res.status).toBe(400);
  });

  describe('Correction de l’adresse e-mail', () => {
    it('un compte non vérifié peut corriger son adresse : le code part vers la nouvelle, l’ancienne ne sert plus', async () => {
      const client = new Client(app);
      const { email: wrong } = await client.register();
      const oldCode = otpFromEmail(app, wrong);
      const right = uniqueEmail('corrige');

      const res = await client.post('/v1/auth/change-email', { email: right });
      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe(right);
      expect(res.body.user.emailVerified).toBe(false);

      // Le code de l'ancienne adresse est inutilisable : il est lié à l'ancienne adresse.
      const stale = await client.post('/v1/auth/verify-email', {
        code: oldCode,
      });
      expect(stale.status).toBe(400);

      await client
        .post('/v1/auth/verify-email', { code: otpFromEmail(app, right) })
        .expect(200);
      expect((await client.get('/v1/auth/me')).body.user.emailVerified).toBe(
        true,
      );
    });

    it('refuse une adresse déjà utilisée, une adresse jetable, et un compte déjà vérifié', async () => {
      const taken = new Client(app);
      const { email: takenEmail } = await taken.register();
      const client = new Client(app);
      await client.register();

      const dup = await client.post('/v1/auth/change-email', {
        email: takenEmail,
      });
      expect(dup.status).toBe(409);
      expect(dup.body.code).toBe('EMAIL_TAKEN');
      const disposable = await client.post('/v1/auth/change-email', {
        email: 'jetable@mailinator.com',
      });
      expect(disposable.status).toBe(400);

      const { email } = await taken.register();
      await taken
        .post('/v1/auth/verify-email', { code: otpFromEmail(app, email) })
        .expect(200);
      const verified = await taken.post('/v1/auth/change-email', {
        email: uniqueEmail('trop-tard'),
      });
      expect(verified.status).toBe(409);
      expect(verified.body.code).toBe('EMAIL_ALREADY_VERIFIED');
    });
  });

  describe('Confirmation de connexion', () => {
    function mode(value: 'off' | 'admin' | 'all') {
      const settings = app.get(SettingsService);
      const real = settings.get.bind(settings);
      jest
        .spyOn(settings, 'get')
        .mockImplementation((key: string) =>
          key === 'loginOtpMode' ? Promise.resolve(value) : real(key as never),
        );
    }

    async function verifiedAccount() {
      const client = new Client(app);
      const { email } = await client.register();
      await client
        .post('/v1/auth/verify-email', { code: otpFromEmail(app, email) })
        .expect(200);
      return email;
    }

    it('mot de passe correct + mode « all » : aucune session avant le code', async () => {
      const email = await verifiedAccount();
      mode('all');
      const client = new Client(app);
      const res = await client.post('/v1/auth/login', {
        email,
        password: PASSWORD,
      });
      expect(res.status).toBe(200);
      expect(res.body.otpRequired).toBe(true);
      expect(res.headers['set-cookie']).toBeUndefined();
      expect((await client.get('/v1/auth/me')).status).toBe(401);

      const code = otpFromEmail(app, email);
      expect(lastEmailFor(app, email).subject).toContain('code de connexion');
      const done = await client.post('/v1/auth/login/verify', { email, code });
      expect(done.status).toBe(200);
      expect(done.body.user.email).toBe(email);
      expect((await client.get('/v1/auth/me')).status).toBe(200);

      // Le code ne sert qu'une fois.
      const replay = await new Client(app).post('/v1/auth/login/verify', {
        email,
        code,
      });
      expect(replay.status).toBe(400);
    });

    it('un mauvais mot de passe n’envoie aucun code', async () => {
      const email = await verifiedAccount();
      mode('all');
      const before = await prisma.emailOtp.count({
        where: { email, purpose: 'LOGIN' },
      });
      const res = await new Client(app).post('/v1/auth/login', {
        email,
        password: 'Mauvais-mot-de-passe-1!',
      });
      expect(res.status).toBe(401);
      expect(
        await prisma.emailOtp.count({ where: { email, purpose: 'LOGIN' } }),
      ).toBe(before);
    });

    it('mode « admin » : un client se connecte directement', async () => {
      const email = await verifiedAccount();
      mode('admin');
      const res = await new Client(app).post('/v1/auth/login', {
        email,
        password: PASSWORD,
      });
      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe(email);
    });

    it('un compte inconnu ne reçoit rien et ne révèle rien', async () => {
      mode('all');
      const res = await new Client(app).post('/v1/auth/login', {
        email: uniqueEmail('inconnu'),
        password: PASSWORD,
      });
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
    });
  });
});
