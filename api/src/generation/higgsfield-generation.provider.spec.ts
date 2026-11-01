import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import {
  GenerationAuthError,
  GenerationRejectedError,
  GenerationUnavailableError,
} from './generation-provider';
import { HiggsfieldGenerationProvider } from './higgsfield-generation.provider';

const config = (secret = 'sec') =>
  new ConfigService<Env, true>({
    HF_API_URL: 'https://api.higgsfield.test',
    HF_API_KEY_ID: 'kid',
    HF_API_KEY_SECRET: secret,
  });

const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

describe('HiggsfieldGenerationProvider', () => {
  let fetchMock: jest.SpiedFunction<typeof fetch>;

  /** Appel n° i à fetch : URL et en-têtes envoyés. */
  const call = (i: number) => {
    const [url, init] = fetchMock.mock.calls[i];
    return {
      url: url as string,
      headers: (init?.headers ?? {}) as Record<string, string>,
    };
  };

  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });
  afterEach(() => fetchMock.mockRestore());

  const sentAuthorization = () => call(0).headers.Authorization;

  it('envoie « Key identifiant:secret »', async () => {
    fetchMock.mockReturnValue(json(200, { upload_url: 'u', public_url: 'p' }));
    await new HiggsfieldGenerationProvider(config()).diagnose();
    expect(sentAuthorization()).toBe('Key kid:sec');
  });

  it('accepte un secret collé sous la forme « identifiant:secret »', async () => {
    fetchMock.mockReturnValue(json(200, {}));
    await new HiggsfieldGenerationProvider(config('kid:sec')).diagnose();
    expect(sentAuthorization()).toBe('Key kid:sec');
  });

  it('soumet une demande avec une clé d’idempotence et normalise le statut', async () => {
    fetchMock.mockReturnValue(
      json(200, {
        status: 'queued',
        request_id: 'r1',
        status_url: 'https://api.higgsfield.test/requests/r1/status',
        cancel_url: 'https://api.higgsfield.test/requests/r1/cancel',
      }),
    );
    const out = await new HiggsfieldGenerationProvider(config()).submit({
      model: 'higgsfield/genjutsu/motion-transfer/v1.0',
      input: { video_url: 'v' },
      idempotencyKey: 'abc',
    });
    expect(out).toMatchObject({ requestId: 'r1', status: 'queued' });
    const { url, headers } = call(0);
    expect(url).toBe(
      'https://api.higgsfield.test/higgsfield/genjutsu/motion-transfer/v1.0',
    );
    expect(headers['Idempotency-Key']).toBe('abc');
  });

  it('traduit les statuts du fournisseur', async () => {
    const provider = new HiggsfieldGenerationProvider(config());
    const url = 'https://api.higgsfield.test/requests/r1/status';
    const cases: [string, string][] = [
      ['in_progress', 'processing'],
      ['nsfw', 'rejected'],
      ['canceled', 'canceled'],
      ['failed', 'failed'],
    ];
    for (const [hf, expected] of cases) {
      fetchMock.mockReturnValueOnce(json(200, { status: hf }));
      expect((await provider.getStatus(url)).status).toBe(expected);
    }
  });

  it('renvoie l’URL de la vidéo quand la génération est terminée', async () => {
    fetchMock.mockReturnValue(
      json(200, { status: 'completed', video: { url: 'https://cdn/v.mp4' } }),
    );
    const out = await new HiggsfieldGenerationProvider(config()).getStatus(
      'https://api.higgsfield.test/requests/r1/status',
    );
    expect(out).toEqual({
      status: 'completed',
      outputUrl: 'https://cdn/v.mp4',
      error: undefined,
    });
  });

  it('ne conclut rien si « terminé » arrive sans fichier', async () => {
    fetchMock.mockReturnValue(json(200, { status: 'completed' }));
    await expect(
      new HiggsfieldGenerationProvider(config()).getStatus(
        'https://api.higgsfield.test/requests/r1/status',
      ),
    ).rejects.toBeInstanceOf(GenerationUnavailableError);
  });

  it('distingue identifiants refusés, panne et demande refusée', async () => {
    const provider = new HiggsfieldGenerationProvider(config());
    const request = {
      model: 'm',
      input: {},
      idempotencyKey: 'k',
    };
    fetchMock.mockReturnValueOnce(json(401, { detail: 'Invalid credentials' }));
    await expect(provider.submit(request)).rejects.toBeInstanceOf(
      GenerationAuthError,
    );
    fetchMock.mockReturnValueOnce(json(503, {}));
    await expect(provider.submit(request)).rejects.toBeInstanceOf(
      GenerationUnavailableError,
    );
    fetchMock.mockReturnValueOnce(json(422, { detail: 'video_url invalide' }));
    await expect(provider.submit(request)).rejects.toBeInstanceOf(
      GenerationRejectedError,
    );
  });

  it('n’envoie jamais la clé à une URL hors du domaine Higgsfield', async () => {
    await expect(
      new HiggsfieldGenerationProvider(config()).getStatus(
        'https://evil.example/requests/r1/status',
      ),
    ).rejects.toBeInstanceOf(GenerationRejectedError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ne transmet pas la clé à l’URL de dépôt des fichiers', async () => {
    fetchMock
      .mockReturnValueOnce(
        json(200, {
          upload_url: 'https://storage.example/put',
          public_url: 'https://cdn.example/f.mp4',
          upload_headers: { 'x-amz-tagging': 'retention=temporary' },
        }),
      )
      .mockReturnValueOnce(
        Promise.resolve(new Response(null, { status: 200 })),
      );
    const url = await new HiggsfieldGenerationProvider(config()).uploadInput(
      Buffer.from('x'),
      'video/mp4',
    );
    expect(url).toBe('https://cdn.example/f.mp4');
    const put = call(1);
    expect(put.headers.Authorization).toBeUndefined();
    expect(put.headers['x-amz-tagging']).toBe('retention=temporary');
  });
});
