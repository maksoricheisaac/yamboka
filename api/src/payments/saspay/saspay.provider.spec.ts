import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import {
  ProviderAuthError,
  ProviderInvalidResponseError,
  ProviderRejectedError,
  ProviderUnavailableError,
} from '../payment-provider';
import { SaspayPaymentProvider } from './saspay.provider';

const SECRET_KEY = 'sk_' + 'live_TESTKEYNEVERSENT0123456789';

const config = () =>
  new ConfigService<Env, true>({
    SASPAY_API_BASE_URL: 'https://api.saspay.test/api/v1/',
    SASPAY_API_KEY: SECRET_KEY,
    SASPAY_TIMEOUT_MS: 5000,
  });

const reply = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const ok = (data: unknown, status = 200) =>
  reply(status, { success: true, data, code: status });
const fail = (status: number, error: unknown) =>
  reply(status, { success: false, error, code: status });

const request = {
  amount: 9500,
  currency: 'XAF',
  phone: '+242066063133',
  operator: 'MTN' as const,
  customerId: 'user-1',
  metadata: { paymentId: 'pay-1' },
  idempotencyKey: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  customer: { email: 'awa@example.com', firstName: 'Awa', lastName: 'Sossou' },
  description: 'Pack Starter',
  returnUrl: 'https://app.yamboka.test/app/achats/pay-1',
};

describe('SaspayPaymentProvider', () => {
  let fetchMock: jest.SpiedFunction<typeof fetch>;
  const provider = () => new SaspayPaymentProvider(config());

  beforeEach(() => {
    // Garde-fou : aucun test ne doit jamais atteindre le vrai SasPay (paiements réels).
    fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() =>
        Promise.reject(new Error('Appel réseau non simulé')),
      );
  });
  afterEach(() => fetchMock.mockRestore());

  const sent = (i = 0) => {
    const [url, init] = fetchMock.mock.calls[i];
    return {
      url: url as string,
      init: init!,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: (init?.body ? JSON.parse(init.body as string) : {}) as Record<
        string,
        unknown
      >,
    };
  };

  describe('initiate', () => {
    it('envoie le bon appel softpay et lit la réponse (push sur le téléphone)', async () => {
      fetchMock.mockReturnValue(
        ok(
          {
            message: 'Payment pushed successfully',
            id: '9c3f2a10',
            status: 'PENDING',
            checkout_url: '',
            instructions: '',
          },
          201,
        ),
      );
      const result = await provider().initiate(request);
      expect(result).toEqual({
        reference: '9c3f2a10',
        status: 'pending',
        checkoutUrl: null,
        instructions: null,
      });
      const call = sent();
      expect(call.url).toBe('https://api.saspay.test/api/v1/payments/softpay/');
      expect(call.init.method).toBe('POST');
      expect(call.headers.Authorization).toBe(`Bearer ${SECRET_KEY}`);
      expect(call.headers['Idempotency-Key']).toBe(request.idempotencyKey);
      expect(call.body).toEqual({
        amount: '9500.00', // chaîne décimale, jamais un flottant
        currency: 'XAF',
        country: 'CG',
        network: 'mtn_cg',
        customer: {
          email: 'awa@example.com',
          first_name: 'Awa',
          last_name: 'Sossou',
          phone: '+242066063133',
        },
        description: 'Pack Starter',
        metadata: { paymentId: 'pay-1' },
        return_url: 'https://app.yamboka.test/app/achats/pay-1',
      });
    });

    it('déduit le réseau Airtel de l’opérateur, et un réseau explicite l’emporte', async () => {
      fetchMock.mockImplementation(() =>
        ok({ id: 'a', status: 'PENDING', checkout_url: '' }, 201),
      );
      await provider().initiate({ ...request, operator: 'AIRTEL' });
      await provider().initiate({ ...request, network: 'mtn_cg' });
      expect(sent(0).body.network).toBe('airtel_cg');
      expect(sent(1).body.network).toBe('mtn_cg');
    });

    it('renvoie la checkout_url quand SasPay exige une redirection', async () => {
      fetchMock.mockReturnValue(
        ok(
          {
            id: 'b',
            status: 'PENDING',
            checkout_url: 'https://pay.saspay.me/checkout/abc',
          },
          201,
        ),
      );
      const result = await provider().initiate(request);
      expect(result.checkoutUrl).toBe('https://pay.saspay.me/checkout/abc');
    });

    it('exige une clé d’idempotence (sinon un rejeu créerait un 2e paiement)', async () => {
      await expect(
        provider().initiate({ ...request, idempotencyKey: undefined }),
      ).rejects.toThrow(/idempotence/);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refuse sans informations client, sans appeler SasPay', async () => {
      await expect(
        provider().initiate({ ...request, customer: undefined }),
      ).rejects.toBeInstanceOf(ProviderRejectedError);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('traite un refus 422 comme définitif et ne garde que le code', async () => {
      fetchMock.mockReturnValue(
        fail(422, {
          message: 'Détail interne du gateway',
          code: 'invalid_method',
        }),
      );
      const err = await provider()
        .initiate(request)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ProviderRejectedError);
      expect((err as ProviderRejectedError).code).toBe('invalid_method');
      expect((err as Error).message).not.toContain('Détail interne');
    });

    it('traite une erreur de validation 400 (champ → messages) comme un refus', async () => {
      fetchMock.mockReturnValue(
        fail(400, { amount: ['Ce champ est obligatoire.'] }),
      );
      const err = await provider()
        .initiate(request)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ProviderRejectedError);
      expect((err as ProviderRejectedError).code).toBe('validation_error');
    });

    it.each([500, 502, 503, 429, 409])(
      'HTTP %i : aucune conclusion, on pourra rejouer la même clé',
      async (status) => {
        fetchMock.mockReturnValue(fail(status, { message: 'x', code: 'y' }));
        await expect(provider().initiate(request)).rejects.toBeInstanceOf(
          ProviderUnavailableError,
        );
      },
    );

    it('un timeout ou une coupure réseau n’est PAS un échec définitif', async () => {
      fetchMock.mockRejectedValue(new DOMException('timeout', 'TimeoutError'));
      const err = await provider()
        .initiate(request)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ProviderUnavailableError);
      expect(err).not.toBeInstanceOf(ProviderRejectedError);
    });

    it('signale une clé refusée (401/403) sans jamais écrire la clé dans l’erreur', async () => {
      for (const status of [401, 403]) {
        fetchMock.mockReturnValue(
          fail(status, { message: 'no', code: 'auth' }),
        );
        const err = await provider()
          .initiate(request)
          .catch((e: unknown) => e);
        expect(err).toBeInstanceOf(ProviderAuthError);
        // ProviderAuthError reste une ProviderUnavailableError : les appelants existants n'en concluent rien.
        expect(err).toBeInstanceOf(ProviderUnavailableError);
        expect(String((err as Error).message)).not.toContain(SECRET_KEY);
      }
    });

    it.each([
      ['succès sans data', { success: true }],
      ['succès faux', { success: false, data: { id: 'x', status: 'PENDING' } }],
      ['identifiant absent', { success: true, data: { status: 'PENDING' } }],
      [
        'statut inconnu',
        { success: true, data: { id: 'x', status: 'WHATEVER' } },
      ],
    ])('réponse inexploitable (%s)', async (_label, body) => {
      fetchMock.mockReturnValue(reply(201, body));
      await expect(provider().initiate(request)).rejects.toBeInstanceOf(
        ProviderInvalidResponseError,
      );
    });

    it('un corps non JSON en 200 est une réponse invalide', async () => {
      fetchMock.mockReturnValue(
        Promise.resolve(new Response('<html>oops</html>', { status: 200 })),
      );
      await expect(provider().initiate(request)).rejects.toBeInstanceOf(
        ProviderInvalidResponseError,
      );
    });
  });

  describe('getStatus', () => {
    const tx = (over: Record<string, unknown> = {}) => ({
      message: 'Payment transaction fetched successfully',
      id: '9c3f2a10',
      status: 'SUCCESS',
      requested_amount: '9500.00',
      client_fee: '542.00',
      debited_amount: '10042.00',
      net_amount: '9500.00',
      currency: 'XAF',
      ...over,
    });

    it('lit le statut, le montant demandé et les frais constatés', async () => {
      fetchMock.mockReturnValue(ok(tx()));
      const result = await provider().getStatus('9c3f2a10');
      expect(result).toEqual({
        status: 'success',
        amount: 9500,
        currency: 'XAF',
        clientFee: 542,
        debitedAmount: 10042,
        netAmount: 9500,
      });
      expect(sent().url).toBe(
        'https://api.saspay.test/api/v1/payments/9c3f2a10/verify/',
      );
      expect(sent().init.method).toBe('GET');
      expect(sent().headers.Authorization).toBe(`Bearer ${SECRET_KEY}`);
    });

    it.each([
      ['PENDING', 'pending'],
      ['FAILED', 'failed'],
      ['CANCELLED', 'cancelled'],
    ])('transforme le statut %s en %s', async (saspay, expected) => {
      fetchMock.mockReturnValue(ok(tx({ status: saspay })));
      expect((await provider().getStatus('9c3f2a10')).status).toBe(expected);
    });

    it('encode la référence dans l’URL', async () => {
      fetchMock.mockReturnValue(ok(tx({ id: 'a/b?c' })));
      await provider().getStatus('a/b?c');
      expect(sent().url).toContain('/payments/a%2Fb%3Fc/verify/');
    });

    it('refuse une réponse qui parle d’une autre transaction', async () => {
      fetchMock.mockReturnValue(ok(tx({ id: 'AUTRE' })));
      await expect(provider().getStatus('9c3f2a10')).rejects.toBeInstanceOf(
        ProviderInvalidResponseError,
      );
    });

    it.each([
      ['montant absent', { requested_amount: undefined }],
      ['montant avec centimes', { requested_amount: '9500.50' }],
      ['montant négatif', { requested_amount: '-5.00' }],
      ['montant illisible', { requested_amount: 'beaucoup' }],
      ['devise invalide', { currency: 'xaf' }],
      ['statut inconnu', { status: 'REFUNDED' }],
    ])('réponse inexploitable (%s) : aucune conclusion', async (_l, over) => {
      fetchMock.mockReturnValue(ok(tx(over)));
      await expect(provider().getStatus('9c3f2a10')).rejects.toBeInstanceOf(
        ProviderInvalidResponseError,
      );
    });

    it('404 : transaction inconnue, jamais interprétée comme un échec', async () => {
      fetchMock.mockReturnValue(fail(404, { message: 'n', code: 'nf' }));
      await expect(provider().getStatus('x')).rejects.toBeInstanceOf(
        ProviderInvalidResponseError,
      );
    });

    it('panne ou timeout : fournisseur indisponible (à réessayer)', async () => {
      fetchMock.mockReturnValue(fail(503, {}));
      await expect(provider().getStatus('x')).rejects.toBeInstanceOf(
        ProviderUnavailableError,
      );
      fetchMock.mockRejectedValue(new Error('ECONNRESET'));
      await expect(provider().getStatus('x')).rejects.toBeInstanceOf(
        ProviderUnavailableError,
      );
    });
  });
});
