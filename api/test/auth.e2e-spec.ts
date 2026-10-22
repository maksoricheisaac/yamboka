import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  APP_ORIGIN,
  Client,
  PASSWORD,
  freshIp,
  lastEmailFor,
  prismaOf,
  signupBody,
  tokenFromEmail,
  uniqueEmail,
  createApp,
  rawSession,
} from './helpers';

describe('Authentification (e2e)', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof prismaOf>;

  beforeAll(async () => {
    app = await createApp();
    prisma = prismaOf(app);
  });
  afterAll(async () => {
    await app.close();
  });

  async function verified(overrides: Record<string, unknown> = {}) {
    const client = new Client(app);
    const { email } = await client.register(overrides);
    await client
      .post('/v1/auth/verify-email', { token: tokenFromEmail(app, email) })
      .expect(200);
    return { client, email };
  }

  describe('Inscription', () => {
    it('crée le compte, ouvre une session sécurisée et envoie le lien de vérification', async () => {
      const client = new Client(app);
      const { res, email } = await client.register();

      expect(res.status).toBe(201);
      const cookie = (res.headers['set-cookie'] as unknown as string[]).find(
        (c) => c.startsWith('yamboka_session='),
      )!;
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');

      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(user.passwordHash).toMatch(/^\$argon2id\$/);
      expect(user.role).toBe('USER');
      expect(
        await prisma.legalAcceptance.count({ where: { userId: user.id } }),
      ).toBe(2);

      // Le jeton de session n'est jamais stocké en clair.
      const rawToken = cookie.split(';')[0].split('=')[1];
      expect(
        await prisma.session.count({ where: { tokenHash: rawToken } }),
      ).toBe(0);
      expect(await prisma.session.count({ where: { userId: user.id } })).toBe(
        1,
      );

      const mail = lastEmailFor(app, email);
      expect(mail.subject).toContain('Confirmez votre adresse e-mail');

      const me = await client.get('/v1/auth/me').expect(200);
      expect(me.body.user).toMatchObject({
        emailVerified: false,
        credits: 0,
        role: 'USER',
        legalAccepted: true,
      });
    });

    it('refuse les adresses e-mail jetables', async () => {
      const res = await new Client(app).post(
        '/v1/auth/register',
        signupBody({ email: 'test@mailinator.com' }),
      );
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('DISPOSABLE_EMAIL');
    });

    it.each([
      [
        'mot de passe trop court',
        { password: 'court', confirmPassword: 'court' },
        'password',
      ],
      [
        'confirmation différente',
        { confirmPassword: 'Autre-motdepasse-1' },
        'confirmPassword',
      ],
      ['conditions non acceptées', { acceptLegal: false }, 'acceptLegal'],
      ['téléphone invalide', { phone: '0612345678' }, 'phone'],
      ['e-mail invalide', { email: 'pas-un-email' }, 'email'],
    ])('rejette : %s', async (_label, override, field) => {
      const res = await new Client(app).post(
        '/v1/auth/register',
        signupBody(override),
      );
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.details.map((d: { field: string }) => d.field)).toContain(
        field,
      );
    });

    it('refuse une adresse déjà utilisée, sans tenir compte de la casse', async () => {
      const email = uniqueEmail('doublon');
      await new Client(app)
        .register({ email })
        .then((r) => expect(r.res.status).toBe(201));
      const res = await new Client(app).post(
        '/v1/auth/register',
        signupBody({ email: email.toUpperCase() }),
      );
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('EMAIL_TAKEN');
    });

    it('deux inscriptions simultanées avec la même adresse : un seul compte', async () => {
      const email = uniqueEmail('course');
      const results = await Promise.all([
        new Client(app).post('/v1/auth/register', signupBody({ email })),
        new Client(app).post('/v1/auth/register', signupBody({ email })),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await prisma.user.count({ where: { email } })).toBe(1);
    });

    it("ne permet jamais d'obtenir le rôle ADMIN par l'inscription", async () => {
      const client = new Client(app);
      const { res, email } = await client.register({
        role: 'ADMIN',
        status: 'ACTIVE',
      });
      expect(res.status).toBe(201);
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { email } })).role,
      ).toBe('USER');
    });
  });

  describe('Vérification de l’e-mail et crédits de bienvenue', () => {
    it('vérifie l’adresse et attribue 4 crédits valables 30 jours', async () => {
      const { client, email } = await verified();
      const me = await client.get('/v1/auth/me').expect(200);
      expect(me.body.user).toMatchObject({ emailVerified: true, credits: 4 });

      const row = await prisma.creditLedger.findFirstOrThrow({
        where: { user: { email }, type: 'WELCOME' },
      });
      expect(row.amount).toBe(4);
      const days = (row.expiresAt!.getTime() - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(29);
      expect(days).toBeLessThan(31);
    });

    it('un lien ne sert qu’une fois', async () => {
      const client = new Client(app);
      const { email } = await client.register();
      const token = tokenFromEmail(app, email);
      await client.post('/v1/auth/verify-email', { token }).expect(200);
      const again = await client.post('/v1/auth/verify-email', { token });
      expect(again.status).toBe(400);
      expect(again.body.code).toBe('INVALID_TOKEN');
      expect((await client.get('/v1/auth/me')).body.user.credits).toBe(4);
    });

    it('deux requêtes parallèles avec le même lien : crédits accordés une seule fois', async () => {
      const client = new Client(app);
      const { email } = await client.register();
      const token = tokenFromEmail(app, email);
      const results = await Promise.all([
        client.post('/v1/auth/verify-email', { token }),
        client.post('/v1/auth/verify-email', { token }),
        client.post('/v1/auth/verify-email', { token }),
      ]);
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(
        await prisma.creditLedger.count({
          where: { userId: user.id, type: 'WELCOME' },
        }),
      ).toBe(1);
    });

    it('refuse un lien expiré ou inconnu', async () => {
      const client = new Client(app);
      const { email } = await client.register();
      const token = tokenFromEmail(app, email);
      await prisma.emailToken.updateMany({
        where: { user: { email } },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      expect(
        (await client.post('/v1/auth/verify-email', { token })).status,
      ).toBe(400);
      expect(
        (await client.post('/v1/auth/verify-email', { token: 'x'.repeat(43) }))
          .status,
      ).toBe(400);
      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(user.emailVerifiedAt).toBeNull();
      expect(
        await prisma.creditLedger.count({ where: { userId: user.id } }),
      ).toBe(0);
    });

    it('au-delà de 3 comptes depuis la même IP en 24 h : pas de crédits de bienvenue (RG-09)', async () => {
      const ip = freshIp();
      const credits: number[] = [];
      for (let i = 0; i < 5; i++) {
        const client = new Client(app, ip);
        const { email } = await client.register();
        await client
          .post('/v1/auth/verify-email', { token: tokenFromEmail(app, email) })
          .expect(200);
        credits.push((await client.get('/v1/auth/me')).body.user.credits);
      }
      expect(credits).toEqual([4, 4, 4, 0, 0]);
    });

    it('le renvoi du lien invalide l’ancien et est plafonné', async () => {
      const client = new Client(app);
      const { email } = await client.register();
      const first = tokenFromEmail(app, email);

      await client.post('/v1/auth/resend-verification').expect(200);
      const second = tokenFromEmail(app, email);
      expect(second).not.toBe(first);
      expect(
        (await client.post('/v1/auth/verify-email', { token: first })).status,
      ).toBe(400);

      // 5 e-mails par heure au maximum (inscription comprise).
      for (let i = 0; i < 3; i++)
        await client.post('/v1/auth/resend-verification').expect(200);
      const capped = await client.post('/v1/auth/resend-verification');
      expect(capped.status).toBe(429);
      expect(capped.body.code).toBe('TOO_MANY_EMAILS');
    });

    it('le renvoi exige d’être connecté', async () => {
      const res = await new Client(app).post('/v1/auth/resend-verification');
      expect(res.status).toBe(401);
    });

    it('une action réservée aux e-mails vérifiés est refusée tant que l’adresse ne l’est pas', async () => {
      const client = new Client(app);
      const { email } = await client.register();
      const refused = await client.get('/v1/probe/verified');
      expect(refused.status).toBe(403);
      expect(refused.body.code).toBe('EMAIL_NOT_VERIFIED');
      await client
        .post('/v1/auth/verify-email', { token: tokenFromEmail(app, email) })
        .expect(200);
      await client.get('/v1/probe/verified').expect(200);
    });
  });

  describe('Connexion et sessions', () => {
    it('connecte avec les bons identifiants', async () => {
      const { email } = await verified();
      const client = new Client(app);
      const res = await client.post('/v1/auth/login', {
        email: email.toUpperCase(),
        password: PASSWORD,
      });
      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe(email);
      await client.get('/v1/auth/me').expect(200);
    });

    it('renvoie le même message pour un mauvais mot de passe et un compte inconnu', async () => {
      const { email } = await verified();
      const wrong = await new Client(app).post('/v1/auth/login', {
        email,
        password: 'Mauvais-motdepasse-1',
      });
      const unknown = await new Client(app).post('/v1/auth/login', {
        email: uniqueEmail('inconnu'),
        password: PASSWORD,
      });
      expect(wrong.status).toBe(401);
      expect(unknown.status).toBe(401);
      expect(wrong.body).toEqual(unknown.body);
      expect(wrong.body.code).toBe('INVALID_CREDENTIALS');
    });

    it('refuse un compte suspendu ou banni, et coupe une session déjà ouverte', async () => {
      const { client, email } = await verified();
      await client.get('/v1/auth/me').expect(200);

      await prisma.user.update({
        where: { email },
        data: { status: 'SUSPENDED' },
      });
      expect((await client.get('/v1/auth/me')).body.code).toBe(
        'ACCOUNT_SUSPENDED',
      );
      expect(
        (
          await new Client(app).post('/v1/auth/login', {
            email,
            password: PASSWORD,
          })
        ).body.code,
      ).toBe('ACCOUNT_SUSPENDED');

      await prisma.user.update({
        where: { email },
        data: { status: 'BANNED' },
      });
      expect(
        (
          await new Client(app).post('/v1/auth/login', {
            email,
            password: PASSWORD,
          })
        ).body.code,
      ).toBe('ACCOUNT_BANNED');
    });

    it('exige une session pour /auth/me', async () => {
      expect((await new Client(app).get('/v1/auth/me')).status).toBe(401);
    });

    it('la déconnexion révoque la session côté serveur', async () => {
      const { cookie } = await rawSession(app);
      await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Cookie', cookie)
        .expect(200);
      await request(app.getHttpServer())
        .post('/v1/auth/logout')
        .set('Cookie', cookie)
        .set('Origin', APP_ORIGIN)
        .expect(200);

      // Rejouer l'ancien cookie ne fonctionne plus : la session est révoquée côté serveur.
      const replay = await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Cookie', cookie);
      expect(replay.status).toBe(401);
    });

    it('une session expirée est refusée', async () => {
      const { client, email } = await verified();
      await prisma.session.updateMany({
        where: { user: { email } },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      expect((await client.get('/v1/auth/me')).status).toBe(401);
    });
  });

  describe('Mot de passe oublié', () => {
    it('répond de la même façon que le compte existe ou non, et n’écrit qu’aux comptes réels', async () => {
      const { email } = await verified();
      const unknown = uniqueEmail('fantome');
      const a = await new Client(app).post('/v1/auth/forgot-password', {
        email,
      });
      const b = await new Client(app).post('/v1/auth/forgot-password', {
        email: unknown,
      });
      expect(a.status).toBe(200);
      expect(a.body).toEqual(b.body);
      expect(lastEmailFor(app, email).subject).toContain('Réinitialisation');
      expect(lastEmailFor(app, unknown)).toBeUndefined();
    });

    it('réinitialise le mot de passe, coupe toutes les sessions et ne sert qu’une fois', async () => {
      const { client: oldSession, email } = await verified();
      await new Client(app)
        .post('/v1/auth/forgot-password', { email })
        .expect(200);
      const token = tokenFromEmail(app, email);

      const nouveau = 'Nouveau-motdepasse-77';
      const bad = await new Client(app).post('/v1/auth/reset-password', {
        token,
        password: nouveau,
        confirmPassword: 'autre',
      });
      expect(bad.status).toBe(400);

      await new Client(app)
        .post('/v1/auth/reset-password', {
          token,
          password: nouveau,
          confirmPassword: nouveau,
        })
        .expect(200);
      expect((await oldSession.get('/v1/auth/me')).status).toBe(401);
      expect(
        (
          await new Client(app).post('/v1/auth/login', {
            email,
            password: PASSWORD,
          })
        ).status,
      ).toBe(401);
      expect(
        (
          await new Client(app).post('/v1/auth/login', {
            email,
            password: nouveau,
          })
        ).status,
      ).toBe(200);

      const reuse = await new Client(app).post('/v1/auth/reset-password', {
        token,
        password: 'Encore-un-autre-12',
        confirmPassword: 'Encore-un-autre-12',
      });
      expect(reuse.status).toBe(400);
      expect(reuse.body.code).toBe('INVALID_TOKEN');
    });

    it('refuse un lien expiré', async () => {
      const { email } = await verified();
      await new Client(app)
        .post('/v1/auth/forgot-password', { email })
        .expect(200);
      const token = tokenFromEmail(app, email);
      await prisma.emailToken.updateMany({
        where: { user: { email }, type: 'RESET_PASSWORD' },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const res = await new Client(app).post('/v1/auth/reset-password', {
        token,
        password: 'Nouveau-motdepasse-77',
        confirmPassword: 'Nouveau-motdepasse-77',
      });
      expect(res.status).toBe(400);
    });
  });

  describe('Protection CSRF', () => {
    it('refuse une requête qui modifie des données depuis une origine étrangère', async () => {
      const res = await new Client(app).post(
        '/v1/auth/login',
        { email: uniqueEmail(), password: PASSWORD },
        'https://evil.example',
      );
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('CSRF_REJECTED');
    });

    it('refuse une requête avec cookie de session mais sans origine', async () => {
      const { cookie } = await rawSession(app);
      const res = await request(app.getHttpServer())
        .post('/v1/auth/logout')
        .set('Cookie', cookie);
      expect(res.status).toBe(403);
      const ok = await request(app.getHttpServer())
        .post('/v1/auth/logout')
        .set('Cookie', cookie)
        .set('Origin', APP_ORIGIN);
      expect(ok.status).toBe(200);
    });

    it('laisse passer les lectures quelle que soit l’origine', async () => {
      const res = await request(app.getHttpServer())
        .get('/health')
        .set('Origin', 'https://evil.example');
      expect(res.status).toBe(200);
    });
  });

  describe('Rôles et profil', () => {
    it('refuse /admin à un utilisateur normal et à un visiteur', async () => {
      const { client } = await verified();
      const user = await client.get('/v1/admin/ping');
      expect(user.status).toBe(403);
      expect(user.body.code).toBe('FORBIDDEN');
      expect((await new Client(app).get('/v1/admin/ping')).status).toBe(401);
    });

    it('autorise /admin au premier administrateur créé par le seed', async () => {
      const admin = new Client(app);
      await admin
        .post('/v1/auth/login', {
          email: 'admin@yamboka.test',
          password: 'Admin-Test-Password-2026!',
        })
        .expect(200);
      expect((await admin.get('/v1/admin/ping')).body).toEqual({ ok: true });
    });

    it('PATCH /me modifie le profil mais refuse tout champ sensible', async () => {
      const { client, email } = await verified();
      for (const forbidden of [
        { role: 'ADMIN' },
        { status: 'ACTIVE' },
        { email: 'autre@example.com' },
        { passwordHash: 'x' },
      ]) {
        const res = await client.patch('/v1/me', forbidden);
        expect(res.status).toBe(400);
      }
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { email } })).role,
      ).toBe('USER');

      const ok = await client.patch('/v1/me', {
        firstName: 'Marie',
        phone: '242061234567',
      });
      expect(ok.status).toBe(200);
      expect(ok.body.user).toMatchObject({
        firstName: 'Marie',
        phone: '242061234567',
      });
    });

    it('changer de mot de passe déconnecte les autres appareils mais garde la session courante', async () => {
      const { client, email } = await verified();
      const other = new Client(app);
      await other
        .post('/v1/auth/login', { email, password: PASSWORD })
        .expect(200);

      const wrong = await client.post('/v1/me/password', {
        currentPassword: 'faux',
        newPassword: 'Nouveau-motdepasse-77',
        confirmPassword: 'Nouveau-motdepasse-77',
      });
      expect(wrong.status).toBe(401);

      await client
        .post('/v1/me/password', {
          currentPassword: PASSWORD,
          newPassword: 'Nouveau-motdepasse-77',
          confirmPassword: 'Nouveau-motdepasse-77',
        })
        .expect(200);
      expect((await client.get('/v1/auth/me')).status).toBe(200);
      expect((await other.get('/v1/auth/me')).status).toBe(401);
    });

    it('supprime le compte : données effacées, sessions coupées, registre conservé', async () => {
      const { client, email } = await verified();
      const user = await prisma.user.findUniqueOrThrow({ where: { email } });

      expect((await client.delete('/v1/me', { password: 'faux' })).status).toBe(
        401,
      );
      await client.delete('/v1/me', { password: PASSWORD }).expect(200);

      expect((await client.get('/v1/auth/me')).status).toBe(401);
      expect(
        (
          await new Client(app).post('/v1/auth/login', {
            email,
            password: PASSWORD,
          })
        ).status,
      ).toBe(401);
      const after = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      expect(after.email).toContain('@yamboka.invalid');
      expect(after.deletedAt).not.toBeNull();
      expect(after.passwordHash).toBeNull();
      expect(
        await prisma.creditLedger.count({ where: { userId: user.id } }),
      ).toBe(1);
    });
  });
});
