import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import {
  GenerationAuthError,
  GenerationProvider,
  GenerationRejectedError,
  GenerationRunStatus,
  GenerationStatusResult,
  GenerationUnavailableError,
  SubmitGenerationRequest,
  SubmitGenerationResult,
} from './generation-provider';

/** Statuts Higgsfield (docs.higgsfield.ai, « Requests and lifecycle ») → statuts normalisés. */
const STATUS: Record<string, GenerationRunStatus> = {
  queued: 'queued',
  in_progress: 'processing',
  completed: 'completed',
  failed: 'failed',
  nsfw: 'rejected',
  canceled: 'canceled',
};

interface HiggsfieldBody {
  status?: string;
  request_id?: string;
  status_url?: string;
  cancel_url?: string;
  error?: unknown;
  detail?: unknown;
  video?: { url?: string };
  images?: { url?: string }[];
}

const TIMEOUT_MS = 30_000;

/**
 * Higgsfield (GENERATION_PROVIDER=higgsfield). Chaque génération soumise est payante.
 * Authentification : en-tête « Authorization: Key <id>:<secret> », uniquement depuis le serveur.
 */
export class HiggsfieldGenerationProvider extends GenerationProvider {
  readonly name = 'higgsfield';
  private readonly baseUrl: string;
  private readonly authorization: string;

  constructor(config: ConfigService<Env, true>) {
    super();
    this.baseUrl = config
      .get('HF_API_URL', { infer: true })
      .replace(/\/+$/, '');
    const id = config.get('HF_API_KEY_ID', { infer: true }) ?? '';
    let secret = config.get('HF_API_KEY_SECRET', { infer: true }) ?? '';
    // La console affiche parfois la clé sous la forme « identifiant:secret » : on n'en garde que le secret.
    if (secret.startsWith(`${id}:`)) secret = secret.slice(id.length + 1);
    this.authorization = `Key ${id}:${secret}`;
  }

  private async call(
    url: string,
    init: RequestInit & { headers?: Record<string, string> } = {},
  ): Promise<{ status: number; body: HiggsfieldBody }> {
    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        headers: { Authorization: this.authorization, ...init.headers },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new GenerationUnavailableError('Higgsfield injoignable.');
    }
    if (res.status === 401 || res.status === 403) {
      throw new GenerationAuthError(
        'Identifiants Higgsfield refusés (HF_API_KEY_ID / HF_API_KEY_SECRET) ou droits insuffisants.',
      );
    }
    if (res.status === 429 || res.status >= 500) {
      throw new GenerationUnavailableError(
        `Higgsfield indisponible (HTTP ${res.status}).`,
      );
    }
    const text = await res.text();
    let body: HiggsfieldBody = {};
    if (text) {
      try {
        body = JSON.parse(text) as HiggsfieldBody;
      } catch {
        throw new GenerationUnavailableError(
          'Réponse Higgsfield illisible (non JSON).',
        );
      }
    }
    return { status: res.status, body };
  }

  /** Message d'erreur du fournisseur, tronqué (le détail peut être un objet). */
  private reason(body: HiggsfieldBody): string {
    const raw = body.error ?? body.detail;
    if (!raw) return 'raison non précisée';
    const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
    return text.slice(0, 300);
  }

  async submit(
    request: SubmitGenerationRequest,
  ): Promise<SubmitGenerationResult> {
    const { status, body } = await this.call(
      `${this.baseUrl}/${request.model.replace(/^\/+/, '')}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': request.idempotencyKey,
        },
        body: JSON.stringify(request.input),
      },
    );
    if (status >= 400) {
      throw new GenerationRejectedError(
        `Demande refusée par Higgsfield (HTTP ${status}) : ${this.reason(body)}`,
      );
    }
    if (!body.request_id || !body.status_url) {
      throw new GenerationUnavailableError(
        'Réponse Higgsfield inattendue : request_id ou status_url manquant.',
      );
    }
    return {
      requestId: body.request_id,
      statusUrl: body.status_url,
      cancelUrl: body.cancel_url,
      status: STATUS[body.status ?? 'queued'] ?? 'queued',
    };
  }

  async getStatus(statusUrl: string): Promise<GenerationStatusResult> {
    this.assertOwnUrl(statusUrl);
    const { status, body } = await this.call(statusUrl);
    if (status >= 400) {
      throw new GenerationUnavailableError(
        `Statut illisible chez Higgsfield (HTTP ${status}).`,
      );
    }
    const mapped = body.status ? STATUS[body.status] : undefined;
    if (!mapped) {
      throw new GenerationUnavailableError(
        `Statut Higgsfield inconnu : ${String(body.status)}`,
      );
    }
    if (mapped !== 'completed') {
      return {
        status: mapped,
        error:
          mapped === 'failed' || mapped === 'rejected'
            ? this.reason(body)
            : undefined,
      };
    }
    const outputUrl = body.video?.url ?? body.images?.[0]?.url;
    if (!outputUrl) {
      // Terminé sans fichier : on ne conclut rien, le rattrapage réessaiera.
      throw new GenerationUnavailableError(
        'Génération terminée mais aucun fichier fourni par Higgsfield.',
      );
    }
    return { status: 'completed', outputUrl };
  }

  async cancel(cancelUrl: string): Promise<void> {
    this.assertOwnUrl(cancelUrl);
    const { status, body } = await this.call(cancelUrl, { method: 'POST' });
    if (status >= 400) {
      throw new GenerationRejectedError(
        `Annulation impossible (HTTP ${status}) : ${this.reason(body)}`,
      );
    }
  }

  async uploadInput(data: Buffer, contentType: string): Promise<string> {
    const { status, body } = await this.call(
      `${this.baseUrl}/files/generate-upload-url`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content_type: contentType }),
      },
    );
    const upload = body as {
      public_url?: string;
      upload_url?: string;
      upload_headers?: Record<string, string>;
    };
    if (status >= 400 || !upload.upload_url || !upload.public_url) {
      throw new GenerationUnavailableError(
        `URL de dépôt Higgsfield indisponible (HTTP ${status}).`,
      );
    }
    let res: Response;
    try {
      // Les identifiants Higgsfield ne sont JAMAIS envoyés à l'URL de dépôt (stockage tiers).
      res = await fetch(upload.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': contentType, ...upload.upload_headers },
        body: new Uint8Array(data),
        signal: AbortSignal.timeout(120_000),
      });
    } catch {
      throw new GenerationUnavailableError('Dépôt du fichier impossible.');
    }
    if (!res.ok) {
      throw new GenerationUnavailableError(
        `Dépôt du fichier refusé (HTTP ${res.status}).`,
      );
    }
    return upload.public_url;
  }

  async diagnose(): Promise<{ ok: boolean; detail: string }> {
    // Demander une URL de dépôt valide les identifiants sans lancer de génération (donc sans coût).
    try {
      const { status } = await this.call(
        `${this.baseUrl}/files/generate-upload-url`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content_type: 'image/jpeg' }),
        },
      );
      return status < 400
        ? { ok: true, detail: 'Identifiants Higgsfield acceptés.' }
        : {
            ok: false,
            detail: `Higgsfield a répondu HTTP ${status} : vérifiez HF_API_URL.`,
          };
    } catch (e) {
      return { ok: false, detail: (e as Error).message };
    }
  }

  /** N'envoie la clé qu'à Higgsfield : une URL de statut venue d'ailleurs est refusée. */
  private assertOwnUrl(url: string): void {
    if (new URL(url).origin !== new URL(this.baseUrl).origin) {
      throw new GenerationRejectedError(
        'URL de suivi hors du domaine Higgsfield : refusée.',
      );
    }
  }
}
