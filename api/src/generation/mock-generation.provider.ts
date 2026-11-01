import { randomUUID } from 'node:crypto';
import {
  GenerationProvider,
  GenerationStatusResult,
  SubmitGenerationRequest,
  SubmitGenerationResult,
} from './generation-provider';

/** Un prompt contenant ce marqueur fait échouer la génération simulée (pour essayer le parcours d'échec). */
export const MOCK_FAIL_MARKER = '__echec__';

/**
 * Faux fournisseur (GENERATION_PROVIDER=mock) : aucune requête réseau, aucun coût.
 * Une génération aboutit après `delaySeconds` (0 = tout de suite, utile en test) ; l'heure de soumission est
 * portée par l'URL de suivi, le fournisseur lui-même ne garde aucun état.
 */
export class MockGenerationProvider extends GenerationProvider {
  readonly name = 'mock';

  constructor(private readonly delaySeconds = 0) {
    super();
  }

  submit(request?: SubmitGenerationRequest): Promise<SubmitGenerationResult> {
    const requestId = `MOCK-${randomUUID()}`;
    const prompt = String(request?.input?.prompt ?? '');
    const fail = prompt.includes(MOCK_FAIL_MARKER) ? 1 : 0;
    return Promise.resolve({
      requestId,
      statusUrl: `mock://requests/${requestId}/status?t=${Date.now()}&fail=${fail}`,
      cancelUrl: `mock://requests/${requestId}/cancel`,
      status: 'queued',
    });
  }

  getStatus(statusUrl?: string): Promise<GenerationStatusResult> {
    const params = new URLSearchParams(statusUrl?.split('?')[1] ?? '');
    const startedAt = Number(params.get('t') ?? 0);
    const elapsed = (Date.now() - startedAt) / 1000;
    if (elapsed < this.delaySeconds) {
      return Promise.resolve({ status: 'processing' });
    }
    if (params.get('fail') === '1') {
      return Promise.resolve({
        status: 'failed',
        error: 'Échec simulé du fournisseur.',
      });
    }
    return Promise.resolve({
      status: 'completed',
      outputUrl: 'mock://output.mp4',
    });
  }

  cancel(): Promise<void> {
    return Promise.resolve();
  }

  uploadInput(): Promise<string> {
    return Promise.resolve('mock://input');
  }

  diagnose(): Promise<{ ok: boolean; detail: string }> {
    return Promise.resolve({
      ok: true,
      detail: 'Fournisseur simulé : aucun appel réel.',
    });
  }
}
