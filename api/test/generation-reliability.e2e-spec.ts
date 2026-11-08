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
    /** Demande par défaut : 9:16, 480p, 5 s = 20 crédits. */
    const fun = (extra: Record<string, string> = {}) => ({
      prompt: 'La caméra tourne autour de mes chaussures',
      format: '9:16',
      resolution: '480p',
      durationSeconds: '5',
      ...extra,
    });

    it('envoie la photo, le texte et les réglages du client à Wan 3.0, et livre un vrai MP4', async () => {
      completeWith(mp4, 'video/mp4', 'https://cdn.higgsfield.test/out.mp4');
      const { client, userId, creation } = await create(fun(), 60);
      expect(creation).toMatchObject({
        status: 'COMPLETED',
        credits: 20,
        simulated: false,
      });
      expect(provider.submitted[0].model).toBe(
        'alibaba/wan-3.0/image-to-video',
      );
      // Paramètres EXACTS du modèle ; le texte du client est complété par le gabarit du serveur.
      expect(provider.submitted[0].input).toEqual({
        prompt: expect.stringContaining(
          'La caméra tourne autour de mes chaussures',
        ),
        image_url: 'https://files.higgsfield.test/in-1',
        duration: 5,
        resolution: '480p',
        aspect_ratio: '9:16',
        generate_audio: true,
      });
      expect(provider.submitted[0].input.prompt).toContain('Le produit');
      expect(provider.uploads).toBe(1); // la photo, rien d'autre
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
      expect(await balance(client)).toBe(40);
      expect(await lotsMatchLedger(app, userId)).toEqual({
        ledger: 40,
        lots: 40,
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
      expect(await balance(client)).toBe(40);
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
      expect(await balance(client)).toBe(40); // réservé, pas encore consommé
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
        ledger: 40,
        lots: 40,
      });
    });

    it('un suivi rejoué après la fin ne débite ni ne rembourse une deuxième fois', async () => {
      completeWith(mp4, 'video/mp4');
      const { client, creation } = await create(fun(), 60);
      await creations.advance(creation.id);
      await creations.advance(creation.id);
      expect(await ledgerTypes(creation.id)).toEqual(['CAPTURE', 'RESERVE']);
      expect(await balance(client)).toBe(40);
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
      expect(await balance(client)).toBe(40);
    });

    it('1080p, 30 s, 3:4 : tout part au fournisseur tel que choisi, et 480 crédits sont réservés', async () => {
      const { client, creation } = await create(
        fun({ resolution: '1080p', durationSeconds: '30', format: '3:4' }),
        600,
      );
      expect(creation.credits).toBe(480);
      expect(provider.submitted[0].input).toMatchObject({
        duration: 30,
        resolution: '1080p',
        aspect_ratio: '3:4',
      });
      expect(await balance(client)).toBe(120);
    });
  });
});
