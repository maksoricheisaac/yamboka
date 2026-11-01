import './isolate-admin-db';
import { INestApplication } from '@nestjs/common';
import { csvCell } from '../src/admin/admin-ops.service';
import { Client, PASSWORD, createApp, otpFromEmail, prismaOf } from './helpers';
import { resetDatabase } from './reset-database';
import { TEST_ENV } from './test-env';

describe('Administration (e2e)', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof prismaOf>;
  let admin: Client;

  async function customer() {
    const client = new Client(app);
    const { email } = await client.register();
    await client
      .post('/v1/auth/verify-email', { code: otpFromEmail(app, email) })
      .expect(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    return { client, email, id: user.id };
  }

  beforeAll(async () => {
    await resetDatabase(process.env.DATABASE_URL!);
    app = await createApp();
    prisma = prismaOf(app);
    admin = new Client(app);
    await admin
      .post('/v1/auth/login', {
        email: TEST_ENV.ADMIN_EMAIL,
        password: TEST_ENV.ADMIN_PASSWORD,
      })
      .expect(200);
  }, 120_000);
  afterAll(async () => {
    await app.close();
  });

  describe('Contrôle d’accès côté serveur', () => {
    const GETS = [
      '/v1/admin/ping',
      '/v1/admin/stats',
      '/v1/admin/users',
      '/v1/admin/packs',
      '/v1/admin/products',
      '/v1/admin/presets',
      '/v1/admin/payments',
      '/v1/admin/generations',
      '/v1/admin/reports',
      '/v1/admin/finance/summary',
      '/v1/admin/finance/export.csv',
      '/v1/admin/settings',
      '/v1/admin/legal',
      '/v1/admin/admins',
      '/v1/admin/audit',
    ];

    it('un visiteur non connecté reçoit 401 sur toutes les routes', async () => {
      const anon = new Client(app);
      for (const url of GETS)
        expect([url, (await anon.get(url)).status]).toEqual([url, 401]);
    });

    it('un client reçoit 403 sur toutes les routes, lecture comme écriture', async () => {
      const { client, id } = await customer();
      for (const url of GETS)
        expect([url, (await client.get(url)).status]).toEqual([url, 403]);
      const writes = [
        client.post(`/v1/admin/users/${id}/credits`, {
          amount: 100,
          reason: 'je me sers',
        }),
        client.post(`/v1/admin/users/${id}/status`, {
          action: 'BAN',
          reason: 'test sans droit',
        }),
        client.post('/v1/admin/admins', {
          email: 'x@example.com',
          reason: 'je me nomme admin',
        }),
        client.patch('/v1/admin/settings', {
          values: { maintenanceMode: true },
          reason: 'sans droit',
        }),
        client.patch(
          '/v1/admin/presets/00000000-0000-4000-8000-000000000000/featured',
          { featured: true, reason: 'sans droit' },
        ),
      ];
      for (const res of await Promise.all(writes)) expect(res.status).toBe(403);
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id } })).role,
      ).toBe('USER');
    });

    it('un administrateur accède aux routes', async () => {
      for (const url of GETS)
        expect([url, (await admin.get(url)).status]).toEqual([url, 200]);
    });
  });

  describe('Tableau de bord', () => {
    it('renvoie des indicateurs réels, ou des zéros explicites', async () => {
      const { client } = await customer();
      await client.get('/v1/auth/me').expect(200);
      const { body } = await admin.get('/v1/admin/stats').expect(200);
      expect(body.users.total).toBeGreaterThanOrEqual(2);
      expect(body.users.newInPeriod).toBeGreaterThanOrEqual(1);
      expect(body.generations).toEqual({
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
      });
      // Aucune recharge saisie : le solde fournisseur n'est pas calculable et ne doit pas être inventé.
      expect(body.providerBalance.known).toBe(false);
      expect(Array.isArray(body.alerts)).toBe(true);
    });
  });

  describe('Clients', () => {
    it('recherche et filtres', async () => {
      const { email } = await customer();
      const found = await admin
        .get(`/v1/admin/users?q=${encodeURIComponent(email)}`)
        .expect(200);
      expect(found.body.total).toBe(1);
      expect(found.body.items[0].email).toBe(email);
      const admins = await admin.get('/v1/admin/users?role=ADMIN').expect(200);
      expect(
        admins.body.items.every((u: { role: string }) => u.role === 'ADMIN'),
      ).toBe(true);
    });

    it('fiche détaillée : solde, historiques', async () => {
      const { id } = await customer();
      const { body } = await admin.get(`/v1/admin/users/${id}`).expect(200);
      expect(body.credits).toBe(0); // aucun crédit offert à l'inscription
      expect(body.ledger).toEqual([]);
      expect(
        (
          await admin.get(
            '/v1/admin/users/00000000-0000-4000-8000-000000000000',
          )
        ).status,
      ).toBe(404);
      expect((await admin.get('/v1/admin/users/pas-un-uuid')).status).toBe(400);
    });

    it('suspension : motif obligatoire, sessions coupées, trace d’audit et de modération', async () => {
      const { client, id } = await customer();
      const noReason = await admin.post(`/v1/admin/users/${id}/status`, {
        action: 'SUSPEND',
      });
      expect(noReason.status).toBe(400);
      const short = await admin.post(`/v1/admin/users/${id}/status`, {
        action: 'SUSPEND',
        reason: 'ok',
      });
      expect(short.status).toBe(400);

      await admin
        .post(`/v1/admin/users/${id}/status`, {
          action: 'SUSPEND',
          reason: 'Signalement répété de contenu abusif',
        })
        .expect(200);
      // Sessions révoquées côté serveur : la session n'est plus reconnue.
      expect((await client.get('/v1/auth/me')).status).toBe(401);

      const log = await prisma.auditLog.findFirstOrThrow({
        where: { action: 'user.suspend', entityId: id },
      });
      expect(log.reason).toContain('Signalement');
      expect(log.before).toEqual({ status: 'ACTIVE' });
      expect(log.after).toEqual({ status: 'SUSPENDED' });
      expect(log.actorId).not.toBeNull();
      expect(
        await prisma.moderationAction.count({
          where: { targetUserId: id, action: 'SUSPEND' },
        }),
      ).toBe(1);

      // Même état redemandé : refusé. Réactivation : possible, et le client se reconnecte.
      const again = await admin.post(`/v1/admin/users/${id}/status`, {
        action: 'SUSPEND',
        reason: 'Encore une fois',
      });
      expect(again.status).toBe(409);
      await admin
        .post(`/v1/admin/users/${id}/status`, {
          action: 'REACTIVATE',
          reason: 'Erreur de modération corrigée',
        })
        .expect(200);
      const user = await prisma.user.findUniqueOrThrow({ where: { id } });
      const relog = await new Client(app).post('/v1/auth/login', {
        email: user.email,
        password: PASSWORD,
      });
      expect(relog.status).toBe(200);
    });

    it('un administrateur ne peut ni se suspendre ni suspendre un autre administrateur', async () => {
      const me = await prisma.user.findUniqueOrThrow({
        where: { email: TEST_ENV.ADMIN_EMAIL },
      });
      const self = await admin.post(`/v1/admin/users/${me.id}/status`, {
        action: 'BAN',
        reason: 'Test auto-bannissement',
      });
      expect(self.status).toBe(400);
      expect(self.body.code).toBe('SELF_ACTION');

      const { id, email } = await customer();
      await admin
        .post('/v1/admin/admins', {
          email,
          reason: 'Nouveau responsable support',
        })
        .expect(200);
      const other = await admin.post(`/v1/admin/users/${id}/status`, {
        action: 'BAN',
        reason: 'Test protection admin',
      });
      expect(other.status).toBe(400);
      expect(other.body.code).toBe('ADMIN_PROTECTED');
    });

    it('ajustement de crédits : motif obligatoire, jamais de solde négatif, audit atomique', async () => {
      const { client, id } = await customer();
      expect(
        (await admin.post(`/v1/admin/users/${id}/credits`, { amount: 10 }))
          .status,
      ).toBe(400);
      expect(
        (
          await admin.post(`/v1/admin/users/${id}/credits`, {
            amount: 0,
            reason: 'montant nul',
          })
        ).status,
      ).toBe(400);

      const up = await admin
        .post(`/v1/admin/users/${id}/credits`, {
          amount: 20,
          reason: 'Geste commercial après incident',
        })
        .expect(200);
      expect(up.body.balance).toBe(20);
      expect((await client.get('/v1/auth/me')).body.user.credits).toBe(20);

      const tooMuch = await admin.post(`/v1/admin/users/${id}/credits`, {
        amount: -100,
        reason: 'Correction excessive',
      });
      expect(tooMuch.status).toBe(402);

      const row = await prisma.creditLedger.findFirstOrThrow({
        where: { userId: id, type: 'ADMIN_ADJUST' },
      });
      expect(row.note).toContain('Geste commercial');
      expect(row.createdById).not.toBeNull();
      const log = await prisma.auditLog.findFirstOrThrow({
        where: { action: 'credits.adjust', entityId: id },
      });
      expect(log.after).toMatchObject({ balance: 20 });
    });
  });

  describe('Tendances : mise à la une', () => {
    it('décision éditoriale de l’administrateur, distincte de la publication, vérifiée côté serveur', async () => {
      const preset = await prisma.preset.findFirstOrThrow({
        where: { name: 'Danse afro' },
      });
      const { client } = await customer();
      const stylesOf = async () =>
        (await client.get('/v1/creations/styles').expect(200)).body
          .styles as { id: string; featured: boolean }[];
      const url = `/v1/admin/presets/${preset.id}/featured`;

      // Un client ne peut pas le faire, et le serveur refuse de mettre à la une un preset non publié.
      await client.patch(url, { featured: true, reason: 'sans droit' }).expect(403);
      const refused = await admin
        .patch(url, { featured: true, reason: 'Essai non publié' })
        .expect(400);
      expect(refused.body.code).toBe('PRESET_NOT_PUBLISHED');
      await admin.patch(url, { featured: true }).expect(400); // motif obligatoire

      // Publié mais pas à la une : visible dans le catalogue, sans mise en avant.
      await admin
        .patch(`/v1/admin/presets/${preset.id}`, { visible: true, reason: 'Publication de test' })
        .expect(200);
      expect((await stylesOf()).find((s) => s.id === preset.id)?.featured).toBe(false);

      await admin.patch(url, { featured: true, reason: 'Mise en avant de test' }).expect(200);
      expect((await stylesOf()).find((s) => s.id === preset.id)?.featured).toBe(true);
      const listed = (await admin.get('/v1/admin/presets').expect(200)).body as {
        id: string;
        featured: boolean;
      }[];
      expect(listed.find((p) => p.id === preset.id)?.featured).toBe(true);

      // Retirée de la une : toujours publiée.
      await admin.patch(url, { featured: false, reason: 'Retrait de test' }).expect(200);
      const after = (await stylesOf()).find((s) => s.id === preset.id);
      expect(after).toMatchObject({ featured: false });
      const audit = await prisma.auditLog.findMany({
        where: { entityId: preset.id, action: { in: ['preset.feature', 'preset.unfeature'] } },
      });
      expect(audit.map((a) => a.action).sort()).toEqual(['preset.feature', 'preset.unfeature']);
    });
  });

  describe('Offre : packs et publication', () => {
    const publicNames = async () =>
      (
        (await new Client(app).get('/v1/catalog/packs/public').expect(200)).body
          .packs as { name: string }[]
      ).map((p) => p.name);

    it('le catalogue public contient trois offres maximum, dont une seule recommandée', async () => {
      const { body } = await new Client(app)
        .get('/v1/catalog/packs/public')
        .expect(200);
      expect(body.packs).toHaveLength(3);
      expect(
        body.packs.filter((p: { featured: boolean }) => p.featured),
      ).toHaveLength(1);
      const all = await new Client(app).get('/v1/catalog/packs').expect(200);
      expect(all.body.packs.map((p: { name: string }) => p.name)).toEqual([
        'Starter',
        'Pro',
        'Business',
      ]);
    });

    it('refuse une quatrième offre publique', async () => {
      // Les trois packs de lancement sont déjà publics : un quatrième pack (créé inactif) ne peut pas l'être aussi.
      const created = await admin
        .post('/v1/admin/packs', {
          name: 'Quatrième',
          price: 7000,
          credits: 1700,
          bonusPercent: 0,
          reason: 'Pack de test',
        })
        .expect(201);
      const res = await admin.patch(`/v1/admin/packs/${created.body.id}`, {
        active: true,
        publicVisible: true,
        reason: 'Essai de quatrième offre',
      });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('TOO_MANY_PUBLIC');
      expect(await publicNames()).toHaveLength(3);
    });

    it('refuse une modification qui rend un pack non rentable, et ne change rien', async () => {
      const packs = (await admin.get('/v1/admin/packs').expect(200)).body as {
        id: string;
        name: string;
        priceFcfa: number;
      }[];
      const pro = packs.find((p) => p.name === 'Pro')!;
      const res = await admin.patch(`/v1/admin/packs/${pro.id}`, {
        price: 3000,
        reason: 'Promotion trop agressive',
      });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('MARGIN_TOO_LOW');
      const after = (await admin.get('/v1/admin/packs').expect(200)).body as {
        name: string;
        priceFcfa: number;
      }[];
      expect(after.find((p) => p.name === 'Pro')!.priceFcfa).toBe(
        pro.priceFcfa,
      );
    });

    it('désactiver un pack le retire du catalogue public ; recommander en remplace une autre', async () => {
      const packs = (await admin.get('/v1/admin/packs').expect(200)).body as {
        id: string;
        name: string;
      }[];
      const starter = packs.find((p) => p.name === 'Starter')!;
      const pro = packs.find((p) => p.name === 'Pro')!;
      const business = packs.find((p) => p.name === 'Business')!;

      await admin
        .patch(`/v1/admin/packs/${starter.id}`, {
          active: false,
          reason: 'Pause de l’offre d’entrée',
        })
        .expect(200);
      expect(await publicNames()).not.toContain('Starter');
      expect(await publicNames()).toHaveLength(2);

      // Un pack inactif ne peut pas être republié sans être réactivé.
      await admin
        .patch(`/v1/admin/packs/${starter.id}`, {
          active: true,
          publicVisible: true,
          reason: 'Retour de l’offre d’entrée',
        })
        .expect(200);
      expect(await publicNames()).toEqual(
        expect.arrayContaining(['Starter', 'Pro', 'Business']),
      );

      await admin
        .patch(`/v1/admin/packs/${business.id}`, {
          featured: true,
          reason: 'Business devient la recommandation',
        })
        .expect(200);
      const { body } = await new Client(app)
        .get('/v1/catalog/packs/public')
        .expect(200);
      expect(
        body.packs
          .filter((p: { featured: boolean }) => p.featured)
          .map((p: { name: string }) => p.name),
      ).toEqual(['Business']);

      // Retour à la recommandation de lancement.
      await admin
        .patch(`/v1/admin/packs/${pro.id}`, {
          featured: true,
          reason: 'Pro redevient la recommandation',
        })
        .expect(200);

      const log = await prisma.auditLog.findFirstOrThrow({
        where: { action: 'pack.update', entityId: starter.id },
      });
      expect(log.before).toMatchObject({ active: true, publicVisible: true });
      expect(log.after).toMatchObject({ active: false, publicVisible: false });
    });

    it('la modification exige un motif ; un champ inconnu est refusé', async () => {
      const packs = (await admin.get('/v1/admin/packs').expect(200)).body as {
        id: string;
      }[];
      expect(
        (
          await admin.patch(`/v1/admin/packs/${packs[0].id}`, {
            bonusPercent: 1,
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await admin.patch(`/v1/admin/packs/${packs[0].id}`, {
            id: 'x',
            reason: 'champ interdit',
          })
        ).status,
      ).toBe(400);
    });

    it('un nouveau pack naît inactif et non public', async () => {
      const created = await admin
        .post('/v1/admin/packs', {
          name: 'Test',
          price: 2000,
          credits: 80,
          bonusPercent: 0,
          reason: 'Pack de test',
        })
        .expect(201);
      expect(created.body.active).toBe(false);
      expect(created.body.publicVisible).toBe(false);
      expect(await publicNames()).not.toContain('Test');
    });
  });

  describe('Finances', () => {
    it('recharge Higgsfield : le solde estimé devient calculable', async () => {
      await admin
        .post('/v1/admin/finance/topups', {
          amountUsd: 100,
          amountXaf: 60000,
          note: 'Première recharge',
        })
        .expect(201);
      const { body } = await admin.get('/v1/admin/stats').expect(200);
      expect(body.providerBalance.known).toBe(true);
      expect(body.providerBalance.estimatedBalanceUsd).toBe(100);
      expect((await admin.get('/v1/admin/finance/topups')).body[0].fxRate).toBe(
        600,
      );
    });

    it('retrait OpenPay et synthèse', async () => {
      await admin
        .post('/v1/admin/finance/payouts', {
          amountXaf: 50000,
          commissionXaf: 2500,
          date: '2026-10-01',
        })
        .expect(201);
      const { body } = await admin
        .get('/v1/admin/finance/summary?from=2026-10-01&to=2026-10-31')
        .expect(200);
      expect(body.payoutsXaf).toBe(50000);
      expect(body.payoutCommissionXaf).toBe(2500);
      expect(
        (
          await admin.post('/v1/admin/finance/payouts', {
            amountXaf: -1,
            commissionXaf: 0,
            date: '2026-10-01',
          })
        ).status,
      ).toBe(400);
    });

    it('export CSV : en-têtes, et neutralisation des formules de tableur', async () => {
      const csv = await admin.get('/v1/admin/finance/export.csv').expect(200);
      expect(csv.headers['content-type']).toContain('text/csv');
      expect(csv.headers['content-disposition']).toContain('attachment');
      expect(csv.text).toContain('montant_fcfa');
      expect(csvCell('=HYPERLINK("http://evil")')).toBe(
        '"\'=HYPERLINK(""http://evil"")"',
      );
      expect(csvCell('+33 6')).toBe('"\'+33 6"');
      expect(csvCell('Jean')).toBe('"Jean"');
    });
  });

  describe('Configuration', () => {
    it('modifie des paramètres validés, avec motif et audit avant/après', async () => {
      const res = await admin
        .patch('/v1/admin/settings', {
          values: { maintenanceMode: true, minMarginPercent: 18 },
          reason: 'Maintenance planifiée',
        })
        .expect(200);
      expect(res.body.values.maintenanceMode).toBe(true);
      const status = await new Client(app)
        .get('/v1/catalog/status')
        .expect(200);
      expect(status.body.maintenance.enabled).toBe(true);

      const log = await prisma.auditLog.findFirstOrThrow({
        where: { action: 'settings.update' },
        orderBy: { createdAt: 'desc' },
      });
      expect(log.before).toMatchObject({
        maintenanceMode: false,
        minMarginPercent: 15,
      });
      expect(log.after).toMatchObject({
        maintenanceMode: true,
        minMarginPercent: 18,
      });

      await admin
        .patch('/v1/admin/settings', {
          values: { maintenanceMode: false, minMarginPercent: 15 },
          reason: 'Fin de maintenance',
        })
        .expect(200);
    });

    it('refuse un paramètre inconnu, un mauvais type, un pourcentage > 100 ou un mode invalide', async () => {
      for (const values of [
        { secretKey: 'x' },
        { maintenanceMode: 'oui' },
        { minMarginPercent: 150 },
        { loginOtpMode: 'toujours' },
        { welcomeCredits: 4 }, // réglage supprimé : plus de crédits de bienvenue
      ]) {
        const res = await admin.patch('/v1/admin/settings', {
          values,
          reason: 'Test de validation',
        });
        expect([JSON.stringify(values), res.status]).toEqual([
          JSON.stringify(values),
          400,
        ]);
      }
    });

    it('test e-mail : mode console signalé honnêtement, jamais « envoyé »', async () => {
      const res = await admin.post('/v1/admin/email/test').expect(200);
      expect(res.body.ok).toBe(false);
      expect(res.body.provider).toBe('console');
    });

    it('publier un texte légal crée une nouvelle version et conserve l’ancienne', async () => {
      const before = await prisma.legalDocument.count({
        where: { type: 'CGU' },
      });
      await admin
        .post('/v1/admin/legal', {
          type: 'CGU',
          content: 'Nouvelles conditions générales : '.padEnd(80, 'x'),
          major: false,
          reason: 'Mise à jour mineure',
        })
        .expect(201);
      expect(await prisma.legalDocument.count({ where: { type: 'CGU' } })).toBe(
        before + 1,
      );
    });
  });

  describe('Comptes administrateurs', () => {
    it('promotion : seulement un compte existant et vérifié ; rétrogradation sans dernier admin', async () => {
      const unknown = await admin.post('/v1/admin/admins', {
        email: 'inconnu@example.com',
        reason: 'Nouveau responsable',
      });
      expect(unknown.status).toBe(404);

      const fresh = new Client(app);
      const { email } = await fresh.register();
      const unverified = await admin.post('/v1/admin/admins', {
        email,
        reason: 'Compte non vérifié',
      });
      expect(unverified.status).toBe(400);
      expect(unverified.body.code).toBe('NOT_ELIGIBLE');

      const list = (await admin.get('/v1/admin/admins').expect(200)).body as {
        id: string;
        email: string;
      }[];
      const me = list.find((a) => a.email === TEST_ENV.ADMIN_EMAIL)!;
      const self = await admin.post(`/v1/admin/admins/${me.id}/demote`, {
        reason: 'Test retrait de soi',
      });
      expect(self.status).toBe(400);

      const other = list.find((a) => a.email !== TEST_ENV.ADMIN_EMAIL);
      if (other)
        await admin
          .post(`/v1/admin/admins/${other.id}/demote`, {
            reason: 'Fin de mission',
          })
          .expect(200);
      expect(
        await prisma.auditLog.count({ where: { action: 'admin.promote' } }),
      ).toBeGreaterThanOrEqual(1);
    });

    it('le dernier administrateur ne peut pas être rétrogradé', async () => {
      const { client, email, id } = await customer();
      await admin
        .post('/v1/admin/admins', { email, reason: 'Second administrateur' })
        .expect(200);
      // Le second administrateur tente de retirer le premier : possible tant qu'il en reste un autre (lui).
      // Mais personne ne peut retirer le dernier : on vérifie via l'état de la base après rétrogradation croisée.
      const first = await prisma.user.findUniqueOrThrow({
        where: { email: TEST_ENV.ADMIN_EMAIL },
      });
      await client.post('/v1/auth/login', { email, password: PASSWORD });
      await client
        .post(`/v1/admin/admins/${first.id}/demote`, {
          reason: 'Passation de pouvoir',
        })
        .expect(200);
      expect(
        await prisma.user.count({ where: { role: 'ADMIN' } }),
      ).toBeGreaterThanOrEqual(1);
      const last = await client.post(`/v1/admin/admins/${id}/demote`, {
        reason: 'Retrait de soi',
      });
      expect(last.status).toBe(400);
      // Rétablit l'administrateur de test pour les autres cas.
      await prisma.user.update({
        where: { id: first.id },
        data: { role: 'ADMIN' },
      });
    });
  });

  describe('Journal d’audit', () => {
    it('liste les actions avec acteur, entité, avant/après et motif', async () => {
      const { body } = await admin
        .get('/v1/admin/audit?pageSize=5')
        .expect(200);
      expect(body.total).toBeGreaterThan(5);
      const row = body.items[0];
      expect(row).toEqual(
        expect.objectContaining({
          action: expect.any(String),
          entityType: expect.any(String),
          createdAt: expect.any(String),
        }),
      );
      const filtered = await admin
        .get('/v1/admin/audit?q=pack.update')
        .expect(200);
      expect(
        filtered.body.items.every((r: { action: string }) =>
          r.action.includes('pack.update'),
        ),
      ).toBe(true);
    });
  });
});
