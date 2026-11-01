import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import type { FeeTier } from '../../billing/fees';
import type { Env } from '../../config/env';
import {
  InitiatePaymentRequest,
  InitiatePaymentResult,
  PaymentProvider,
  PaymentStatusResult,
  ProviderAuthError,
  ProviderInvalidResponseError,
  ProviderRejectedError,
  ProviderUnavailableError,
} from '../payment-provider';
import {
  formatAmount,
  mapSaspayStatus,
  parseOptionalWholeAmount,
  parseWholeAmount,
  SASPAY_NETWORK_BY_OPERATOR,
} from './saspay.mapper';

interface SaspayBody {
  success?: boolean;
  data?: unknown;
  error?: unknown;
}

const TIERS_TTL_MS = 60 * 60 * 1000;

const num = z.union([z.number(), z.string()]);
const ratesSchema = z.array(
  z.object({
    country_code: z.string(),
    network_code: z.string(),
    payin: z.object({
      available: z.boolean(),
      tiers: z.array(
        z.object({
          min_amount: num,
          max_amount: num.nullable(),
          percent: num,
          fixed: num.nullish(),
          floor_amount: num.nullish(),
          cap_amount: num.nullish(),
          fee_charge_mode: z.enum(['ADD_ON', 'DEDUCTED']).optional(),
        }),
      ),
    }),
  }),
);

/**
 * SasPay (PAYMENT_PROVIDER=saspay), API https://docs.saspay.me. Les paiements sont RÉELS : aucun bac à sable
 * n'existe sur ce compte. La clé n'est utilisée que dans l'en-tête Authorization, jamais écrite dans un message.
 *
 * Un timeout ne prouve pas l'échec : il lève ProviderUnavailableError et l'appelant doit rejouer la MÊME
 * Idempotency-Key (SasPay renvoie alors la réponse du premier appel), puis vérifier le statut.
 */
export class SaspayPaymentProvider extends PaymentProvider {
  readonly name = 'saspay';
  /** Idempotency-Key supportée sur POST /payments/softpay/ (même clé + même corps = même réponse). */
  override readonly idempotent = true;
  /** Un push mobile money expire vite : au-delà d'une heure sans confirmation, on cesse d'attendre. */
  override readonly pendingTtlMs = 60 * 60 * 1000;
  private readonly tiersCache = new Map<
    string,
    { at: number; tiers: FeeTier[] }
  >();
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(config: ConfigService<Env, true>) {
    super();
    this.baseUrl = config
      .get('SASPAY_API_BASE_URL', { infer: true })
      .replace(/\/+$/, '');
    this.apiKey = config.get('SASPAY_API_KEY', { infer: true }) ?? '';
    this.timeoutMs = config.get('SASPAY_TIMEOUT_MS', { infer: true });
  }

  override networkFor(operator: 'MTN' | 'AIRTEL'): string {
    return SASPAY_NETWORK_BY_OPERATOR[operator];
  }

  /**
   * Tarif d'encaissement d'un réseau pour CE compte (GET /pricing/my-rates/), gardé 1 h en mémoire.
   * Si SasPay est injoignable, le dernier tarif connu sert encore ; sans tarif connu, l'erreur remonte.
   * Les champs `min_fee` / `min_fee_basis_amount` (non documentés) sont ignorés : sur nos packs, le pourcentage domine.
   */
  override async getPayinTiers(
    country: string,
    network: string,
  ): Promise<FeeTier[]> {
    const key = `${country}:${network}`;
    const cached = this.tiersCache.get(key);
    if (cached && Date.now() - cached.at < TIERS_TTL_MS) return cached.tiers;
    let data: unknown;
    try {
      data = await this.request('GET', '/pricing/my-rates/');
    } catch (e) {
      if (cached && e instanceof ProviderUnavailableError) return cached.tiers;
      throw e;
    }
    const rates = ratesSchema.safeParse(data);
    if (!rates.success) {
      throw new ProviderInvalidResponseError('SasPay : tarifs illisibles.');
    }
    const rate = rates.data.find(
      (r) => r.country_code === country && r.network_code === network,
    );
    if (!rate || !rate.payin.available) {
      throw new ProviderRejectedError(
        'invalid_method',
        'Réseau non disponible à l’encaissement.',
      );
    }
    const tiers: FeeTier[] = rate.payin.tiers.map((t) => ({
      minAmount: t.min_amount,
      maxAmount: t.max_amount,
      percent: t.percent,
      fixed: t.fixed ?? 0,
      floorAmount: t.floor_amount ?? null,
      capAmount: t.cap_amount ?? null,
      feeChargeMode: t.fee_charge_mode,
    }));
    this.tiersCache.set(key, { at: Date.now(), tiers });
    return tiers;
  }

  async initiate(
    request: InitiatePaymentRequest,
  ): Promise<InitiatePaymentResult> {
    if (!request.idempotencyKey) {
      // Erreur de programmation, pas une réponse du fournisseur : sans clé, un rejeu créerait un 2e paiement.
      throw new Error('SasPay : une clé d’idempotence est obligatoire.');
    }
    if (!request.customer) {
      throw new ProviderRejectedError(
        'invalid_customer',
        'Les informations du client sont incomplètes.',
      );
    }
    const network =
      request.network ?? SASPAY_NETWORK_BY_OPERATOR[request.operator];
    const body = {
      amount: formatAmount(request.amount),
      currency: request.currency,
      country: request.country ?? 'CG',
      network,
      customer: {
        email: request.customer.email,
        first_name: request.customer.firstName,
        last_name: request.customer.lastName,
        phone: request.phone,
      },
      ...(request.description ? { description: request.description } : {}),
      metadata: request.metadata,
      ...(request.returnUrl ? { return_url: request.returnUrl } : {}),
    };
    const data = await this.callObject('POST', '/payments/softpay/', {
      body,
      idempotencyKey: request.idempotencyKey,
    });
    const id = data.id;
    if (typeof id !== 'string' || !id.trim()) {
      throw new ProviderInvalidResponseError('SasPay : identifiant absent.');
    }
    const checkoutUrl =
      typeof data.checkout_url === 'string' && data.checkout_url.trim()
        ? data.checkout_url.trim()
        : null;
    const instructions =
      typeof data.instructions === 'string' && data.instructions.trim()
        ? data.instructions.trim()
        : null;
    return {
      reference: id,
      status: mapSaspayStatus(data.status),
      checkoutUrl,
      instructions,
    };
  }

  /** GET /payments/{id}/verify/ : SasPay revérifie en direct auprès de son gateway tant que la transaction est PENDING. */
  async getStatus(reference: string): Promise<PaymentStatusResult> {
    const data = await this.callObject(
      'GET',
      `/payments/${encodeURIComponent(reference)}/verify/`,
    );
    // La réponse doit parler de NOTRE transaction : sinon on n'en tire aucune conclusion.
    if (data.id !== reference) {
      throw new ProviderInvalidResponseError(
        'SasPay : transaction différente de celle demandée.',
      );
    }
    const currency = data.currency;
    if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) {
      throw new ProviderInvalidResponseError('SasPay : devise invalide.');
    }
    return {
      status: mapSaspayStatus(data.status),
      amount: parseWholeAmount(data.requested_amount, 'requested_amount'),
      currency,
      clientFee: parseOptionalWholeAmount(data.client_fee, 'client_fee'),
      debitedAmount: parseOptionalWholeAmount(
        data.debited_amount,
        'debited_amount',
      ),
      netAmount: parseOptionalWholeAmount(data.net_amount, 'net_amount'),
    };
  }

  private async callObject(
    method: 'GET' | 'POST',
    path: string,
    options: { body?: unknown; idempotencyKey?: string } = {},
  ): Promise<Record<string, unknown>> {
    const data = await this.request(method, path, options);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new ProviderInvalidResponseError('Réponse SasPay inexploitable.');
    }
    return data as Record<string, unknown>;
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    options: { body?: unknown; idempotencyKey?: string } = {},
  ): Promise<unknown> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          ...(options.idempotencyKey
            ? { 'Idempotency-Key': options.idempotencyKey }
            : {}),
        },
        ...(options.body === undefined
          ? {}
          : { body: JSON.stringify(options.body) }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      // Réseau coupé ou délai dépassé : le paiement a pu aboutir, aucune conclusion.
      throw new ProviderUnavailableError('SasPay injoignable.');
    }

    let json: SaspayBody | null = null;
    try {
      json = (await res.json()) as SaspayBody;
    } catch {
      json = null;
    }

    if (res.status === 401 || res.status === 403) {
      throw new ProviderAuthError(
        `SasPay a refusé la clé API (HTTP ${res.status}).`,
      );
    }
    // Limite de débit, panne côté SasPay, ou 409 (clé d'idempotence encore en cours) : on réessaiera.
    if (res.status === 429 || res.status === 409 || res.status >= 500) {
      throw new ProviderUnavailableError(
        `SasPay temporairement indisponible (HTTP ${res.status}).`,
      );
    }
    if (res.status === 404) {
      throw new ProviderInvalidResponseError(
        'SasPay ne connaît pas cette transaction.',
      );
    }
    if (res.status >= 400) {
      // Refus définitif (validation, réseau inactif, aucune route…). Seul le code métier est conservé :
      // le message détaillé du fournisseur n'est ni exposé à l'utilisateur ni recopié ici.
      const err = json?.error as { code?: unknown } | undefined;
      const code =
        typeof err?.code === 'string' ? err.code : 'validation_error';
      throw new ProviderRejectedError(
        code,
        `SasPay a refusé la demande (${code}).`,
      );
    }
    if (json?.success !== true || !json.data || typeof json.data !== 'object') {
      throw new ProviderInvalidResponseError('Réponse SasPay inexploitable.');
    }
    return json.data;
  }
}
