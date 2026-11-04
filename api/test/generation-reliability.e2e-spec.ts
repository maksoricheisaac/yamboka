import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { CreditsService } from '../src/credits/credits.service';
import { CreationsService } from '../src/creations/creations.service';
import {
  GenerationProvider,
  GenerationRejectedError,
  GenerationStatusResult,
  GenerationUnavailableError,
  SubmitGenerationRequest,
  SubmitGenerationResult,
} from '../src/generation/generation-provider';
import { StorageDriver } from '../src/storage/storage-driver';
import { APP_ORIGIN, Client, prismaOf } from './helpers';
import { addLot, lotsMatchLedger, verifiedClient } from './finance-helpers';

/** PNG de 1 × 1 pixel : la « photo » de l'utilisateur. */
const PHOTO = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * Faux fournisseur RÉEL dans son comportement (son nom n'est pas « mock » : aucune indulgence du simulé). Il enregistre
 * ce qui lui est envoyé et rejoue le scénario choisi par chaque test.
 */
class ScriptedProvider extends GenerationProvider {
  readonly name = 'higgsfield-test';
  submitted: SubmitGenerationRequest[] = [];
  uploads = 0;
  submitError: Error | null = null;
  /** Réponse de getStatus ; peut lever une erreur. */
  status: () => GenerationStatusResult = () => ({ status: 'processing' });
  /** Octets servis pour chaque URL de résultat. */
  files = new Map<string, { body: Buffer; type: string }>();

  reset() {
    this.submitted = [];
    this.uploads = 0;
    this.submitError = null;
    this.status = () => ({ status: 'processing' });
    this.files.clear();
  }
  submit(r: SubmitGenerationRequest): Promise<SubmitGenerationResult> {
    if (this.submitError) return Promise.reject(this.submitError);
    this.submitted.push(r);
    return Promise.resolve({
      requestId: `REQ-${this.submitted.length}`,
      statusUrl: `https://api.higgsfield.test/requests/${r.idempotencyKey}/status`,
      status: 'queued',
    });
  }
  getStatus(): Promise<GenerationStatusResult> {
    try {
      return Promise.resolve(this.status());
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error(String(e)));
    }
  }
  cancel() {
    return Promise.resolve();
  }
  uploadInput() {
    this.uploads += 1;
    return Promise.resolve(`https://files.higgsfield.test/in-${this.uploads}`);
  }
  diagnose() {
    return Promise.resolve({ ok: true, detail: 'test' });
  }
}

describe('Fiabilité de la génération (e2e, fournisseur scripté)', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof prismaOf>;
  let creations: CreationsService;
  let credits: CreditsService;
  let storage: StorageDriver;
  const provider = new ScriptedProvider();
  let motionStyle: string;
  let fetchSpy: jest.SpiedFunction<typeof fetch>;
  let mp4: Buffer;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GenerationProvider)
      .useValue(provider)
      .compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    configureApp(app);
    await app.init();
    prisma = prismaOf(app);
    creations = app.get(CreationsService);
    credits = app.get(CreditsService);
    storage = app.get(StorageDriver);
    mp4 = await readFile(join(process.cwd(), 'assets', 'mock-output.mp4'));

    // Un style « tendance » (transfert de mouvement) avec sa vidéo de référence.
    const video = await prisma.generationProduct.findUniqueOrThrow({
      where: { code: 'VIDEO_LIGHT_480' },
    });
    const preset = await prisma.preset.create({
      data: {
        name: `Tendance ${Date.now()}`,
        category: 'test',
        type: 'MOTION',
        productId: video.id,
        visible: true,
      },
    });
    const key = `presets/${preset.id}/example.mp4`;
    await storage.put(key, mp4, 'video/mp4');
    await prisma.mediaFile.create({
      data: {
        role: 'PRESET_EXAMPLE_VIDEO',
        bucket: 'PRESETS',
        key,
        mimeType: 'video/mp4',
        sizeBytes: mp4.length,
        presetId: preset.id,
        verifiedAt: new Date(),
      },
    });
    motionStyle = preset.id;
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    provider.reset();
    // Les résultats sont « téléchargés » depuis la table du fournisseur scripté : aucun réseau réel.
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const f = provider.files.get(
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      );
      return Promise.resolve(
        f
          ? new Response(new Uint8Array(f.body), {
              status: 200,
              headers: { 'content-type': f.type },
            })
          : new Response('introuvable', { status: 404 }),
      );
    });
  });
  afterEach(() => fetchSpy.mockRestore());

  const send = (client: Client, fields: Record<string, string>) => {
    const req = client.agent
      .post('/api/creations')
      .set('Origin', APP_ORIGIN)
      .set('X-Forwarded-For', client.ip);
    for (const [k, v] of Object.entries(fields)) req.field(k, v);
    return req.attach('photo', PHOTO, 'photo.png');
  };
  const balance = async (c: Client) =>
    (await c.get('/api/auth/me')).body.user.credits as number;
  const ledgerTypes = async (id: string) =>
    (await prisma.creditLedger.findMany({ where: { generationId: id } }))
      .map((l) => l.type)
      .sort();
  const outputs = (id: string) =>
    prisma.mediaFile.count({
      where: {
        generationId: id,
        role: 'OUTPUT_VIDEO',
      },
    });

  /** Le fournisseur annonce « terminé » avec ce fichier. */
  const completeWith = (
    body: Buffer,
    type: string,
    url = 'https://cdn.higgsfield.test/out',
  ) => {
    provider.files.set(url, { body, type });
    provider.status = () => ({ status: 'completed', outputUrl: url });
  };
  async function create(fields: Record<string, string>, lot = 60) {
    const { client, userId } = await verifiedClient(app);
    await addLot(app, userId, lot);
    const res = await send(client, fields);
    return {
      client,
      userId,
      res,
      creation: res.body.creation as Record<string, any>,
    };
  }

  describe('Vidéos', () => {
    const fun = (extra: Record<string, string> = {}) => ({
      kind: 'fun',
      styleId: motionStyle,
      format: '9:16',
      consent: 'true',
      ...extra,
    });

    it('envoie vidéo de référence ET photo, sans texte ni format, et livre un vrai MP4', async () => {
      completeWith(mp4, 'video/mp4', 'https://cdn.higgsfield.test/out.mp4');
      const { client, userId, creation } = await create(fun(), 60);
      expect(creation).toMatchObject({
        status: 'COMPLETED',
        credits: 50,
        simulated: false,
      });
      expect(provider.submitted[0].model).toBe(
        'higgsfield/genjutsu-light/motion-transfer/v1.0',
      );
      expect(provider.submitted[0].input).toEqual({
        video_url: 'https://files.higgsfield.test/in-2',
        image_urls: ['https://files.higgsfield.test/in-1'],
        resolution: '480p',
      });
      expect(provider.uploads).toBe(2); // photo + vidéo de référence
      const file = await client
        .get(`/api/creations/${creation.id}/file`)
        .expect(200);
      expect(file.headers['content-type']).toContain('video/mp4');
      expect((file.body as Buffer).subarray(4, 8).toString('ascii')).toBe(
        'ftyp',
      );
      const media = await prisma.mediaFile.findFirstOrThrow({
        where: { generationId: creation.id, role: 'OUTPUT_VIDEO' },
      });
      expect(media.sizeBytes).toBe(mp4.length);
      expect((await storage.get(media.key)).equals(mp4)).toBe(true);
      expect(await ledgerTypes(creation.id)).toEqual(['CAPTURE', 'RESERVE']);
      expect(await balance(client)).toBe(10);
      expect(await lotsMatchLedger(app, userId)).toEqual({
        ledger: 10,
        lots: 10,
      });
    });

    it('une réponse intermédiaire (file d’attente, en cours) n’est jamais prise pour un résultat', async () => {
      const { client, creation } = await create(fun(), 60);
      expect(creation).toMatchObject({ status: 'PROCESSING', fileUrl: null });
      for (const status of ['queued', 'processing'] as const) {
        provider.status = () => ({
          status,
          outputUrl: 'https://cdn.higgsfield.test/ignore.mp4',
        });
        await creations.advance(creation.id);
      }
      expect(
        (
          await prisma.generation.findUniqueOrThrow({
            where: { id: creation.id },
          })
        ).status,
      ).not.toBe('COMPLETED');
      expect(await outputs(creation.id)).toBe(0);
      expect(await ledgerTypes(creation.id)).toEqual(['RESERVE']);
      expect(await balance(client)).toBe(10);
    });

    it.each([
      [
        'tâche terminée sans fichier',
        () => {
          provider.status = () => ({ status: 'completed' });
        },
      ],
      ['fichier vide', () => completeWith(Buffer.alloc(0), 'video/mp4')],
      [
        'image servie à la place de la vidéo',
        () => completeWith(PHOTO, 'video/mp4'),
      ],
      [
        'page d’erreur à la place de la vidéo',
        () =>
          completeWith(
            Buffer.from('<html>Erreur 500</html>'.repeat(800)),
            'video/mp4',
          ),
      ],
      [
        'vidéo tronquée (pas de MP4 valide)',
        () => completeWith(mp4.subarray(0, 4000), 'video/mp4'),
      ],
    ])(
      '%s : échec clair, crédits restitués, aucun fichier',
      async (_l, script) => {
        script();
        const { client, creation } = await create(fun(), 60);
        expect(creation).toMatchObject({
          status: 'FAILED',
          refunded: true,
          fileUrl: null,
        });
        expect(creation.errorMessage).toContain('crédits ont été restitués');
        expect(await outputs(creation.id)).toBe(0);
        expect(await ledgerTypes(creation.id)).toEqual(['RELEASE', 'RESERVE']);
        expect(await balance(client)).toBe(60);
      },
    );

    it('échec du fournisseur puis suivi rejoué : une seule restitution', async () => {
      provider.status = () => ({ status: 'failed', error: 'GPU indisponible' });
      const { client, creation } = await create(fun(), 60);
      expect(creation.status).toBe('FAILED');
      await creations.advance(creation.id);
      await creations.advance(creation.id);
      expect(await ledgerTypes(creation.id)).toEqual(['RELEASE', 'RESERVE']);
      expect(await balance(client)).toBe(60);
    });

    it('délai dépassé : remboursée une seule fois', async () => {
      const { client, creation } = await create(fun(), 60);
      await prisma.generation.update({
        where: { id: creation.id },
        data: { createdAt: new Date(Date.now() - 61 * 60_000) },
      });
      await creations.advance(creation.id);
      await creations.advance(creation.id);
      expect(
        (await client.get(`/api/creations/${creation.id}`)).body.creation,
      ).toMatchObject({ status: 'FAILED', refunded: true });
      expect(await ledgerTypes(creation.id)).toEqual(['RELEASE', 'RESERVE']);
      expect(await balance(client)).toBe(60);
    });

    it('échec du fournisseur, refus de modération et annulation : messages distincts, une seule restitution', async () => {
      const cases: [GenerationStatusResult, string][] = [
        [{ status: 'failed', error: 'boom interne' }, 'n’a pas pu terminer'],
        [{ status: 'rejected', error: 'nsfw' }, 'contrôle de contenu'],
        [{ status: 'canceled' }, 'annulée'],
      ];
      for (const [result, expected] of cases) {
        provider.reset();
        provider.status = () => result;
        const { client, creation } = await create(fun(), 60);
        expect(creation.status).toBe('FAILED');
        expect(creation.errorMessage).toContain(expected);
        // Le texte technique du fournisseur n'est jamais montré à l'utilisateur.
        expect(JSON.stringify(creation)).not.toContain('boom interne');
        await creations.advance(creation.id);
        await creations.advance(creation.id);
        expect(await ledgerTypes(creation.id)).toEqual(['RELEASE', 'RESERVE']);
        expect(await balance(client)).toBe(60);
      }
    });

    it('demande refusée à l’envoi par le fournisseur : échec immédiat et remboursé', async () => {
      provider.submitError = new GenerationRejectedError(
        'HTTP 422 : paramètres invalides',
      );
      const { client, creation } = await create(fun(), 60);
      expect(creation).toMatchObject({ status: 'FAILED', refunded: true });
      expect(await balance(client)).toBe(60);
    });

    it('fournisseur injoignable à l’envoi : la création attend (rien n’est perdu), puis aboutit sans double débit', async () => {
      provider.submitError = new GenerationUnavailableError('panne');
      const { client, userId, creation } = await create(fun(), 60);
      expect(creation.status).toBe('PENDING');
      expect(await balance(client)).toBe(10); // réservé, pas encore consommé
      provider.submitError = null;
      completeWith(mp4, 'video/mp4');
      await creations.advance(creation.id);
      await creations.advance(creation.id);
      const done = await prisma.generation.findUniqueOrThrow({
        where: { id: creation.id },
      });
      expect(done.status).toBe('COMPLETED');
      expect(provider.submitted).toHaveLength(1);
      expect(await ledgerTypes(creation.id)).toEqual(['CAPTURE', 'RESERVE']);
      expect(await lotsMatchLedger(app, userId)).toEqual({
        ledger: 10,
        lots: 10,
      });
    });

    it('un suivi rejoué après la fin ne débite ni ne rembourse une deuxième fois', async () => {
      completeWith(mp4, 'video/mp4');
      const { client, creation } = await create(fun(), 60);
      await creations.advance(creation.id);
      await creations.advance(creation.id);
      expect(await ledgerTypes(creation.id)).toEqual(['CAPTURE', 'RESERVE']);
      expect(await balance(client)).toBe(10);
    });

    it('délai dépassé alors que les crédits sont déjà consommés : jamais remboursée à tort, la création se termine', async () => {
      const { client, creation } = await create(fun(), 60);
      expect(creation.status).toBe('PROCESSING');
      await credits.capture(creation.id); // le succès a été encaissé juste avant l'arrêt du serveur
      await prisma.generation.update({
        where: { id: creation.id },
        data: { createdAt: new Date(Date.now() - 61 * 60_000) },
      });
      completeWith(mp4, 'video/mp4');
      await creations.advance(creation.id);
      const after = (await client.get(`/api/creations/${creation.id}`)).body
        .creation;
      expect(after.status).toBe('COMPLETED');
      expect(await ledgerTypes(creation.id)).toEqual(['CAPTURE', 'RESERVE']);
      expect(await balance(client)).toBe(10);
    });

    it('un style vidéo sans vidéo de référence n’est ni proposé ni accepté (jamais débité pour rien)', async () => {
      const video = await prisma.generationProduct.findUniqueOrThrow({
        where: { code: 'VIDEO_LIGHT_480' },
      });
      const bare = await prisma.preset.create({
        data: {
          name: `Sans vidéo ${Date.now()}`,
          category: 'test',
          type: 'MOTION',
          productId: video.id,
          visible: true,
        },
      });
      try {
        const { client, res } = await create(fun({ styleId: bare.id }), 60);
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('STYLE_UNAVAILABLE');
        expect(await balance(client)).toBe(60);
        const listed = (
          await client.get('/api/creations/styles').expect(200)
        ).body.styles.map((s: { id: string }) => s.id);
        expect(listed).not.toContain(bare.id);
        expect(listed).toContain(motionStyle);
      } finally {
        await prisma.preset.delete({ where: { id: bare.id } });
      }
    });

    it('une vidéo « pub » sans style est refusée avec un vrai fournisseur (aucune vidéo de référence à envoyer)', async () => {
      const { client, res } = await create(
        {
          kind: 'pub',
          format: '9:16',
          consent: 'true',
          prompt: 'Zoom sur mon produit',
        },
        60,
      );
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('STYLE_UNAVAILABLE');
      expect(provider.submitted).toHaveLength(0);
      expect(await balance(client)).toBe(60);
    });
  });
});
