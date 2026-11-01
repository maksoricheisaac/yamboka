import { INestApplication } from '@nestjs/common';
import { EmailService } from '../src/email/email.service';
import { ConsoleEmailProvider } from '../src/email/console-email.provider';
import { NotificationsService } from '../src/notifications/notifications.service';
import { CreationsService } from '../src/creations/creations.service';
import { MOCK_FAIL_MARKER } from '../src/generation/mock-generation.provider';
import { PaymentsService } from '../src/payments/payments.service';
import { APP_ORIGIN, Client, createApp, prismaOf } from './helpers';
import { addLot, verifiedClient } from './finance-helpers';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

describe('Notifications, préférences et e-mails (e2e)', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof prismaOf>;
  let notifications: NotificationsService;
  let creations: CreationsService;
  let outbox: ConsoleEmailProvider;

  beforeAll(async () => {
    app = await createApp();
    prisma = prismaOf(app);
    notifications = app.get(NotificationsService);
    creations = app.get(CreationsService);
    outbox = app.get(ConsoleEmailProvider);
    // Un style d'affiche publié, pour pouvoir lancer des créations.
    const product = await prisma.generationProduct.findUniqueOrThrow({ where: { code: 'IMAGE_SOUL2' } });
    const exists = await prisma.preset.findFirst({ where: { name: 'Affiche notifications', visible: true } });
    if (!exists) {
      await prisma.preset.create({
        data: { name: 'Affiche notifications', category: 'test', type: 'LOOK', productId: product.id, visible: true },
      });
    }
  });
  afterAll(async () => {
    await app.close();
  });

  const create = (client: Client, prompt: string) =>
    client.agent
      .post('/v1/creations')
      .set('Origin', APP_ORIGIN)
      .set('X-Forwarded-For', client.ip)
      .field('kind', 'affiche')
      .field('format', '1:1')
      .field('consent', 'true')
      .field('prompt', prompt)
      .attach('photo', PNG, 'photo.png');

  const mails = (email: string) => outbox.messagesFor(email);
  const notesOf = (userId: string) => prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });

  describe('Notifications de l’utilisateur', () => {
    it('sont propres à chaque utilisateur, paginées, et se marquent comme lues', async () => {
      const a = await verifiedClient(app);
      const b = await verifiedClient(app);
      for (let i = 0; i < 3; i++) {
        await notifications.notify(prisma, { userId: a.userId, type: 'SYSTEM', title: `N${i}`, body: 'x', dedupKey: `t:${a.userId}:${i}` });
      }
      await notifications.notify(prisma, { userId: b.userId, type: 'SYSTEM', title: 'Pour B', body: 'x', dedupKey: `t:${b.userId}:0` });

      const first = (await a.client.get('/v1/notifications?limit=2').expect(200)).body;
      expect(first.unread).toBe(3);
      expect(first.items.map((n: any) => n.title)).toEqual(['N2', 'N1']);
      const second = (await a.client.get(`/v1/notifications?limit=2&cursor=${first.nextCursor}`).expect(200)).body;
      expect(second.items.map((n: any) => n.title)).toEqual(['N0']);
      expect(second.nextCursor).toBeNull();

      // Une notification d'un autre utilisateur est introuvable et reste intacte.
      const otherId = (await notesOf(b.userId))[0].id;
      await a.client.post(`/v1/notifications/${otherId}/read`).expect(404);
      expect((await notesOf(b.userId))[0].readAt).toBeNull();

      await a.client.post(`/v1/notifications/${first.items[0].id}/read`).expect(204);
      expect((await a.client.get('/v1/notifications').expect(200)).body.unread).toBe(2);
      await a.client.post('/v1/notifications/read').expect(204);
      expect((await a.client.get('/v1/notifications').expect(200)).body.unread).toBe(0);
      await new Client(app).get('/v1/notifications').expect(401);
    });

    it('un événement rejoué ne crée qu’une notification', async () => {
      const { userId } = await verifiedClient(app);
      const input = { userId, type: 'SYSTEM' as const, title: 'Une fois', body: 'x', dedupKey: `once:${userId}` };
      const first = await notifications.notify(prisma, input);
      const again = await notifications.notify(prisma, input);
      expect(first.id).not.toBeNull();
      expect(again.id).toBeNull();
      expect(await prisma.notification.count({ where: { userId } })).toBe(1);
    });
  });

  describe('Préférences d’e-mail', () => {
    it('valeurs par défaut cohérentes, enregistrement confirmé par le serveur, persistance', async () => {
      const { client, email } = await verifiedClient(app);
      const initial = (await client.get('/v1/preferences').expect(200)).body;
      expect(initial).toMatchObject({
        email,
        emailVerified: true,
        emailPrefs: { generationReady: true, generationFailed: true, paymentConfirmed: true, creditsRefunded: true },
      });

      const saved = (await client.patch('/v1/preferences', { emailPrefs: { generationReady: false } }).expect(200)).body;
      expect(saved.emailPrefs).toEqual({ ...initial.emailPrefs, generationReady: false });
      // Indépendantes : les autres ne bougent pas, et la valeur survit à une nouvelle lecture.
      expect((await client.get('/v1/preferences').expect(200)).body.emailPrefs.generationFailed).toBe(true);
      expect((await client.get('/v1/preferences').expect(200)).body.emailPrefs.generationReady).toBe(false);

      await client.patch('/v1/preferences', { emailPrefs: {} }).expect(400);
      await client.patch('/v1/preferences', { emailPrefs: { generationReady: 'oui' } }).expect(400);
      await new Client(app).get('/v1/preferences').expect(401);
    });
  });

  describe('E-mails des événements', () => {
    it('création terminée : notification interne + e-mail avec lien direct, une seule fois', async () => {
      const { client, userId, email } = await verifiedClient(app);
      await addLot(app, userId, 10);
      const { creation } = (await create(client, 'Affiche test').expect(201)).body;
      expect(creation.status).toBe('COMPLETED');

      const ready = (await notesOf(userId)).filter((n) => n.type === 'GENERATION_READY');
      expect(ready).toHaveLength(1);
      expect(ready[0].emailSentAt).not.toBeNull();
      const sent = mails(email).filter((m) => /prête/.test(m.subject));
      expect(sent).toHaveLength(1);
      expect(sent[0].text).toContain(`/app/creations/${creation.id}`);

      // Suivi rejoué : ni nouvelle notification, ni nouvel e-mail.
      await creations.advance(creation.id);
      await notifications.dispatchEmail(ready[0].id);
      expect((await notesOf(userId)).filter((n) => n.type === 'GENERATION_READY')).toHaveLength(1);
      expect(mails(email).filter((m) => /prête/.test(m.subject))).toHaveLength(1);
    });

    it('préférence désactivée : la création se termine, la notification existe, aucun e-mail', async () => {
      const { client, userId, email } = await verifiedClient(app);
      await addLot(app, userId, 10);
      await client.patch('/v1/preferences', { emailPrefs: { generationReady: false } }).expect(200);
      const { creation } = (await create(client, 'Affiche test').expect(201)).body;
      expect(creation.status).toBe('COMPLETED');
      const note = (await notesOf(userId)).find((n) => n.type === 'GENERATION_READY');
      expect(note).toBeDefined();
      expect(note?.emailPending).toBe(false);
      expect(note?.emailSentAt).toBeNull();
      expect(mails(email).filter((m) => /prête/.test(m.subject))).toHaveLength(0);
    });

    it('échec : notifications d’échec et de remboursement, e-mails selon chaque préférence', async () => {
      const { client, userId, email } = await verifiedClient(app);
      await addLot(app, userId, 10);
      await client.patch('/v1/preferences', { emailPrefs: { creditsRefunded: false } }).expect(200);
      const { creation } = (await create(client, MOCK_FAIL_MARKER).expect(201)).body;
      expect(creation.status).toBe('FAILED');
      await creations.advance(creation.id);

      const notes = await notesOf(userId);
      expect(notes.filter((n) => n.type === 'GENERATION_FAILED')).toHaveLength(1);
      expect(notes.filter((n) => n.type === 'CREDITS_REFUNDED')).toHaveLength(1);
      const subjects = mails(email).map((m) => m.subject);
      expect(subjects.some((s) => /n’a pas abouti/.test(s))).toBe(true);
      // Remboursement : notification interne conservée, mais aucun e-mail (préférence désactivée).
      expect(notes.find((n) => n.type === 'CREDITS_REFUNDED')?.emailSentAt).toBeNull();
      expect(subjects.filter((s) => /restitués/i.test(s))).toHaveLength(0);
    });

    it('un e-mail en panne ne fait pas échouer la création, et il est repris ensuite', async () => {
      const { client, userId, email } = await verifiedClient(app);
      await addLot(app, userId, 10);
      const spy = jest.spyOn(app.get(EmailService), 'sendNotificationEmail').mockRejectedValueOnce(new Error('SMTP indisponible'));
      const { creation } = (await create(client, 'Affiche test').expect(201)).body;
      spy.mockRestore();
      expect(creation.status).toBe('COMPLETED');

      const note = (await notesOf(userId)).find((n) => n.type === 'GENERATION_READY')!;
      expect(note).toMatchObject({ emailPending: true, emailAttempts: 1, emailSentAt: null });
      expect(note.emailError).toContain('SMTP indisponible');
      expect(mails(email).filter((m) => /prête/.test(m.subject))).toHaveLength(0);

      // Reprise : le délai croissant est respecté (rien tout de suite), puis l'e-mail part une fois.
      expect(await notifications.flushPendingEmails()).toBe(0);
      expect(await notifications.flushPendingEmails(new Date(Date.now() + 3 * 60_000))).toBe(1);
      expect(mails(email).filter((m) => /prête/.test(m.subject))).toHaveLength(1);
      expect((await notesOf(userId)).find((n) => n.id === note.id)).toMatchObject({ emailPending: false });
    });

    it('aucun e-mail vers une adresse non vérifiée', async () => {
      const client = new Client(app);
      const { email } = await client.register();
      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      const { id } = await notifications.notify(prisma, {
        userId: user.id,
        type: 'GENERATION_READY',
        title: 'Prête',
        body: 'x',
        dedupKey: `unverified:${user.id}`,
      });
      const note = await prisma.notification.findUniqueOrThrow({ where: { id: id! } });
      expect(note.emailPending).toBe(false);
    });

    it('paiement confirmé : notification et e-mail de reçu, une seule fois même si l’on revérifie', async () => {
      const { client, userId, email } = await verifiedClient(app);
      const packs = (await client.get('/v1/catalog/packs').expect(200)).body.packs as { id: string; name: string }[];
      const pay = (
        await client.post('/v1/payments', { packId: packs[0].id, operator: 'MTN', phone: '+242061234567' }).expect(201)
      ).body.payment;
      await client.post(`/v1/payments/${pay.id}/simulate`, { outcome: 'success', callbacks: 3 }).expect(200);
      await app.get(PaymentsService).verify(pay.id);

      const notes = (await notesOf(userId)).filter((n) => n.type === 'PAYMENT_SUCCESS');
      expect(notes).toHaveLength(1);
      expect(notes[0].emailSentAt).not.toBeNull();
      expect(mails(email).filter((m) => /paiement|reçu|achat/i.test(m.subject))).toHaveLength(1);
    });
  });
});
