import { INestApplication } from '@nestjs/common';
import { MOCK_FAIL_MARKER } from '../src/generation/mock-generation.provider';
import { CreationsService } from '../src/creations/creations.service';
import { imageSize } from '../src/creations/image-sniff';
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
  let styles: { affiche: string; pub: string; fun: string };

  beforeAll(async () => {
    app = await createApp();
    prisma = prismaOf(app);
    creations = app.get(CreationsService);
    const image = await prisma.generationProduct.findUniqueOrThrow({
      where: { code: 'IMAGE_EDIT_GROK' },
    });
    const video = await prisma.generationProduct.findUniqueOrThrow({
      where: { code: 'VIDEO_LIGHT_480' },
    });
    const mk = (name: string, type: 'LOOK' | 'MOTION', productId: string) =>
      prisma.preset.create({
        data: {
          name: `${name} ${Date.now()}`,
          category: 'test',
          type,
          productId,
          visible: true,
        },
      });
    styles = {
      affiche: (await mk('Affiche test', 'LOOK', image.id)).id,
      pub: (await mk('Pub test', 'LOOK', video.id)).id,
      fun: (await mk('Fun test', 'MOTION', video.id)).id,
    };
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
  const body = (
    kind: 'affiche' | 'pub' | 'fun',
    extra: Record<string, string> = {},
  ) => ({
    kind,
    format: '9:16',
    consent: 'true',
    ...(kind !== 'fun'
      ? { prompt: 'Affiche élégante, texte PROMO -20 %' }
      : {}),
    ...extra,
  });
  /** Une tendance (fun) se choisit par son style ; affiche et pub n'en ont pas besoin. */
  const funBody = (extra: Record<string, string> = {}) =>
    body('fun', { styleId: styles.fun, ...extra });
  const balance = async (client: Client) =>
    (await client.get('/api/auth/me')).body.user.credits as number;

  it('liste les styles par type, avec un coût calculé par le serveur', async () => {
    const { client } = await verifiedClient(app);
    const res = await client.get('/api/creations/styles').expect(200);
    const byId = new Map(res.body.styles.map((s: any) => [s.id, s]));
    expect(byId.get(styles.affiche)).toMatchObject({
      kind: 'affiche',
      credits: 17,
    });
    expect(byId.get(styles.pub)).toMatchObject({
      kind: 'pub',
      credits: 50,
      seconds: 5,
    });
    expect(byId.get(styles.fun)).toMatchObject({ kind: 'fun', credits: 50 });
    const fun = await client.get('/api/creations/styles?kind=fun').expect(200);
    expect(fun.body.styles.every((s: any) => s.kind === 'fun')).toBe(true);
  });

  it('exige une session et un e-mail vérifié', async () => {
    await new Client(app).get('/api/creations').expect(401);
    const anon = new Client(app);
    await anon.register();
    await send(anon, body('affiche')).expect(403);
  });

  describe('Succès', () => {
    it('réserve puis consomme les crédits, et le résultat est téléchargeable', async () => {
      const { client, userId } = await verifiedClient(app);
      await addLot(app, userId, 40);
      const res = await send(
        client,
        body('affiche', {
          prompt: 'Affiche pour 15 000 FCFA, tél. +242 06 000 00 00',
        }),
      ).expect(201);
      const id = res.body.creation.id;
      expect(res.body.creation).toMatchObject({
        kind: 'affiche',
        credits: 17,
        status: 'COMPLETED',
        isVideo: false,
        // Aucun titre inventé, et le fournisseur simulé le dit clairement.
        styleName: null,
        styleId: null,
        simulated: true,
        options: {
          prompt: 'Affiche pour 15 000 FCFA, tél. +242 06 000 00 00',
          format: '9:16',
        },
        prompt: 'Affiche pour 15 000 FCFA, tél. +242 06 000 00 00',
      });
      expect(await balance(client)).toBe(23);

      const ledger = await prisma.creditLedger.findMany({
        where: { generationId: id },
      });
      expect(ledger.map((l) => l.type).sort()).toEqual(['CAPTURE', 'RESERVE']);
      expect(await lotsMatchLedger(app, userId)).toEqual({
        ledger: 23,
        lots: 23,
      });

      const file = await client
        .get(`/api/creations/${id}/file?download=1`)
        .expect(200);
      expect(file.headers['content-type']).toContain('image/png');
      // Le « résultat » simulé n'est JAMAIS la photo envoyée : c'est une image de substitution aux proportions demandées.
      expect(Buffer.compare(file.body as Buffer, PNG)).not.toBe(0);
      expect(imageSize(file.body as Buffer)).toEqual({
        width: 432,
        height: 768,
      });
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
      const res = await send(client, funBody()).expect(201);
      expect(res.body.creation).toMatchObject({
        isVideo: true,
        credits: 50,
        status: 'COMPLETED',
      });
      const part = await client.agent
        .get(`/api/creations/${res.body.creation.id}/file`)
        .set('Range', 'bytes=0-99')
        .expect(206);
      expect(part.headers['content-range']).toMatch(/^bytes 0-99\//);
      expect(await balance(client)).toBe(10);
    });
  });

  describe('Refus', () => {
    it('refuse sans crédits suffisants (402) et ne crée rien', async () => {
      const { client, userId } = await verifiedClient(app);
      await addLot(app, userId, 1);
      const res = await send(client, body('affiche')).expect(402);
      expect(res.body.code).toBe('INSUFFICIENT_CREDITS');
      expect(await prisma.generation.count({ where: { userId } })).toBe(0);
      expect(await balance(client)).toBe(1);
    });

    it('exige le consentement, un style valide et une vraie photo', async () => {
      const { client, userId } = await verifiedClient(app);
      await addLot(app, userId, 40);
      await send(client, body('affiche', { consent: 'false' })).expect(400);
      await send(
        client,
        body('fun', { styleId: '00000000-0000-4000-8000-000000000000' }),
      ).expect(400);
      await send(client, body('affiche'), null).expect(400);
      const fake = await send(
        client,
        body('affiche'),
        Buffer.from('pas une image'),
      ).expect(400);
      expect(fake.body.code).toBe('PHOTO_INVALID');
      await send(client, body('affiche', { prompt: 'x'.repeat(601) })).expect(
        400,
      );
      expect(await balance(client)).toBe(40);
    });

    it('un prompt unique : obligatoire pour affiche et pub, facultatif pour une tendance', async () => {
      const { client, userId } = await verifiedClient(app);
      await addLot(app, userId, 200);
      const none = await send(client, {
        kind: 'affiche',
        consent: 'true',
      }).expect(400);
      expect(none.body.details[0].field).toBe('prompt');
      await send(client, { kind: 'pub', consent: 'true' }).expect(400);
      // Tendance sans prompt : acceptée ; sans style : refusée ; style d'un autre type : refusé.
      await send(client, funBody()).expect(201);
      await send(client, { kind: 'fun', consent: 'true' }).expect(400);
      await send(client, body('pub', { styleId: styles.affiche })).expect(400);
    });

    it('sans style choisi, aucun style n’est inventé : ni titre, ni texte ajouté à la description', async () => {
      // Un style publié « piège » existe : avant, il était attaché d'office (nom en titre, texte par défaut ajouté).
      const image = await prisma.generationProduct.findUniqueOrThrow({
        where: { code: 'IMAGE_EDIT_GROK' },
      });
      const trap = await prisma.preset.create({
        data: {
          name: 'Boutique en vitrine',
          category: 'test',
          type: 'LOOK',
          productId: image.id,
          visible: true,
          sortOrder: -100,
          defaultPrompt: 'TEXTE PARASITE',
        },
      });
      try {
        const { client, userId } = await verifiedClient(app);
        await addLot(app, userId, 40);
        const res = await send(
          client,
          body('affiche', { prompt: 'Ma description exacte' }),
        ).expect(201);
        expect(res.body.creation).toMatchObject({
          kind: 'affiche',
          styleId: null,
          styleName: null,
          prompt: 'Ma description exacte',
        });
        const row = await prisma.generation.findUniqueOrThrow({
          where: { id: res.body.creation.id },
        });
        expect(row.presetId).toBeNull();
        expect(row.prompt).toBe('Ma description exacte');
      } finally {
        await prisma.preset.delete({ where: { id: trap.id } });
      }
    });

    it('refuse, avant tout débit, un format que le modèle n’accepte pas ou un style sans modèle exploitable', async () => {
      const { client, userId } = await verifiedClient(app);
      await addLot(app, userId, 40);
      // 4:5 et 21:9 sont refusés par les modèles : ils ne font pas partie des formats proposés.
      await send(client, body('affiche', { format: '4:5' })).expect(400);
      await send(client, body('affiche', { format: '21:9' })).expect(400);
      // Un style rattaché à Soul (texte → image, qui ignorerait la photo) est refusé au lieu de livrer autre chose.
      const soul = await prisma.generationProduct.findUniqueOrThrow({
        where: { code: 'IMAGE_SOUL2' },
      });
      const preset = await prisma.preset.create({
        data: {
          name: `Soul ${Date.now()}`,
          category: 'test',
          type: 'LOOK',
          productId: soul.id,
          visible: true,
        },
      });
      try {
        const res = await send(
          client,
          body('affiche', { styleId: preset.id }),
        ).expect(400);
        expect(res.body.code).toBe('STYLE_UNAVAILABLE');
        const listed = await client.get('/api/creations/styles').expect(200);
        // Le simulé reste indulgent sur les vidéos de référence, mais jamais sur une photo ignorée.
        expect(listed.body.styles.map((s: any) => s.id)).not.toContain(
          preset.id,
        );
      } finally {
        await prisma.preset.delete({ where: { id: preset.id } });
      }
      expect(await prisma.generation.count({ where: { userId } })).toBe(0);
      expect(await balance(client)).toBe(40);
    });

    it('limite le nombre de créations simultanées', async () => {
      const { client, userId } = await verifiedClient(app);
      await addLot(app, userId, 40);
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
        const first = await send(client, body('affiche')).expect(201);
        expect(first.body.creation.status).toBe('PROCESSING');
        const second = await send(client, body('affiche')).expect(429);
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
        body('pub', { prompt: MOCK_FAIL_MARKER }),
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
      await addLot(app, userId, 40);
      const provider = (creations as any).provider;
      const spy = jest
        .spyOn(provider, 'getStatus')
        .mockResolvedValue({ status: 'processing' });
      const res = await send(client, body('affiche')).expect(201);
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
      expect(await balance(client)).toBe(40);
    });
  });

  describe('Propriété, suppression, signalement', () => {
    it('une création n’est visible que de son propriétaire', async () => {
      const a = await verifiedClient(app);
      const b = await verifiedClient(app);
      await addLot(app, a.userId, 40);
      const { id } = (await send(a.client, body('affiche')).expect(201)).body
        .creation;
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
      await addLot(app, userId, 40);
      const { id } = (await send(client, body('affiche')).expect(201)).body
        .creation;
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
      await addLot(app, userId, 40);
      const { id } = (await send(client, body('affiche')).expect(201)).body
        .creation;
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
