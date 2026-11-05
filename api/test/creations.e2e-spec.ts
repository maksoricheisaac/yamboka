import { INestApplication } from '@nestjs/common';
import { MOCK_FAIL_MARKER } from '../src/generation/mock-generation.provider';
import { CreationsService } from '../src/creations/creations.service';
import { APP_ORIGIN, Client, createApp, prismaOf } from './helpers';
import { addLot, lotsMatchLedger, verifiedClient } from './finance-helpers';

/** PNG de 1 × 1 pixel : le plus petit fichier que le contrôle des octets accepte. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

describe('Créations (e2e)', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof prismaOf>;
  let creations: CreationsService;

  beforeAll(async () => {
    app = await createApp();
    prisma = prismaOf(app);
    creations = app.get(CreationsService);
  });
  afterAll(async () => {
    await app.close();
  });

  const send = (
    client: Client,
    fields: Record<string, string>,
    photo: Buffer | null = PNG,
  ) => {
    const req = client.agent
      .post('/api/creations')
      .set('Origin', APP_ORIGIN)
      .set('X-Forwarded-For', client.ip);
    for (const [k, v] of Object.entries(fields)) req.field(k, v);
    if (photo) req.attach('photo', photo, 'photo.png');
    return req;
  };
  /** Demande par défaut : 9:16, 480p, 5 s (20 crédits), texte obligatoire. */
  const body = (extra: Record<string, string> = {}) => ({
    prompt: 'La caméra tourne autour de mes chaussures',
    format: '9:16',
    resolution: '480p',
    durationSeconds: '5',
    ...extra,
  });
  const balance = async (client: Client) =>
    (await client.get('/api/auth/me')).body.user.credits as number;

  describe('Réglages et idées', () => {
    it('donne les tarifs lus en base, la valeur du crédit et le garde-fou', async () => {
      const { client } = await verifiedClient(app);
      const res = await client.get('/api/creations/config').expect(200);
      expect(res.body).toEqual({
        rates: { '480p': 4, '720p': 8, '1080p': 16 },
        creditValueFcfa: 10,
        guard: { credits: 100, balancePercent: 50 },
      });
    });

    it('liste les idées avec texte et réglages par défaut, filtrables par public', async () => {
      const { client } = await verifiedClient(app);
      const all = (await client.get('/api/creations/styles').expect(200)).body
        .styles;
      expect(all.length).toBeGreaterThanOrEqual(6);
      const shoes = all.find((s: any) => s.name === 'Le produit tourne');
      expect(shoes).toMatchObject({
        audience: 'business',
        format: '9:16',
        resolution: '480p',
        durationSeconds: 5,
      });
      expect(shoes.prompt).toContain('caméra');
      const perso = (
        await client.get('/api/creations/styles?audience=perso').expect(200)
      ).body.styles;
      expect(perso.length).toBeGreaterThan(0);
      expect(perso.every((s: any) => s.audience === 'perso')).toBe(true);
    });
  });

  it('exige une session et un e-mail vérifié', async () => {
    await new Client(app).get('/api/creations').expect(401);
    const anon = new Client(app);
    await anon.register();
    await send(anon, body()).expect(403);
  });

  describe('Coût : calculé par le serveur', () => {
    it.each([
      ['480p', 2, 8],
      ['480p', 5, 20],
      ['720p', 5, 40],
      ['1080p', 11, 176],
      ['1080p', 30, 480],
      ['720p', 2, 16],
    ])(
      '%s, %i s : %i crédits débités, rendu cohérent avec la fonction partagée',
      async (resolution, seconds, expected) => {
        const { client, userId } = await verifiedClient(app);
        await addLot(app, userId, 600);
        const res = await send(
          client,
          body({ resolution, durationSeconds: String(seconds) }),
        ).expect(201);
        expect(res.body.creation).toMatchObject({
          credits: expected,
          status: 'COMPLETED',
          options: { resolution, durationSeconds: seconds, format: '9:16' },
        });
        expect(await balance(client)).toBe(600 - expected);
        const row = await prisma.generation.findUniqueOrThrow({
          where: { id: res.body.creation.id },
          include: { product: true },
        });
        expect(row.billableSeconds).toBe(seconds);
        expect(row.product.resolution).toBe(resolution);
      },
    );

    it('ne fait jamais confiance au coût envoyé par le client', async () => {
      const { client, userId } = await verifiedClient(app);
      await addLot(app, userId, 100);
      const res = await send(
        client,
        body({ credits: '1', creditsCost: '1', cost: '1' }),
      ).expect(201);
      expect(res.body.creation.credits).toBe(20);
      expect(await balance(client)).toBe(80);
    });

    it('le format ne change pas le prix', async () => {
      const { client, userId } = await verifiedClient(app);
      await addLot(app, userId, 200);
      for (const format of ['9:16', '3:4', '1:1', '4:3', '16:9']) {
        const res = await send(client, body({ format })).expect(201);
        expect(res.body.creation).toMatchObject({ credits: 20 });
        expect(res.body.creation.options.format).toBe(format);
      }
    });

    it('refuse les durées hors bornes ou non entières, et les réglages inconnus, avant tout débit', async () => {
      const { client, userId } = await verifiedClient(app);
      await addLot(app, userId, 100);
      for (const durationSeconds of ['1', '31', '5.5', '0', '-3', 'abc'])
        await send(client, body({ durationSeconds })).expect(400);
      await send(client, body({ resolution: '4k' })).expect(400);
      await send(client, body({ format: '4:5' })).expect(400);
      await send(client, body({ format: '21:9' })).expect(400);
      expect(await prisma.generation.count({ where: { userId } })).toBe(0);
      expect(await balance(client)).toBe(100);
    });
  });

  describe('Succès', () => {
    it('réserve puis consomme les crédits, et le résultat est téléchargeable', async () => {
      const { client, userId } = await verifiedClient(app);
      await addLot(app, userId, 60);
      const res = await send(
        client,
        body({ prompt: 'Pub pour 15 000 FCFA, tél. +242 06 000 00 00' }),
      ).expect(201);
      const id = res.body.creation.id;
      expect(res.body.creation).toMatchObject({
        credits: 20,
        status: 'COMPLETED',
        styleName: null,
        styleId: null,
        simulated: true,
        options: {
          prompt: 'Pub pour 15 000 FCFA, tél. +242 06 000 00 00',
          format: '9:16',
        },
        prompt: 'Pub pour 15 000 FCFA, tél. +242 06 000 00 00',
      });
      expect(await balance(client)).toBe(40);

      const ledger = await prisma.creditLedger.findMany({
        where: { generationId: id },
      });
      expect(ledger.map((l) => l.type).sort()).toEqual(['CAPTURE', 'RESERVE']);
      expect(await lotsMatchLedger(app, userId)).toEqual({
        ledger: 40,
        lots: 40,
      });

      const file = await client
        .get(`/api/creations/${id}/file?download=1`)
        .expect(200);
      expect(file.headers['content-type']).toContain('video/mp4');
      // Le « résultat » simulé n'est JAMAIS la photo envoyée : c'est une vidéo de substitution.
      expect(Buffer.compare(file.body as Buffer, PNG)).not.toBe(0);
      expect(file.headers['content-disposition']).toContain('attachment');
      const list = await client.get('/api/creations').expect(200);
      expect(list.body.items.map((i: any) => i.id)).toContain(id);
      const notif = await prisma.notification.findFirst({
        where: { userId, type: 'GENERATION_READY' },
      });
      expect(notif?.link).toBe(`/app/creations/${id}`);
    });

    it('une vidéo est servie par morceaux (lecture sur mobile)', async () => {
      const { client, userId } = await verifiedClient(app);
      await addLot(app, userId, 60);
      const res = await send(client, body()).expect(201);
      const part = await client.agent
        .get(`/api/creations/${res.body.creation.id}/file`)
        .set('Range', 'bytes=0-99')
        .expect(206);
      expect(part.headers['content-range']).toMatch(/^bytes 0-99\//);
    });

    it('une idée choisie est enregistrée avec la création, mais le texte du client prime', async () => {
      const { client, userId } = await verifiedClient(app);
      await addLot(app, userId, 60);
      const idea = (await client.get('/api/creations/styles').expect(200)).body
        .styles[0];
      const res = await send(
        client,
        body({ styleId: idea.id, prompt: 'Mon texte à moi' }),
      ).expect(201);
      expect(res.body.creation).toMatchObject({
        styleId: idea.id,
        styleName: idea.name,
        prompt: 'Mon texte à moi',
      });
    });
  });

  describe('Refus', () => {
    it('refuse sans crédits suffisants (402) et ne crée rien', async () => {
      const { client, userId } = await verifiedClient(app);
      await addLot(app, userId, 19);
      const res = await send(client, body()).expect(402);
      expect(res.body.code).toBe('INSUFFICIENT_CREDITS');
      expect(await prisma.generation.count({ where: { userId } })).toBe(0);
      expect(await balance(client)).toBe(19);
    });

    it('exige une vraie photo et un texte', async () => {
      const { client, userId } = await verifiedClient(app);
      await addLot(app, userId, 40);
      await send(client, body(), null).expect(400);
      const fake = await send(
        client,
        body(),
        Buffer.from('pas une image'),
      ).expect(400);
      expect(fake.body.code).toBe('PHOTO_INVALID');
      const none = await send(client, { format: '9:16' }).expect(400);
      expect(none.body.details[0].field).toBe('prompt');
      await send(client, body({ prompt: '   ' })).expect(400);
      await send(client, body({ prompt: 'x'.repeat(601) })).expect(400);
      await send(
        client,
        body({ styleId: '00000000-0000-4000-8000-000000000000' }),
      ).expect(400);
      expect(await balance(client)).toBe(40);
    });

    it('une photo de personne exige la confirmation du droit de l’utiliser', async () => {
      const { client, userId } = await verifiedClient(app);
      await addLot(app, userId, 40);
      const refused = await send(client, body({ personPhoto: 'true' })).expect(
        400,
      );
      expect(refused.body.details[0].field).toBe('consent');
      await send(
        client,
        body({ personPhoto: 'true', consent: 'true' }),
      ).expect(201);
    });

    it('un style rattaché à un ancien produit Genjutsu n’est ni proposé ni débité', async () => {
      const { client, userId } = await verifiedClient(app);
      await addLot(app, userId, 40);
      const legacy = await prisma.generationProduct.upsert({
        where: { code: 'GENJUTSU_TEST' },
        update: { active: false },
        create: {
          code: 'GENJUTSU_TEST',
          name: 'Ancien produit Genjutsu',
          providerModel: 'higgsfield/genjutsu-light/motion-transfer/v1.0',
          resolution: '480p',
          billingUnit: 'SECOND',
          creditsPerUnit: 10,
          providerCostUsdPerUnit: 0.05,
          active: false,
        },
      });
      const old = await prisma.preset.create({
        data: {
          name: `Ancienne idée ${Date.now()}`,
          category: 'test',
          type: 'MOTION',
          productId: legacy.id,
          visible: false,
        },
      });
      try {
        const listed = await client.get('/api/creations/styles').expect(200);
        expect(listed.body.styles.map((s: any) => s.id)).not.toContain(old.id);
        await send(client, body({ styleId: old.id })).expect(400);
      } finally {
        await prisma.preset.delete({ where: { id: old.id } });
      }
      expect(await balance(client)).toBe(40);
    });

    it('limite le nombre de créations simultanées', async () => {
      const { client, userId } = await verifiedClient(app);
      await addLot(app, userId, 60);
      await prisma.setting.upsert({
        where: { key: 'maxConcurrentGenerationsPerUser' },
        update: { value: 1 },
        create: { key: 'maxConcurrentGenerationsPerUser', value: 1 },
      });
      try {
        const provider = (creations as any).provider;
        const spy = jest
          .spyOn(provider, 'getStatus')
          .mockResolvedValue({ status: 'processing' });
        const first = await send(client, body()).expect(201);
        expect(first.body.creation.status).toBe('PROCESSING');
        const second = await send(client, body()).expect(429);
        expect(second.body.code).toBe('TOO_MANY_RUNNING');
        spy.mockRestore();
        await creations.advanceAll();
      } finally {
        await prisma.setting.update({
          where: { key: 'maxConcurrentGenerationsPerUser' },
          data: { value: 2 },
        });
      }
    });
  });

  describe('Échec et remboursement', () => {
    it('restitue les crédits une seule fois, même si l’on rejoue le suivi', async () => {
      const { client, userId } = await verifiedClient(app);
      await addLot(app, userId, 60);
      const res = await send(
        client,
        body({ prompt: MOCK_FAIL_MARKER }),
      ).expect(201);
      const { id } = res.body.creation;
      expect(res.body.creation).toMatchObject({
        status: 'FAILED',
        refunded: true,
      });
      expect(res.body.creation.errorMessage).toContain(
        'crédits ont été restitués',
      );
      expect(await balance(client)).toBe(60);

      await creations.advance(id);
      await creations.advance(id);
      const ledger = await prisma.creditLedger.findMany({
        where: { generationId: id },
      });
      expect(ledger.map((l) => l.type).sort()).toEqual(['RELEASE', 'RESERVE']);
      expect(await lotsMatchLedger(app, userId)).toEqual({
        ledger: 60,
        lots: 60,
      });
      await client.get(`/api/creations/${id}/file`).expect(404);
      const failed = await client
        .get('/api/creations?status=failed')
        .expect(200);
      expect(failed.body.items.map((i: any) => i.id)).toContain(id);
    });

    it('annule et rembourse une création sans réponse après le délai', async () => {
      const { client, userId } = await verifiedClient(app);
      await addLot(app, userId, 60);
      const provider = (creations as any).provider;
      const spy = jest
        .spyOn(provider, 'getStatus')
        .mockResolvedValue({ status: 'processing' });
      const res = await send(client, body()).expect(201);
      spy.mockRestore();
      await prisma.generation.update({
        where: { id: res.body.creation.id },
        data: { createdAt: new Date(Date.now() - 61 * 60_000) },
      });
      await creations.advance(res.body.creation.id);
      const after = (await client.get(`/api/creations/${res.body.creation.id}`))
        .body.creation;
      expect(after.status).toBe('FAILED');
      expect(after.errorMessage).toContain('trop de temps');
      expect(await balance(client)).toBe(60);
    });
  });

  describe('Propriété, suppression, signalement', () => {
    it('une création n’est visible que de son propriétaire', async () => {
      const a = await verifiedClient(app);
      const b = await verifiedClient(app);
      await addLot(app, a.userId, 60);
      const { id } = (await send(a.client, body()).expect(201)).body.creation;
      await b.client.get(`/api/creations/${id}`).expect(404);
      await b.client.get(`/api/creations/${id}/file`).expect(404);
      await b.client.agent
        .delete(`/api/creations/${id}`)
        .set('Origin', APP_ORIGIN)
        .expect(404);
      expect((await b.client.get('/api/creations')).body.items).toHaveLength(0);
    });

    it('supprime les fichiers mais garde la trace', async () => {
      const { client, userId } = await verifiedClient(app);
      await addLot(app, userId, 60);
      const { id } = (await send(client, body()).expect(201)).body.creation;
      await client.agent
        .delete(`/api/creations/${id}`)
        .set('Origin', APP_ORIGIN)
        .expect(204);
      await client.get(`/api/creations/${id}`).expect(404);
      const row = await prisma.generation.findUniqueOrThrow({
        where: { id },
        include: { media: true },
      });
      expect(row.deletedAt).not.toBeNull();
      expect(row.media.every((m) => m.purgedAt)).toBe(true);
    });

    it('un signalement gèle la conservation et empêche la suppression', async () => {
      const { client, userId } = await verifiedClient(app);
      await addLot(app, userId, 60);
      const { id } = (await send(client, body()).expect(201)).body.creation;
      await client
        .post(`/api/creations/${id}/report`, { reason: 'Contenu inapproprié' })
        .expect(204);
      await client
        .post(`/api/creations/${id}/report`, { reason: 'Contenu inapproprié' })
        .expect(204);
      expect(await prisma.report.count({ where: { generationId: id } })).toBe(
        1,
      );
      expect(
        (await prisma.generation.findUniqueOrThrow({ where: { id } }))
          .retentionHold,
      ).toBe(true);
      const del = await client.agent
        .delete(`/api/creations/${id}`)
        .set('Origin', APP_ORIGIN)
        .expect(409);
      expect(del.body.code).toBe('RETENTION_HOLD');
      await client
        .post(`/api/creations/${id}/report`, { reason: 'inconnu' })
        .expect(400);
    });
  });
});
