import './isolate-reconciliation-db';
import { INestApplication } from '@nestjs/common';
import { NotificationsService } from '../src/notifications/notifications.service';
import { PaymentsService } from '../src/payments/payments.service';
import { Client, PASSWORD, createApp, otpFromEmail, prismaOf } from './helpers';
import { resetDatabase } from './reset-database';
import { TEST_ENV } from './test-env';

const PHONE = '242061234567';

/**
 * Réconciliation des paiements et régularisation manuelle.
 *
 * Le scénario central : le fournisseur confirme le paiement, mais sa notification n'arrive jamais. Les crédits
 * doivent pouvoir être attribués — par la réconciliation automatique ou par un administrateur — sans jamais
 * l'être deux fois, même si la notification finit par arriver ou si deux administrateurs agissent en même temps.
 */
describe('Réconciliation des paiements et attribution manuelle (e2e)', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof prismaOf>;
  let payments: PaymentsService;
  let admin: Client;

  beforeAll(async () => {
    await resetDatabase(process.env.DATABASE_URL!);
    app = await createApp();
    prisma = prismaOf(app);
    payments = app.get(PaymentsService);
    admin = new Client(app);
    await admin
      .post('/api/auth/login', {
        email: TEST_ENV.ADMIN_EMAIL,
        password: TEST_ENV.ADMIN_PASSWORD,
      })
      .expect(200);
  }, 180_000);

  afterAll(async () => {
    await app.close();
  });

  // ───────────── Outils du scénario ─────────────

  /** Compte inscrit et vérifié, avec un solde de départ nul. */
  async function customer() {
    const client = new Client(app);
    const { email } = await client.register();
    await client
      .post('/api/auth/verify-email', { code: otpFromEmail(app, email) })
      .expect(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    return { client, email, id: user.id };
  }

  const packId = async (name = 'Starter') =>
    (await prisma.creditPack.findFirstOrThrow({ where: { name } })).id;

  /** Crée un paiement (statut PENDING, référence chez le fournisseur simulé connue). */
  async function buy(client: Client, pack = 'Starter') {
    const res = await client
      .post('/api/payments', {
        packId: await packId(pack),
        operator: 'MTN',
        phone: PHONE,
      })
      .expect(201);
    const id = res.body.payment.id as string;
    const row = await prisma.payment.findUniqueOrThrow({ where: { id } });
    return { id, reference: row.externalReference!, credits: row.credits };
  }

  /**
   * Le client confirme sur son téléphone, le fournisseur enregistre le succès — mais AUCUNE notification n'est
   * envoyée à Yamboka. C'est exactement la panne que l'on doit savoir rattraper.
   */
  const confirmWithoutWebhook = (reference: string) =>
    prisma.mockPaymentTransaction.update({
      where: { reference },
      data: { status: 'success' },
    });

  const balanceOf = async (userId: string) =>
    (
      await prisma.creditLedger.aggregate({
        where: { userId },
        _sum: { amount: true },
      })
    )._sum.amount ?? 0;

  /** Crédits réellement dus : ceux du pack plus, pour un premier achat, le bonus accordé à la confirmation. */
  const totalCreditsOf = async (id: string) => {
    const p = await prisma.payment.findUniqueOrThrow({ where: { id } });
    return p.credits + p.bonusCredits;
  };

  const purchaseRows = (reference: string) =>
    prisma.creditLedger.findMany({ where: { reference: `pay:${reference}` } });

  const settle = (id: string, body: Record<string, unknown> = {}) =>
    admin.post(`/api/admin/payments/${id}/settle`, {
      mode: 'PROVIDER',
      reason: 'Notification du fournisseur jamais reçue',
      ...body,
    });

  // ───────────── 1. Le chemin normal ─────────────

  it('1. paiement réussi avec notification reçue : attribution automatique', async () => {
    const { client, id: userId } = await customer();
    const { id, reference } = await buy(client);

    await client
      .post(`/api/payments/${id}/simulate`, {
        outcome: 'success',
        callbacks: 1,
      })
      .expect(200);

    const p = await prisma.payment.findUniqueOrThrow({ where: { id } });
    expect(p.status).toBe('SUCCESS');
    expect(p.creditedAt).not.toBeNull();
    expect(p.creditOrigin).toBe('AUTO');
    expect(p.creditedById).toBeNull();
    expect(await purchaseRows(reference)).toHaveLength(1);
    expect(await balanceOf(userId)).toBe(await totalCreditsOf(id));
  });

  // ───────────── 2 et 3. La notification n'arrive jamais ─────────────

  it('2. paiement réussi sans notification : détecté et crédité par la réconciliation', async () => {
    const { client, id: userId } = await customer();
    const { id, reference, credits } = await buy(client);
    await confirmWithoutWebhook(reference);

    // Tant que rien ne tourne, le paiement reste en attente et le client n'a rien.
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id } })).status,
    ).toBe('PENDING');
    expect(await balanceOf(userId)).toBe(0);

    await payments.reconcile();

    const p = await prisma.payment.findUniqueOrThrow({ where: { id } });
    expect(p.status).toBe('SUCCESS');
    expect(p.creditOrigin).toBe('AUTO');
    expect(await balanceOf(userId)).toBe(credits + p.bonusCredits);
    // Chaque interrogation du fournisseur est tracée.
    const checks = await prisma.paymentCheck.findMany({
      where: { paymentId: id },
    });
    expect(checks.some((c) => c.source === 'reconcile')).toBe(true);
  });

  it('3. paiement réussi sans notification : régularisation manuelle par un administrateur', async () => {
    const { client, id: userId } = await customer();
    const { id, reference, credits } = await buy(client);
    await confirmWithoutWebhook(reference);

    const res = await settle(id);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ credited: true, verifiedBy: 'provider' });
    expect(res.body.credits).toBe(credits);

    const p = await prisma.payment.findUniqueOrThrow({ where: { id } });
    expect(p.status).toBe('SUCCESS');
    expect(p.creditOrigin).toBe('MANUAL');
    expect(p.creditedById).not.toBeNull();
    const total = credits + p.bonusCredits;
    expect(await balanceOf(userId)).toBe(total);

    // Le registre reste en ajout seul : un seul mouvement PURCHASE, référence déterministe.
    const rows = await purchaseRows(reference);
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('PURCHASE');
    expect(rows[0].paymentId).toBe(id);

    // Journal d'audit : administrateur, bénéficiaire, crédits, référence, solde avant et après.
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'payment.settle', entityId: id },
    });
    expect(audit.actorId).not.toBeNull();
    expect(audit.reason).toBe('Notification du fournisseur jamais reçue');
    expect(audit.before).toMatchObject({ balance: 0, credited: false });
    expect(audit.after).toMatchObject({
      balance: total,
      credited: true,
      creditOrigin: 'MANUAL',
      userId,
      paymentReference: reference,
      ledgerReference: `pay:${reference}`,
    });

    // Le client est prévenu, une seule fois, et le message cite la référence du paiement.
    const notes = await prisma.notification.findMany({
      where: { userId, type: 'PAYMENT_SUCCESS' },
    });
    expect(notes).toHaveLength(1);
    expect(notes[0].body).toContain(reference);
  });

  // ───────────── 4, 5 et 11. Jamais deux fois ─────────────

  it('4. notification reçue APRÈS une régularisation manuelle : aucune seconde attribution', async () => {
    const { client, id: userId } = await customer();
    const { id, reference } = await buy(client);
    await confirmWithoutWebhook(reference);
    await settle(id).expect(200);

    // Le fournisseur finit par notifier (plusieurs fois, comme il le fait réellement).
    await payments.handleProviderEvent({
      gateway: 'mock',
      event: 'payment.success',
      providerTxId: reference,
      summary: { status: 'success' },
    });
    await payments.handleCallback(reference);
    await payments.verify(id);
    await payments.reconcile();

    expect(await purchaseRows(reference)).toHaveLength(1);
    expect(await balanceOf(userId)).toBe(await totalCreditsOf(id));
    const p = await prisma.payment.findUniqueOrThrow({ where: { id } });
    expect(p.creditOrigin).toBe('MANUAL');
  });

  it('5. deux administrateurs régularisent en même temps : une seule attribution', async () => {
    const { client, id: userId } = await customer();
    const { id, reference } = await buy(client);
    await confirmWithoutWebhook(reference);

    const second = new Client(app);
    await second
      .post('/api/auth/login', {
        email: TEST_ENV.ADMIN_EMAIL,
        password: TEST_ENV.ADMIN_PASSWORD,
      })
      .expect(200);

    const bodies = {
      mode: 'PROVIDER',
      reason: 'Régularisation simultanée (test de concurrence)',
    };
    const [a, b] = await Promise.all([
      admin.post(`/api/admin/payments/${id}/settle`, bodies),
      second.post(`/api/admin/payments/${id}/settle`, bodies),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);
    expect([a, b].find((r) => r.status === 409)!.body.code).toBe(
      'ALREADY_CREDITED',
    );
    expect(await purchaseRows(reference)).toHaveLength(1);
    expect(await balanceOf(userId)).toBe(await totalCreditsOf(id));
  });

  it('11. rejeu de la même requête de régularisation : aucune double attribution', async () => {
    const { client, id: userId } = await customer();
    const { id, reference } = await buy(client);
    await confirmWithoutWebhook(reference);

    await settle(id).expect(200);
    const replay = await settle(id);
    expect(replay.status).toBe(409);
    expect(replay.body.code).toBe('ALREADY_CREDITED');

    expect(await purchaseRows(reference)).toHaveLength(1);
    expect(await balanceOf(userId)).toBe(await totalCreditsOf(id));
  });

  // ───────────── 6, 7 et 8. Ce qu'on refuse de créditer ─────────────

  it('6. paiement échoué : aucune attribution, régularisation refusée', async () => {
    const { client, id: userId } = await customer();
    const { id, reference } = await buy(client);
    await client
      .post(`/api/payments/${id}/simulate`, { outcome: 'failed', callbacks: 1 })
      .expect(200);

    const res = await settle(id);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('NOT_CONFIRMED');
    expect(await purchaseRows(reference)).toHaveLength(0);
    expect(await balanceOf(userId)).toBe(0);
  });

  it('7. montant payé différent du montant attendu : régularisation refusée', async () => {
    const { client, id: userId } = await customer();
    const { id, reference } = await buy(client);
    // Le fournisseur annonce un succès… d'un montant qui n'est pas celui demandé.
    await prisma.mockPaymentTransaction.update({
      where: { reference },
      data: { status: 'success', amount: 1 },
    });

    const res = await settle(id);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('AMOUNT_MISMATCH');
    expect(await purchaseRows(reference)).toHaveLength(0);
    expect(await balanceOf(userId)).toBe(0);

    // La réconciliation automatique ne crédite pas davantage : elle marque l'anomalie.
    await payments.reconcile();
    expect(await purchaseRows(reference)).toHaveLength(0);
    const p = await prisma.payment.findUniqueOrThrow({ where: { id } });
    expect(p.status).toBe('FAILED');
    expect(p.creditedAt).toBeNull();
  });

  it('8. référence de paiement inexistante : régularisation refusée', async () => {
    const unknown = await admin.post(
      '/api/admin/payments/00000000-0000-4000-8000-000000000000/settle',
      { mode: 'PROVIDER', reason: 'Paiement qui n’existe pas' },
    );
    expect(unknown.status).toBe(404);

    // Paiement réel, mais sans référence chez le fournisseur : rien à vérifier, donc rien à régulariser.
    const { id: userId } = await customer();
    const orphan = await prisma.payment.create({
      data: {
        userId,
        country: 'CG',
        currency: 'XAF',
        amount: 5000,
        credits: 500,
        gateway: 'mock',
        operator: 'MTN',
        payerPhone: PHONE,
        status: 'PENDING',
      },
    });
    const res = await settle(orphan.id);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('NO_PROVIDER_REFERENCE');
    expect(await balanceOf(userId)).toBe(0);
  });

  // ───────────── 9. Attribution exceptionnelle ─────────────

  it('9. attribution exceptionnelle : mouvement ADMIN_ADJUST, audit et notification', async () => {
    const { id: userId } = await customer();
    const res = await admin.post(`/api/admin/users/${userId}/credits`, {
      amount: 50,
      reason: 'Geste commercial après incident',
    });
    expect(res.status).toBe(200);
    expect(res.body.balance).toBe(50);

    const rows = await prisma.creditLedger.findMany({ where: { userId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('ADMIN_ADJUST');
    expect(rows[0].reference).toMatch(/^adjust:/);
    expect(rows[0].paymentId).toBeNull();
    expect(rows[0].createdById).not.toBeNull();

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'credits.adjust', entityId: userId },
    });
    expect(audit.reason).toBe('Geste commercial après incident');
    expect(audit.before).toMatchObject({ balance: 0 });
    expect(audit.after).toMatchObject({ balance: 50, amount: 50 });

    const notes = await prisma.notification.findMany({
      where: { userId, type: 'CREDITS_GRANTED' },
    });
    expect(notes).toHaveLength(1);
  });

  it('9 bis. au-delà du seuil, une justification détaillée est exigée par le serveur', async () => {
    const { id: userId } = await customer();
    const refused = await admin.post(`/api/admin/users/${userId}/credits`, {
      amount: 5000,
      reason: 'Montant important sans justification',
    });
    expect(refused.status).toBe(400);
    expect(await balanceOf(userId)).toBe(0);

    const accepted = await admin.post(`/api/admin/users/${userId}/credits`, {
      amount: 5000,
      reason: 'Compensation exceptionnelle',
      justification:
        'Validée par la direction à la suite de l’incident du 12 novembre.',
    });
    expect(accepted.status).toBe(200);
    expect(await balanceOf(userId)).toBe(5000);
  });

  // ───────────── 10. L'e-mail échoue, les crédits restent ─────────────

  it('10. notification en échec après attribution : les crédits restent acquis et l’envoi est retentable', async () => {
    const { client, id: userId } = await customer();
    const { id, reference } = await buy(client);
    await confirmWithoutWebhook(reference);

    // L'e-mail part après la transaction : on simule une panne d'envoi au moment où il devrait partir.
    const notifications = app.get(NotificationsService);
    const spy = jest
      .spyOn(notifications, 'dispatchEmail')
      .mockRejectedValueOnce(new Error('SMTP injoignable'));

    await expect(settle(id).expect(200)).resolves.toBeDefined();
    spy.mockRestore();

    // Les crédits sont bien là malgré l'échec d'envoi, et la notification reste disponible pour un nouvel essai.
    expect(await balanceOf(userId)).toBe(await totalCreditsOf(id));
    expect(await purchaseRows(reference)).toHaveLength(1);
    const note = await prisma.notification.findFirstOrThrow({
      where: { userId, type: 'PAYMENT_SUCCESS' },
    });
    expect(note.emailSentAt).toBeNull();
    await notifications.flushPendingEmails();
  });

  // ───────────── 12. Permissions ─────────────

  it('12. un utilisateur non autorisé ne peut rien régulariser ni attribuer', async () => {
    const { client, id: userId } = await customer();
    const { id, reference } = await buy(client);
    await confirmWithoutWebhook(reference);

    const anon = new Client(app);
    expect(
      (
        await anon.post(`/api/admin/payments/${id}/settle`, {
          mode: 'PROVIDER',
          reason: 'Tentative anonyme',
        })
      ).status,
    ).toBe(401);

    expect(
      (
        await client.post(`/api/admin/payments/${id}/settle`, {
          mode: 'PROVIDER',
          reason: 'Tentative par un client',
        })
      ).status,
    ).toBe(403);

    expect(
      (
        await client.post(`/api/admin/users/${userId}/credits`, {
          amount: 1000,
          reason: 'Je m’attribue des crédits',
        })
      ).status,
    ).toBe(403);

    expect(await purchaseRows(reference)).toHaveLength(0);
    expect(await balanceOf(userId)).toBe(0);
  });

  // ───────────── Validation administrative sur preuve ─────────────

  describe('Fournisseur injoignable', () => {
    it('refuse la régularisation automatique et accepte une validation administrative tracée', async () => {
      const { client, id: userId } = await customer();
      const { id, reference } = await buy(client);
      await prisma.mockPaymentTransaction.update({
        where: { reference },
        data: { status: 'success', failureMode: 'provider_error' },
      });

      // Mode PROVIDER : aucune conclusion possible, donc aucune attribution.
      const refused = await settle(id);
      expect(refused.status).toBe(503);
      expect(refused.body.code).toBe('PROVIDER_UNAVAILABLE');
      expect(await balanceOf(userId)).toBe(0);

      // La preuve et la justification sont obligatoires : le serveur les exige, pas seulement l'interface.
      const incomplete = await settle(id, { mode: 'MANUAL_PROOF' });
      expect(incomplete.status).toBe(400);
      expect(await balanceOf(userId)).toBe(0);

      const accepted = await settle(id, {
        mode: 'MANUAL_PROOF',
        proofReference: 'RELEVE-MTN-2026-11-13-0042',
        justification:
          'Transaction visible sur le relevé du compte marchand, capture jointe au ticket.',
      });
      expect(accepted.status).toBe(200);
      expect(accepted.body.verifiedBy).toBe('admin_proof');
      expect(await balanceOf(userId)).toBe(await totalCreditsOf(id));

      // L'opération est identifiée comme une validation administrative, pas comme une confirmation du fournisseur.
      const manual = await prisma.paymentCheck.findFirstOrThrow({
        where: { paymentId: id, kind: 'MANUAL' },
      });
      expect(manual.outcome).toBe('manual_proof');
      expect(manual.proofReference).toBe('RELEVE-MTN-2026-11-13-0042');
      expect(manual.actorId).not.toBeNull();
    });

    it('refuse toujours un paiement que le fournisseur déclare échoué, même sur preuve', async () => {
      const { client, id: userId } = await customer();
      const { id, reference } = await buy(client);
      await client
        .post(`/api/payments/${id}/simulate`, {
          outcome: 'failed',
          callbacks: 1,
        })
        .expect(200);

      const res = await settle(id, {
        mode: 'MANUAL_PROOF',
        proofReference: 'RELEVE-INEXISTANT',
        justification:
          'Le client affirme avoir payé mais le fournisseur dit le contraire.',
      });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('NOT_CONFIRMED');
      expect(await purchaseRows(reference)).toHaveLength(0);
      expect(await balanceOf(userId)).toBe(0);
    });
  });

  // ───────────── Reprise des notifications orphelines ─────────────

  it('reprend une notification arrivée avant l’enregistrement de la référence', async () => {
    const { client, id: userId } = await customer();
    const { id, reference } = await buy(client);

    // Notification reçue alors que la référence n'est pas encore connue : elle reste en attente, pas perdue.
    await prisma.paymentWebhookEvent.create({
      data: {
        gateway: 'mock',
        providerTxId: reference,
        event: 'payment.success.early',
        payload: { status: 'success' },
      },
    });
    await confirmWithoutWebhook(reference);

    await payments.reconcile();

    const event = await prisma.paymentWebhookEvent.findFirstOrThrow({
      where: { providerTxId: reference, event: 'payment.success.early' },
    });
    expect(event.processedAt).not.toBeNull();
    expect(event.paymentId).toBe(id);
    expect(await balanceOf(userId)).toBe(await totalCreditsOf(id));
    expect(await purchaseRows(reference)).toHaveLength(1);
  });

  // ───────────── Journal d'administration ─────────────

  it('expose les anomalies dans le journal des paiements', async () => {
    const stats = await admin.get('/api/admin/payments/stats').expect(200);
    expect(stats.body).toMatchObject({
      total: expect.any(Number),
      success: expect.any(Number),
      pending: expect.any(Number),
      failed: expect.any(Number),
      confirmedNotCredited: expect.any(Number),
      manuallySettled: expect.any(Number),
    });
    expect(stats.body.manuallySettled).toBeGreaterThan(0);

    const settled = await admin
      .get('/api/admin/payments?anomaly=settled&pageSize=100')
      .expect(200);
    expect(settled.body.items.length).toBeGreaterThan(0);
    for (const row of settled.body.items) {
      expect(row.creditOrigin).toBe('MANUAL');
      expect(row.creditState).toBe('CREDITED');
    }

    const uncredited = await admin
      .get('/api/admin/payments?anomaly=uncredited&pageSize=100')
      .expect(200);
    for (const row of uncredited.body.items) {
      expect(row.creditState).toBe('NOT_CREDITED');
      expect(row.needsAttention).toBe(true);
    }
  });

  it('donne, sur la fiche d’un paiement régularisé, l’origine et l’historique des vérifications', async () => {
    const row = await prisma.payment.findFirstOrThrow({
      where: { creditOrigin: 'MANUAL' },
    });
    const res = await admin.get(`/api/admin/payments/${row.id}`).expect(200);
    expect(res.body.creditState).toBe('CREDITED');
    expect(res.body.creditOrigin).toBe('MANUAL');
    expect(res.body.creditedBy).toBe(TEST_ENV.ADMIN_EMAIL);
    expect(res.body.canSettle).toBe(false);
    expect(res.body.checks.length).toBeGreaterThan(0);
    expect(
      res.body.timeline.some((e: { kind: string }) => e.kind === 'settled'),
    ).toBe(true);
  });

  it('le mot de passe administrateur n’ouvre aucune autre porte : le registre reste en ajout seul', async () => {
    const row = await prisma.creditLedger.findFirstOrThrow();
    await expect(
      prisma.creditLedger.update({
        where: { id: row.id },
        data: { amount: row.amount + 1_000 },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.creditLedger.delete({ where: { id: row.id } }),
    ).rejects.toThrow();
  });

  it('refuse un mot de passe administrateur invalide (garde-fou de la suite)', async () => {
    const wrong = new Client(app);
    const res = await wrong.post('/api/auth/login', {
      email: TEST_ENV.ADMIN_EMAIL,
      password: `${PASSWORD}-faux`,
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
