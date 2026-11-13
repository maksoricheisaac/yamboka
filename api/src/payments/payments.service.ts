import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  CreatePaymentInput,
  Page,
  PaymentQuoteView,
  PaymentReceipt,
  PaymentStatus,
  PaymentView,
  QuotePaymentInput,
  SimulatePaymentInput,
} from '@yamboka/shared';
import { CUSTOM_PURCHASE_LABEL, buildPage, clampPage } from '@yamboka/shared';
import { randomUUID } from 'node:crypto';
import { firstPurchaseBonusPercent } from '../billing/bonus';
import { customAmount, isSoldAtLoss } from '../billing/custom-purchase';
import {
  computeSendAmount,
  FeeComputationError,
  type FeeTier,
} from '../billing/fees';
import { AuditService } from '../audit/audit.service';
import { lockUserRow } from '../common/locks';
import type { Env } from '../config/env';
import { CreditsService } from '../credits/credits.service';
import { EmailService } from '../email/email.service';
import type {
  CreditPack,
  Payment,
  PaymentCheckKind,
  Prisma,
} from '../generated/prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { JobQueue } from '../queue/job-queue';
import { SettingsService } from '../settings/settings.service';
import { CountryCatalogService } from './catalog/country-catalog.service';
import { MockPaymentProvider } from './mock-payment.provider';
import {
  legacyNetworkCode,
  operatorOf,
  type CountryConfig,
  type NetworkConfig,
} from './payment-countries';
import { isCfa, PaymentOffersService } from './payment-offers.service';
import { PaymentProviders } from './payment-providers.service';
import {
  InitiatePaymentRequest,
  PaymentProvider,
  type PaymentStatusResult,
  ProviderAuthError,
  ProviderInvalidResponseError,
  ProviderRejectedError,
  ProviderUnavailableError,
} from './payment-provider';

/** Un paiement jamais initié chez le fournisseur au bout de ce délai est déclaré échoué (on cesse de rejouer l'appel). */
const UNSTARTED_GIVE_UP_MS = 10 * 60 * 1000;
/** Fenêtre pendant laquelle on revérifie un paiement déclaré échoué pour délai, au cas où il aurait abouti. */
const LATE_SUCCESS_WINDOW_MS = 48 * 3600 * 1000;
/** Un double clic ou un double envoi dans cette fenêtre renvoie le paiement déjà créé. */
const DEDUPE_WINDOW_MS = 2 * 60 * 1000;
/** Motif d'un échec dû au seul délai : un succès tardif confirmé par le fournisseur reste crédité. */
export const TIMEOUT_REASON = 'Délai de confirmation dépassé';
/** Motif d'un échec dû à un montant annoncé différent de celui demandé : jamais crédité automatiquement. */
export const MISMATCH_REASON =
  'Montant incohérent : vérification manuelle requise';

const OPEN: PaymentStatus[] = ['INITIATED', 'PENDING'];

/**
 * Au-delà de ce délai, un paiement confirmé mais toujours pas crédité, ou un paiement resté ouvert, est signalé
 * à l'administration (alerte du tableau de bord) : la réconciliation automatique n'a pas suffi.
 */
export const ANOMALY_ALERT_AFTER_MS = 30 * 60 * 1000;

/** Nombre de paiements confirmés non crédités repris à chaque passage de la réconciliation. */
const UNCREDITED_BATCH = 100;

/** Ce qui a déclenché une vérification : tracé dans PaymentCheck. */
export type CheckSource =
  'api' | 'callback' | 'webhook' | 'reconcile' | 'admin';

/** Résultat d'une régularisation administrative réussie. */
export interface SettlementResult {
  credited: true;
  credits: number;
  bonusCredits: number;
  balance: number;
  /** Ce sur quoi repose l'attribution : confirmation du fournisseur, ou preuve apportée par l'administrateur. */
  verifiedBy: 'provider' | 'admin_proof';
}

/** Texte de la notification de crédit : une régularisation dit à quel paiement elle se rapporte. */
function creditedBody(
  origin: 'AUTO' | 'MANUAL',
  credits: number,
  bonus: number,
  reference: string,
): string {
  const total = credits + bonus;
  const offered =
    bonus > 0 ? `, dont ${bonus} offerts pour votre premier achat` : '';
  return origin === 'MANUAL'
    ? `${total} crédits ont été ajoutés à votre compte${offered} après régularisation de votre paiement ${reference}.`
    : `${total} crédits ont été ajoutés à votre compte${offered}.`;
}
type PaymentWithPack = Payment & { pack: CreditPack | null };

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: PaymentProviders,
    private readonly offers: PaymentOffersService,
    private readonly catalog: CountryCatalogService,
    private readonly mock: MockPaymentProvider,
    private readonly credits: CreditsService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly queue: JobQueue,
    private readonly email: EmailService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // ───────────── Création ─────────────

  /**
   * Résout et valide une commande SANS rien écrire : pays ouvert, moyen de paiement du pays, pack ou quantité,
   * montant recalculé ici (jamais lu du navigateur), frais d'encaissement et garde « jamais à perte ».
   * `create` et `quote` passent par cette seule fonction : le devis ne peut donc pas différer du paiement.
   */
  private async prepare(
    input: QuotePaymentInput,
    opts: { requireNetwork: boolean },
  ): Promise<Prepared> {
    const country = (await this.offers.enabledCountries()).find(
      (c) => c.iso === input.country,
    );
    if (!country) {
      throw new UnprocessableEntityException({
        code: 'COUNTRY_NOT_SUPPORTED',
        message: 'Le paiement n’est pas encore disponible dans ce pays.',
      });
    }
    const provider = this.providers.forCountry();

    const networkCode =
      input.network ??
      (input.operator
        ? legacyNetworkCode(input.operator, country.iso)
        : undefined);
    let network: NetworkConfig | undefined;
    if (networkCode !== undefined || opts.requireNetwork) {
      network = networkCode
        ? this.catalog.findNetwork(country, networkCode)
        : undefined;
      if (!network) {
        throw new UnprocessableEntityException({
          code: 'PAYMENT_METHOD_UNAVAILABLE',
          message:
            'Ce moyen de paiement n’est pas disponible dans le pays choisi.',
        });
      }
    }

    let pack: CreditPack | null = null;
    let credits: number;
    let amount: number;
    let bonusPercent = 0;
    if (input.packId !== undefined) {
      pack = await this.offers.findPack(country, input.packId);
      if (!pack) {
        throw new NotFoundException({
          code: 'PACK_NOT_FOUND',
          message: 'Ce pack n’existe pas ou n’est plus proposé.',
        });
      }
      credits = pack.credits;
      amount = pack.price;
      bonusPercent = firstPurchaseBonusPercent(pack.firstPurchaseBonusPercent, {
        enabled: await this.settings.get('firstPurchaseBonusEnabled'),
        defaultPercent: await this.settings.get(
          'firstPurchaseBonusDefaultPercent',
        ),
      });
    } else {
      const rules = await this.offers.customRules(country);
      if (!rules) {
        throw new UnprocessableEntityException({
          code: 'CUSTOM_PURCHASE_UNAVAILABLE',
          message:
            'L’achat d’une quantité libre de crédits n’est pas disponible dans ce pays. Choisissez un pack.',
        });
      }
      credits = input.credits as number;
      if (credits < rules.minCredits || credits > rules.maxCredits) {
        throw new UnprocessableEntityException({
          code: 'CUSTOM_CREDITS_OUT_OF_RANGE',
          message: `Choisissez entre ${rules.minCredits} et ${rules.maxCredits} crédits.`,
        });
      }
      // Prix recalculé ici ; aucun bonus (réservé aux packs).
      amount = customAmount(credits, rules.unitPrice);
    }

    // Montant à envoyer au fournisseur (prix affiché moins les frais absorbés) : calculé AVANT toute écriture,
    // pour qu'une panne de tarification ne laisse aucun paiement en base.
    const plan = network
      ? await this.planAmount(provider, country.iso, network.code, amount)
      : null;

    if (pack === null && network && isCfa(country.currency)) {
      const [circuitLossPercent, fcfaPerCredit] = await Promise.all([
        this.settings.get('circuitLossPercent'),
        this.settings.get('hfCostFcfaPerCredit'),
      ]);
      if (
        isSoldAtLoss({
          displayedPrice: amount,
          sentAmount: plan?.sentAmount ?? amount,
          credits,
          circuitLossPercent,
          fcfaPerCredit,
        })
      ) {
        // Frais fixes trop lourds sur un petit montant : on ne vend jamais à perte.
        throw new UnprocessableEntityException({
          code: 'AMOUNT_TOO_LOW',
          message:
            'Ce montant est trop faible pour ce moyen de paiement. Choisissez une quantité plus élevée ou un pack.',
        });
      }
    }

    return {
      country,
      provider,
      network,
      pack,
      credits,
      amount,
      bonusPercent,
      plan,
    };
  }

  async quote(input: QuotePaymentInput): Promise<PaymentQuoteView> {
    const p = await this.prepare(input, { requireNetwork: false });
    return {
      country: p.country.iso,
      currency: p.country.currency,
      amount: p.amount,
      credits: p.credits,
      firstPurchaseBonusPercent: p.bonusPercent,
      custom: p.pack === null,
      packName: p.pack?.name ?? CUSTOM_PURCHASE_LABEL,
    };
  }

  async create(
    userId: string,
    input: CreatePaymentInput,
  ): Promise<PaymentView> {
    const order = await this.prepare(input, { requireNetwork: true });
    const { country, provider, pack, credits, amount, bonusPercent, plan } =
      order;
    const network = order.network as NetworkConfig;
    const operator = operatorOf(network.code);
    // Le numéro payeur doit appartenir au pays du moyen de paiement (même indicatif).
    if (!input.phone.startsWith(`+${country.dial}`)) {
      throw new BadRequestException({
        code: 'PHONE_COUNTRY_MISMATCH',
        message: `Ce moyen de paiement exige un numéro ${country.name} (+${country.dial}).`,
      });
    }
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, firstName: true, lastName: true },
    });

    // Création sérialisée par utilisateur : deux envois simultanés identiques ne donnent qu'un paiement.
    const payment = await this.prisma.$transaction(async (tx) => {
      await lockUserRow(tx, userId);
      const recent = await tx.payment.findFirst({
        where: {
          userId,
          packId: pack?.id ?? null,
          ...(pack ? {} : { credits }),
          country: country.iso,
          network: network.code,
          payerPhone: input.phone,
          status: { in: OPEN },
          createdAt: { gte: new Date(Date.now() - DEDUPE_WINDOW_MS) },
        },
        orderBy: { createdAt: 'desc' },
        include: { pack: true },
      });
      if (recent) return { row: recent, created: false };

      const id = randomUUID();
      const label = pack?.name ?? CUSTOM_PURCHASE_LABEL;
      // Requête figée ici et rejouée à l'identique : même clé d'idempotence, même corps (sinon SasPay répond 409).
      const request: InitiatePaymentRequest = {
        amount: plan?.sentAmount ?? amount,
        currency: country.currency,
        phone: input.phone,
        operator,
        customerId: userId,
        metadata: { paymentId: id, userId, packId: pack?.id ?? 'custom' },
        network: network.code,
        ...(provider.idempotent
          ? {
              country: country.iso,
              idempotencyKey: randomUUID(),
              customer: {
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
              },
              description: `Yamboka — ${label}`,
              returnUrl: `${this.config.get('APP_URL', { infer: true })}/app/credits/paiement/${id}`,
            }
          : {}),
      };
      // Crédits de base. Le bonus de premier achat n'est pas connu ici : il est jugé à la confirmation
      // (premier paiement RÉUSSI du compte) ; seul son pourcentage promis est figé pour que le client reçoive
      // ce qui lui a été affiché. Un achat sur mesure n'en a jamais (0).
      const row = await tx.payment.create({
        data: {
          id,
          userId,
          packId: pack?.id ?? null,
          country: country.iso,
          currency: country.currency,
          amount,
          sentAmount: plan?.sentAmount ?? null,
          network: network.code,
          countryName: country.name,
          methodCode: network.methodCode,
          methodName: network.name,
          feeSnapshot: plan?.feeSnapshot ?? undefined,
          idempotencyKey: request.idempotencyKey ?? null,
          providerRequest: request as unknown as Prisma.InputJsonValue,
          credits,
          bonusCredits: 0,
          firstPurchaseBonusPercent: bonusPercent,
          gateway: provider.name,
          operator,
          payerPhone: input.phone,
          status: 'INITIATED',
        },
        include: { pack: true },
      });
      // Le numéro payeur est enregistré dans le profil au premier achat s'il était vide (UF-21).
      await tx.user.updateMany({
        where: { id: userId, phone: null },
        data: { phone: input.phone },
      });
      return { row, created: true };
    });

    if (!payment.created) return this.toView(payment.row);
    return this.start(payment.row);
  }

  /**
   * Montant à envoyer au fournisseur : le plus grand A tel que A + frais(A) ≤ prix affiché (les frais sont absorbés
   * par Yamboka). Tarif : surcharge administrateur active, sinon tarif du compte chez le fournisseur.
   * Renvoie null quand le fournisseur ne facture rien (simulé) : on envoie alors le prix affiché.
   */
  private async planAmount(
    provider: PaymentProvider,
    countryIso: string,
    network: string,
    price: number,
  ): Promise<{
    sentAmount: number;
    network: string;
    feeSnapshot: Prisma.InputJsonValue;
  } | null> {
    if (!provider.chargesFees) return null;
    const override = await this.prisma.feeRateOverride.findFirst({
      where: { country: countryIso, network, active: true },
    });
    let tiers: FeeTier[] | null;
    let source: 'override' | 'provider';
    try {
      if (override) {
        source = 'override';
        tiers = [
          {
            minAmount: 0,
            maxAmount: null,
            percent: override.percent.toString(),
            fixed: override.fixed.toString(),
            floorAmount: override.floorAmount?.toString() ?? null,
            capAmount: override.capAmount?.toString() ?? null,
            feeChargeMode: 'ADD_ON',
          },
        ];
      } else {
        source = 'provider';
        tiers = await provider.getPayinTiers(countryIso, network);
      }
      if (!tiers) return null;
      const computed = computeSendAmount(price, tiers);
      return {
        sentAmount: computed.sentAmount,
        network,
        feeSnapshot: {
          source,
          tiers: tiers as unknown as Prisma.InputJsonValue,
          fee: computed.fee,
          total: computed.total,
          absorbed: computed.absorbed,
          at: new Date().toISOString(),
        },
      };
    } catch (e) {
      if (e instanceof ProviderRejectedError) {
        throw new UnprocessableEntityException({
          code: 'PAYMENT_METHOD_UNAVAILABLE',
          message: rejectionMessage(e.code),
        });
      }
      if (
        e instanceof ProviderUnavailableError ||
        e instanceof ProviderInvalidResponseError ||
        e instanceof FeeComputationError
      ) {
        this.logger.error(
          `Tarification du paiement impossible (${e.constructor.name})`,
        );
        throw new ServiceUnavailableException({
          code: 'PAYMENT_PROVIDER_UNAVAILABLE',
          message:
            'Le service de paiement est momentanément indisponible. Aucun montant n’a été débité. Réessayez dans quelques minutes.',
        });
      }
      throw e;
    }
  }

  private requestOf(p: Payment): InitiatePaymentRequest {
    if (p.providerRequest) {
      return p.providerRequest as unknown as InitiatePaymentRequest;
    }
    // Paiement antérieur à la conservation de la requête (fournisseur simulé uniquement).
    return {
      amount: p.sentAmount ?? p.amount,
      currency: p.currency,
      phone: p.payerPhone,
      operator: p.operator,
      customerId: p.userId,
      metadata: {
        paymentId: p.id,
        userId: p.userId,
        packId: p.packId ?? 'custom',
      },
    };
  }

  /**
   * Démarre (ou REJOUE) l'initiation chez le fournisseur. Avec un fournisseur idempotent, une panne ou un délai
   * dépassé ne prouve rien : le paiement reste INITIATED et on rejoue la MÊME requête (même clé) jusqu'à obtenir
   * la réponse du premier appel. On ne conclut « échoué » que sur un refus explicite du fournisseur.
   */
  private async start(payment: PaymentWithPack): Promise<PaymentView> {
    const provider = this.providers.byName(payment.gateway);
    try {
      const started = await provider.initiate(this.requestOf(payment));
      // Conditionnel : un rejeu concurrent qui obtient la même référence ne change rien, et un paiement déjà
      // avancé n'est jamais ramené en arrière.
      await this.prisma.payment.updateMany({
        where: { id: payment.id, externalReference: null },
        data: {
          externalReference: started.reference,
          status: 'PENDING',
          checkoutUrl: started.checkoutUrl ?? null,
        },
      });
      return this.toView(
        await this.prisma.payment.findUniqueOrThrow({
          where: { id: payment.id },
          include: { pack: true },
        }),
      );
    } catch (e) {
      if (e instanceof ProviderRejectedError) {
        await this.prisma.payment.updateMany({
          where: {
            id: payment.id,
            status: { in: OPEN },
            externalReference: null,
          },
          data: {
            status: 'FAILED',
            failureReason: 'Paiement refusé par le fournisseur',
            lastProviderStatus: {
              rejected: e.code,
              at: new Date().toISOString(),
            },
          },
        });
        throw new UnprocessableEntityException({
          code: 'PAYMENT_REJECTED',
          message: rejectionMessage(e.code),
        });
      }
      if (
        e instanceof ProviderUnavailableError ||
        e instanceof ProviderInvalidResponseError
      ) {
        if (provider.idempotent) {
          // Résultat incertain : le paiement a peut-être été créé chez le fournisseur.
          const kind =
            e instanceof ProviderAuthError
              ? 'auth'
              : e instanceof ProviderUnavailableError
                ? 'unavailable'
                : 'invalid_response';
          if (kind === 'auth') {
            this.logger.error(
              `Paiement ${payment.id} : clé API ${provider.name} refusée, à corriger d’urgence`,
            );
          } else {
            this.logger.warn(
              `Paiement ${payment.id} : initiation incertaine (${kind}), rejeu prévu`,
            );
          }
          const row = await this.prisma.payment.update({
            where: { id: payment.id },
            data: {
              lastProviderStatus: {
                error: kind,
                at: new Date().toISOString(),
              },
            },
            include: { pack: true },
          });
          return this.toView(row);
        }
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: 'FAILED',
            failureReason: 'Service de paiement indisponible',
          },
        });
        throw new ServiceUnavailableException({
          code: 'PAYMENT_PROVIDER_UNAVAILABLE',
          message:
            'Le service de paiement est momentanément indisponible. Aucun montant n’a été débité. Réessayez dans quelques minutes.',
        });
      }
      throw e;
    }
  }

  /**
   * Vérification demandée par un administrateur : rejoue l'initiation d'un paiement resté INITIATED (même clé,
   * même corps), puis vérifie auprès du fournisseur. Ne force jamais un statut : seul le fournisseur décide.
   */
  async recheck(paymentId: string): Promise<PaymentStatus> {
    await this.restart(paymentId);
    return this.verify(paymentId);
  }

  /**
   * Rejoue l'initiation d'un paiement resté INITIATED sans référence (rattrapage, relance admin). Limité à la
   * fenêtre de 10 minutes : au-delà, on ne sait pas si SasPay garde encore la clé d'idempotence, et un rejeu
   * pourrait alors créer un second paiement.
   */
  private async restart(paymentId: string): Promise<void> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { pack: true },
    });
    if (!payment || payment.externalReference || payment.status !== 'INITIATED')
      return;
    if (!this.providerOf(payment.gateway)?.idempotent) return;
    if (Date.now() - payment.createdAt.getTime() > UNSTARTED_GIVE_UP_MS) return;
    try {
      await this.start(payment);
    } catch (e) {
      // Refus définitif : déjà enregistré par start(). Toute autre erreur sera retentée au prochain passage.
      if (!(e instanceof HttpException)) {
        this.logger.warn(`Rejeu du paiement ${paymentId} impossible`);
      }
    }
  }

  // ───────────── Lecture ─────────────

  async get(userId: string, id: string): Promise<PaymentView> {
    return this.toView(await this.owned(userId, id));
  }

  /** Achats de l'utilisateur connecté (et seulement les siens), paginés côté serveur. */
  async list(
    userId: string,
    q: { page: number; pageSize: number },
  ): Promise<Page<PaymentView>> {
    const where = { userId };
    const total = await this.prisma.payment.count({ where });
    const page = clampPage(q.page, total, q.pageSize);
    const rows = await this.prisma.payment.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.pageSize,
      skip: (page - 1) * q.pageSize,
      include: { pack: true },
    });
    return buildPage(
      rows.map((r) => this.toView(r)),
      total,
      page,
      q.pageSize,
    );
  }

  async receipt(userId: string, id: string): Promise<PaymentReceipt> {
    const payment = await this.owned(userId, id);
    if (payment.status !== 'SUCCESS') {
      throw new ConflictException({
        code: 'RECEIPT_UNAVAILABLE',
        message: 'Un reçu n’est disponible que pour un achat réussi.',
      });
    }
    return {
      ...this.toView(payment),
      receiptNumber: `YAM-${payment.id.slice(0, 8).toUpperCase()}`,
    };
  }

  private async owned(userId: string, id: string): Promise<PaymentWithPack> {
    // Même réponse pour « inexistant » et « appartient à un autre » : pas de fuite d'identifiants.
    const payment = await this.prisma.payment.findFirst({
      where: { id, userId },
      include: { pack: true },
    });
    if (!payment)
      throw new NotFoundException({
        code: 'PAYMENT_NOT_FOUND',
        message: 'Paiement introuvable.',
      });
    return payment;
  }

  // ───────────── Callback et vérification ─────────────

  /**
   * Un callback n'est JAMAIS cru : on répond tout de suite et on déclenche une vérification auprès du fournisseur.
   * Une référence inconnue est ignorée en silence (on ne révèle pas ce qui existe).
   */
  async handleCallback(reference: string): Promise<void> {
    const payment = await this.prisma.payment.findUnique({
      where: { externalReference: reference },
    });
    if (!payment) return;
    if (this.queue.enabled) {
      await this.queue.enqueueVerifyPayment(payment.id);
    } else {
      await this.verify(payment.id, 'callback');
    }
  }

  /**
   * Notification d'un fournisseur dont la SIGNATURE est déjà vérifiée. Elle est enregistrée (déduplication par
   * fournisseur + transaction + événement) puis déclenche une vérification auprès du fournisseur : son contenu
   * n'est jamais utilisé pour créditer. Une notification rejouée relance quand même la vérification tant que le
   * paiement est ouvert (idempotent), au cas où la précédente n'ait pas pu conclure.
   */
  async handleProviderEvent(input: {
    gateway: string;
    event: string;
    providerTxId: string;
    summary: Prisma.InputJsonValue;
  }): Promise<'processed' | 'duplicate' | 'unknown'> {
    const { gateway, event, providerTxId } = input;
    const payment = await this.prisma.payment.findUnique({
      where: { externalReference: providerTxId },
      select: { id: true, gateway: true, status: true },
    });
    // Une référence connue d'un AUTRE fournisseur n'est pas la nôtre.
    const known = payment && payment.gateway === gateway ? payment : null;
    await this.prisma.paymentWebhookEvent.createMany({
      data: [
        {
          gateway,
          providerTxId,
          event,
          paymentId: known?.id ?? null,
          payload: input.summary,
        },
      ],
      skipDuplicates: true,
    });
    const row = await this.prisma.paymentWebhookEvent.findUniqueOrThrow({
      where: { gateway_providerTxId_event: { gateway, providerTxId, event } },
    });
    // Inconnue (ou arrivée avant l'enregistrement de la référence) : rien à vérifier maintenant ; le rattrapage
    // reprend la main dès que la référence est connue.
    if (!known) return 'unknown';
    if (row.processedAt && !OPEN.includes(known.status)) return 'duplicate';
    await this.handleCallback(providerTxId);
    await this.prisma.paymentWebhookEvent.update({
      where: { id: row.id },
      data: { paymentId: known.id, processedAt: row.processedAt ?? new Date() },
    });
    return row.processedAt ? 'duplicate' : 'processed';
  }

  /**
   * Vérifie un paiement auprès du fournisseur et le conclut. Idempotent et sûr en concurrence : le passage à
   * SUCCESS est « réclamé » par un UPDATE conditionnel, donc un seul appelant crédite, quel que soit le nombre
   * de callbacks ou de relances. Un statut « succès » dont le montant ne correspond pas n'est pas crédité.
   */
  async verify(
    paymentId: string,
    source: CheckSource = 'api',
  ): Promise<PaymentStatus> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) return 'FAILED';
    const reopenable =
      payment.status === 'FAILED' && payment.failureReason === TIMEOUT_REASON;
    // Un paiement SUCCESS dont les crédits n'ont jamais été attribués reste à traiter (anomalie à régulariser).
    const uncredited =
      payment.status === 'SUCCESS' && payment.creditedAt === null;
    if (!OPEN.includes(payment.status) && !reopenable && !uncredited)
      return payment.status;
    const reference = payment.externalReference;
    if (!reference) return payment.status;

    let result;
    try {
      result = await this.providers
        .byName(payment.gateway)
        .getStatus(reference);
    } catch (e) {
      // Fournisseur en panne ou réponse inexploitable : aucune conclusion, on réessaiera.
      const kind =
        e instanceof ProviderUnavailableError
          ? 'unavailable'
          : 'invalid_response';
      this.logger.warn(
        `Vérification du paiement ${paymentId} impossible (${kind})`,
      );
      await this.prisma.payment.update({
        where: { id: paymentId },
        data: {
          lastProviderStatus: { error: kind, at: new Date().toISOString() },
          lastReconcileError: kind,
          lastReconcileAt: new Date(),
          reconcileAttempts: { increment: 1 },
        },
      });
      await this.recordCheck({
        paymentId,
        source,
        outcome: kind,
        detail: e instanceof Error ? e.message.slice(0, 300) : null,
      });
      return payment.status;
    }
    await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        lastReconcileAt: new Date(),
        reconcileAttempts: { increment: 1 },
        lastReconcileError: null,
      },
    });
    await this.recordCheck({
      paymentId,
      source,
      outcome: result.status,
      amount: result.amount,
      currency: result.currency,
    });

    if (result.status === 'pending') {
      await this.prisma.payment.update({
        where: { id: paymentId },
        data: {
          lastProviderStatus: {
            status: 'pending',
            at: new Date().toISOString(),
          },
        },
      });
      return payment.status;
    }

    if (result.status === 'failed' || result.status === 'cancelled') {
      const status = result.status === 'failed' ? 'FAILED' : 'CANCELLED';
      const reason =
        result.status === 'failed'
          ? 'Le paiement a échoué'
          : 'Le paiement a été annulé';
      const claimed = await this.prisma.payment.updateMany({
        where: { id: paymentId, status: { in: OPEN } },
        data: {
          status,
          failureReason: reason,
          lastProviderStatus: { status: result.status },
        },
      });
      if (claimed.count === 1) {
        await this.notifications.notify(this.prisma, {
          dedupKey: `payment-failed:${paymentId}`,
          userId: payment.userId,
          type: 'PAYMENT_FAILED',
          title:
            result.status === 'failed' ? 'Paiement échoué' : 'Paiement annulé',
          body: 'Aucun montant n’a été crédité. Vous pouvez réessayer.',
          link: '/app/credits',
        });
      }
      return (
        await this.prisma.payment.findUniqueOrThrow({
          where: { id: paymentId },
        })
      ).status;
    }

    // Succès annoncé : le montant et la devise doivent correspondre exactement à ce que nous avons demandé
    // au fournisseur (montant envoyé, qui peut être inférieur au prix affiché : frais absorbés).
    const expected = payment.sentAmount ?? payment.amount;
    if (result.amount !== expected || result.currency !== payment.currency) {
      this.logger.error(
        `Paiement ${paymentId} : montant incohérent (attendu ${expected} ${payment.currency}, reçu ${result.amount} ${result.currency})`,
      );
      await this.recordCheck({
        paymentId,
        source,
        outcome: 'amount_mismatch',
        amount: result.amount,
        currency: result.currency,
        detail: `Attendu ${expected} ${payment.currency}`,
      });
      await this.prisma.payment.updateMany({
        where: { id: paymentId, status: { in: OPEN } },
        data: {
          status: 'FAILED',
          failureReason: MISMATCH_REASON,
          lastProviderStatus: {
            status: 'success',
            amount: result.amount,
            currency: result.currency,
          },
        },
      });
      return 'FAILED';
    }

    // Écarts à surveiller (le crédit n'en dépend pas : le client a payé ce que Yamboka a demandé).
    const snapshot = payment.feeSnapshot as { fee?: number } | null;
    if (
      result.clientFee != null &&
      typeof snapshot?.fee === 'number' &&
      result.clientFee !== snapshot.fee
    ) {
      this.logger.warn(
        `Paiement ${paymentId} : frais constatés ${result.clientFee} ≠ frais calculés ${snapshot.fee}`,
      );
    }
    if (result.debitedAmount != null && result.debitedAmount > payment.amount) {
      this.logger.warn(
        `Paiement ${paymentId} : le client a payé ${result.debitedAmount}, plus que le prix affiché ${payment.amount}`,
      );
    }

    await this.creditConfirmed({
      payment,
      reference,
      origin: 'AUTO',
      clientFee: result.clientFee ?? null,
      debitedAmount: result.debitedAmount ?? null,
    });
    return 'SUCCESS';
  }

  // ───────────── Attribution des crédits d'un paiement confirmé ─────────────

  /**
   * Attribue les crédits d'un paiement confirmé, UNE SEULE FOIS, quelle que soit l'origine (vérification
   * automatique, notification du fournisseur, réconciliation, régularisation par un administrateur).
   *
   * Trois protections se superposent :
   * 1. verrou de ligne sur l'utilisateur : deux appels simultanés passent l'un après l'autre ;
   * 2. UPDATE conditionnel qui « réclame » le paiement : un seul appelant obtient `count === 1` ;
   * 3. référence `pay:<réf>` unique dans le registre (contrainte en base) : même si 1 et 2 étaient contournés,
   *    un second mouvement d'achat pour le même paiement resterait impossible.
   *
   * L'attribution, la trace d'audit et la notification sont écrites dans la MÊME transaction : le client n'est
   * jamais prévenu avant que les crédits soient réellement acquis. L'e-mail, lui, part après la validation.
   */
  private async creditConfirmed(p: {
    payment: Payment;
    reference: string;
    origin: 'AUTO' | 'MANUAL';
    /** Administrateur responsable d'une régularisation (origine MANUAL). */
    adminId?: string;
    clientFee?: number | null;
    debitedAmount?: number | null;
    /** Écrit dans la transaction de l'attribution : la trace et les crédits sont indissociables. */
    onCommit?: (
      tx: Prisma.TransactionClient,
      info: {
        ledgerReference: string;
        credits: number;
        bonusCredits: number;
        balanceBefore: number;
        balanceAfter: number;
      },
    ) => Promise<void>;
  }): Promise<{
    credited: boolean;
    credits: number;
    bonusCredits: number;
    balance: number;
  }> {
    const { payment, reference, origin } = p;
    const months = await this.settings.get('purchasedCreditsExpiryMonths');
    const expiresAt = new Date();
    expiresAt.setUTCMonth(expiresAt.getUTCMonth() + months);

    let noteId: string | null = null;
    const outcome = await this.prisma.$transaction(async (tx) => {
      // Le verrou utilisateur d'abord : deux confirmations simultanées du même compte passent l'une après l'autre,
      // et la seconde voit que la première est déjà réussie (bonus de premier achat une seule fois).
      await lockUserRow(tx, payment.userId);
      const balanceBefore = await this.credits.getBalance(payment.userId, tx);
      const nothing = {
        credited: false,
        credits: 0,
        bonusCredits: 0,
        balance: balanceBefore,
      };
      const claimed = await tx.payment.updateMany({
        where: {
          id: payment.id,
          OR: [
            { status: { in: OPEN } },
            { status: 'FAILED', failureReason: TIMEOUT_REASON },
            { status: 'FAILED', failureReason: MISMATCH_REASON },
            // Confirmé par le fournisseur mais jamais crédité : l'anomalie que l'on vient réparer.
            { status: 'SUCCESS', creditedAt: null },
          ],
        },
        data: {
          status: 'SUCCESS',
          creditedAt: new Date(),
          creditOrigin: origin,
          creditedById: p.adminId ?? null,
          failureReason: null,
          lastReconcileError: null,
          ...(p.clientFee !== undefined ? { clientFee: p.clientFee } : {}),
          ...(p.debitedAmount !== undefined
            ? { debitedAmount: p.debitedAmount }
            : {}),
          lastProviderStatus: { status: 'success' },
        },
      });
      // Déjà conclu ET crédité par un autre appelant : aucune seconde attribution.
      if (claimed.count !== 1) return nothing;

      const granted = await this.credits.grantPurchase(tx, {
        userId: payment.userId,
        paymentId: payment.id,
        reference,
        baseCredits: payment.credits,
        expiresAt,
        bonusPercent: payment.firstPurchaseBonusPercent ?? 0,
      });
      // Le registre portait déjà le mouvement `pay:<réf>` : seul l'état du paiement était en retard.
      if (!granted.created) return nothing;

      if (granted.bonusCredits > 0) {
        await tx.payment.update({
          where: { id: payment.id },
          data: { bonusCredits: granted.bonusCredits },
        });
      }
      const balanceAfter =
        balanceBefore + payment.credits + granted.bonusCredits;
      await p.onCommit?.(tx, {
        ledgerReference: `pay:${reference}`,
        credits: payment.credits,
        bonusCredits: granted.bonusCredits,
        balanceBefore,
        balanceAfter,
      });
      const note = await this.notifications.notify(tx, {
        userId: payment.userId,
        type: 'PAYMENT_SUCCESS',
        title:
          origin === 'MANUAL' ? 'Crédits régularisés' : 'Paiement confirmé',
        body: creditedBody(
          origin,
          payment.credits,
          granted.bonusCredits,
          reference,
        ),
        link: '/app/credits',
        dedupKey: `payment-ok:${payment.id}`,
      });
      noteId = note.id;
      return {
        credited: true,
        credits: payment.credits,
        bonusCredits: granted.bonusCredits,
        balance: balanceAfter,
      };
    });

    // E-mail APRÈS validation de la transaction : les crédits sont déjà acquis. Un envoi en panne ne doit ni les
    // retirer, ni faire échouer l'opération : la notification reste « en attente » et le job
    // `flush-notification-emails` la reprend.
    if (outcome.credited) {
      try {
        await this.notifications.dispatchEmail(noteId);
      } catch (e) {
        this.logger.warn(
          `E-mail de confirmation du paiement ${payment.id} non envoyé : ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    return outcome;
  }

  /** Trace, en ajout seul, une tentative de vérification. Ne fait jamais échouer l'opération qu'elle décrit. */
  private async recordCheck(c: {
    paymentId: string;
    source: CheckSource;
    outcome: string;
    kind?: PaymentCheckKind;
    amount?: number | null;
    currency?: string | null;
    proofReference?: string | null;
    detail?: string | null;
    actorId?: string | null;
  }): Promise<void> {
    try {
      await this.prisma.paymentCheck.create({
        data: {
          paymentId: c.paymentId,
          kind: c.kind ?? 'PROVIDER',
          source: c.source,
          outcome: c.outcome,
          amount: c.amount ?? null,
          currency: c.currency ?? null,
          proofReference: c.proofReference ?? null,
          detail: c.detail ?? null,
          actorId: c.actorId ?? null,
        },
      });
    } catch (e) {
      this.logger.warn(
        `Trace de vérification non écrite pour ${c.paymentId} : ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  // ───────────── Régularisation par un administrateur ─────────────

  /**
   * Régularise un paiement confirmé dont les crédits n'ont jamais été attribués (notification perdue).
   *
   * Rien n'est attribué sur la seule présence d'une transaction dans l'historique : le fournisseur est
   * TOUJOURS interrogé d'abord, et il doit annoncer un succès au montant et à la devise exacts. Un refus, un
   * paiement encore en attente ou un montant différent interdisent la régularisation.
   *
   * Le fournisseur peut être injoignable. Le mode `MANUAL_PROOF` permet alors à l'administrateur d'engager sa
   * responsabilité sur une preuve externe (relevé du compte marchand) : l'opération est enregistrée comme une
   * VALIDATION ADMINISTRATIVE (PaymentCheck de type MANUAL), jamais comme une confirmation du fournisseur.
   *
   * L'attribution passe par `creditConfirmed` : même verrou, même UPDATE conditionnel et même référence
   * `pay:<réf>` que la voie automatique. Une notification arrivée après coup ne crédite donc jamais une
   * deuxième fois, et deux administrateurs simultanés n'attribuent qu'une seule fois.
   */
  async settlePayment(p: {
    paymentId: string;
    adminId: string;
    mode: 'PROVIDER' | 'MANUAL_PROOF';
    proofReference?: string;
    reason: string;
    justification?: string;
    ip?: string;
  }): Promise<SettlementResult> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: p.paymentId },
    });
    if (!payment)
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Paiement introuvable.',
      });

    // Référence fournisseur absente : rien à vérifier, donc rien à régulariser.
    const reference = payment.externalReference;
    if (!reference)
      throw new UnprocessableEntityException({
        code: 'NO_PROVIDER_REFERENCE',
        message:
          'Ce paiement n’a aucune référence chez le fournisseur : il ne peut pas être régularisé.',
      });

    // Déjà crédité : le registre fait foi, pas le statut du paiement.
    const already = await this.prisma.creditLedger.findUnique({
      where: { reference: `pay:${reference}` },
    });
    if (already)
      throw new ConflictException({
        code: 'ALREADY_CREDITED',
        message: 'Les crédits de ce paiement ont déjà été attribués.',
      });

    let result: PaymentStatusResult | null = null;
    let providerError: 'unavailable' | 'invalid_response' | null = null;
    try {
      result = await this.providers
        .byName(payment.gateway)
        .getStatus(reference);
    } catch (e) {
      providerError =
        e instanceof ProviderUnavailableError
          ? 'unavailable'
          : 'invalid_response';
    }

    if (result) {
      await this.recordCheck({
        paymentId: payment.id,
        source: 'admin',
        outcome: result.status,
        amount: result.amount,
        currency: result.currency,
        actorId: p.adminId,
      });
      if (result.status !== 'success')
        throw new UnprocessableEntityException({
          code: 'NOT_CONFIRMED',
          message: `Le fournisseur n’annonce pas ce paiement comme réussi (${result.status}) : aucune régularisation possible.`,
        });
      const expected = payment.sentAmount ?? payment.amount;
      if (result.amount !== expected || result.currency !== payment.currency) {
        await this.recordCheck({
          paymentId: payment.id,
          source: 'admin',
          outcome: 'amount_mismatch',
          amount: result.amount,
          currency: result.currency,
          detail: `Attendu ${expected} ${payment.currency}`,
          actorId: p.adminId,
        });
        throw new UnprocessableEntityException({
          code: 'AMOUNT_MISMATCH',
          message: `Montant confirmé (${result.amount} ${result.currency}) différent du montant attendu (${expected} ${payment.currency}) : régularisation refusée.`,
        });
      }
    } else {
      await this.recordCheck({
        paymentId: payment.id,
        source: 'admin',
        outcome: providerError!,
        actorId: p.adminId,
      });
      if (p.mode !== 'MANUAL_PROOF')
        throw new ServiceUnavailableException({
          code: 'PROVIDER_UNAVAILABLE',
          message:
            'Le fournisseur est injoignable : impossible de confirmer ce paiement automatiquement. Une validation administrative sur preuve est possible.',
        });
      // Validation administrative : tracée comme telle, avec la référence de la preuve et son auteur.
      await this.recordCheck({
        paymentId: payment.id,
        source: 'admin',
        kind: 'MANUAL',
        outcome: 'manual_proof',
        proofReference: p.proofReference ?? null,
        detail: p.justification ?? p.reason,
        actorId: p.adminId,
      });
    }

    const granted = await this.creditConfirmed({
      payment,
      reference,
      origin: 'MANUAL',
      adminId: p.adminId,
      clientFee: result?.clientFee ?? undefined,
      debitedAmount: result?.debitedAmount ?? undefined,
      onCommit: async (tx, info) => {
        await this.audit.log(
          {
            actorId: p.adminId,
            action: 'payment.settle',
            entityType: 'Payment',
            entityId: payment.id,
            before: {
              status: payment.status,
              credited: false,
              balance: info.balanceBefore,
            },
            after: {
              status: 'SUCCESS',
              credited: true,
              creditOrigin: 'MANUAL',
              mode: p.mode,
              verifiedBy: result ? 'provider' : 'admin_proof',
              proofReference: p.proofReference ?? null,
              userId: payment.userId,
              credits: info.credits,
              bonusCredits: info.bonusCredits,
              ledgerReference: info.ledgerReference,
              paymentReference: reference,
              balance: info.balanceAfter,
              justification: p.justification ?? null,
            },
            reason: p.reason,
            ip: p.ip,
          },
          tx,
        );
      },
    });

    // Un autre appelant (notification tardive, réconciliation, second administrateur) a crédité entre-temps.
    if (!granted.credited)
      throw new ConflictException({
        code: 'ALREADY_CREDITED',
        message: 'Les crédits de ce paiement ont déjà été attribués.',
      });

    this.logger.log(
      `Paiement ${payment.id} régularisé par ${p.adminId} (${result ? 'confirmé par le fournisseur' : 'validation administrative'})`,
    );
    return {
      credited: true,
      credits: granted.credits,
      bonusCredits: granted.bonusCredits,
      balance: granted.balance,
      verifiedBy: result ? 'provider' : 'admin_proof',
    };
  }

  /**
   * Rattrapage (toutes les 2 minutes) : revérifie les paiements ouverts (callback perdu), puis déclare échoués
   * ceux qui n'ont jamais abouti au bout de 24 h.
   */
  async reconcile(
    now = new Date(),
    /** Limite le passage à un fournisseur (diagnostic, tests) ; par défaut tous. */
    gateway?: string,
  ): Promise<{
    checked: number;
    expired: number;
    recovered: number;
    uncredited: number;
    stuck: number;
  }> {
    // Notifications arrivées avant que la référence soit enregistrée : elles n'avaient alors rien à vérifier.
    const recovered = await this.recoverOrphanWebhooks(gateway);

    const open = await this.prisma.payment.findMany({
      where: { status: { in: OPEN }, ...(gateway ? { gateway } : {}) },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    let expired = 0;
    for (const p of open) {
      const age = now.getTime() - p.createdAt.getTime();
      const provider = this.providerOf(p.gateway);
      // Initiation restée sans réponse (délai dépassé) : on rejoue la même requête, avec la même clé d'idempotence.
      if (
        !p.externalReference &&
        p.status === 'INITIATED' &&
        provider?.idempotent &&
        age <= UNSTARTED_GIVE_UP_MS
      ) {
        await this.restart(p.id);
      }
      const status = await this.verify(p.id, 'reconcile');
      const tooOld = age > (provider?.pendingTtlMs ?? 24 * 3600 * 1000);
      const neverStarted = !p.externalReference && age > UNSTARTED_GIVE_UP_MS;
      if (OPEN.includes(status) && (tooOld || neverStarted)) {
        const res = await this.prisma.payment.updateMany({
          where: { id: p.id, status: { in: OPEN } },
          data: { status: 'FAILED', failureReason: TIMEOUT_REASON },
        });
        expired += res.count;
      }
    }
    // Un paiement déclaré échoué pour délai peut avoir abouti après coup : on le revérifie quelque temps
    // (un succès confirmé est alors crédité une seule fois, voir verify()).
    const late = await this.prisma.payment.findMany({
      where: {
        status: 'FAILED',
        failureReason: TIMEOUT_REASON,
        externalReference: { not: null },
        ...(gateway ? { gateway } : {}),
        createdAt: { gte: new Date(now.getTime() - LATE_SUCCESS_WINDOW_MS) },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    for (const p of late) await this.verify(p.id, 'reconcile');

    // Confirmés par le fournisseur mais jamais crédités : on retente l'attribution (idempotente).
    const uncredited = await this.creditPendingSuccesses(gateway);

    // Ce qui n'a pas pu être réglé automatiquement est signalé : l'administration doit intervenir.
    const stuck = await this.countStuck(now, gateway);
    if (stuck > 0) {
      this.logger.warn(
        `${stuck} paiement(s) non régularisé(s) depuis plus de ${Math.round(ANOMALY_ALERT_AFTER_MS / 60000)} minutes : intervention requise.`,
      );
    }
    return { checked: open.length, expired, recovered, uncredited, stuck };
  }

  /**
   * Rattrape les paiements que le fournisseur a confirmés mais dont les crédits n'ont jamais été attribués
   * (interruption entre la confirmation et l'écriture au registre). Idempotent : `creditConfirmed` ne crédite
   * que si le registre ne porte pas déjà le mouvement `pay:<réf>`.
   */
  private async creditPendingSuccesses(gateway?: string): Promise<number> {
    const rows = await this.prisma.payment.findMany({
      where: {
        status: 'SUCCESS',
        creditedAt: null,
        externalReference: { not: null },
        ...(gateway ? { gateway } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: UNCREDITED_BATCH,
    });
    let credited = 0;
    for (const p of rows) {
      try {
        // Le fournisseur est réinterrogé : on ne crédite jamais sur la seule foi d'un statut local.
        await this.verify(p.id, 'reconcile');
        const after = await this.prisma.payment.findUnique({
          where: { id: p.id },
          select: { creditedAt: true },
        });
        if (after?.creditedAt) credited += 1;
      } catch (e) {
        this.logger.warn(
          `Rattrapage du paiement ${p.id} impossible : ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    return credited;
  }

  /**
   * Reprend les notifications dont la signature avait été vérifiée mais qui n'ont jamais été traitées : soit
   * elles sont arrivées avant l'enregistrement de la référence, soit leur traitement a été interrompu.
   */
  private async recoverOrphanWebhooks(gateway?: string): Promise<number> {
    const orphans = await this.prisma.paymentWebhookEvent.findMany({
      where: { processedAt: null, ...(gateway ? { gateway } : {}) },
      orderBy: { receivedAt: 'asc' },
      take: 100,
    });
    let recovered = 0;
    for (const w of orphans) {
      const payment = await this.prisma.payment.findUnique({
        where: { externalReference: w.providerTxId },
        select: { id: true, gateway: true },
      });
      // Référence toujours inconnue : la notification reste en attente, sans jamais être perdue.
      if (!payment || payment.gateway !== w.gateway) continue;
      await this.verify(payment.id, 'webhook');
      await this.prisma.paymentWebhookEvent.update({
        where: { id: w.id },
        data: { paymentId: payment.id, processedAt: new Date() },
      });
      recovered += 1;
    }
    return recovered;
  }

  /**
   * Paiements qui demandent une intervention humaine : confirmés non crédités, ou ouverts depuis trop longtemps.
   * Sert l'alerte du tableau de bord d'administration ; rien n'est stocké.
   */
  async countStuck(now = new Date(), gateway?: string): Promise<number> {
    const before = new Date(now.getTime() - ANOMALY_ALERT_AFTER_MS);
    return this.prisma.payment.count({
      where: {
        ...(gateway ? { gateway } : {}),
        createdAt: { lt: before },
        OR: [
          { status: 'SUCCESS', creditedAt: null },
          { status: { in: OPEN } },
          { status: 'FAILED', failureReason: MISMATCH_REASON },
        ],
      },
    });
  }

  private providerOf(gateway: string): PaymentProvider | undefined {
    try {
      return this.providers.byName(gateway);
    } catch {
      return undefined;
    }
  }

  // ───────────── Simulation (fournisseur simulé uniquement) ─────────────

  /**
   * Reproduit ce qui se passe quand le client agit sur son téléphone, puis envoie le(s) callback(s).
   * Réservé au fournisseur simulé : avec un vrai fournisseur, cette route n'existe pas (404).
   */
  async simulate(
    userId: string,
    id: string,
    input: SimulatePaymentInput,
  ): Promise<PaymentView> {
    const payment = await this.owned(userId, id);
    const reference = payment.externalReference;
    if (payment.gateway !== this.mock.name || !reference) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Introuvable.',
      });
    }
    await this.mock.simulate(reference, input.outcome);
    // Callbacks simultanés : c'est le cas réel (le fournisseur réessaie jusqu'à 4 fois).
    await Promise.all(
      Array.from({ length: input.callbacks }, () =>
        this.handleCallback(reference),
      ),
    );
    return this.get(userId, id);
  }

  // ───────────── Vue ─────────────

  private toView(p: PaymentWithPack): PaymentView {
    return {
      id: p.id,
      status: p.status,
      packName: p.pack?.name ?? CUSTOM_PURCHASE_LABEL,
      custom: p.pack === null,
      country: p.country,
      network: p.network,
      methodLabel: methodLabelOf(p),
      amountFcfa: p.amount,
      currency: p.currency,
      // Total crédité : crédits du pack + bonus de premier achat éventuel.
      credits: p.credits + p.bonusCredits,
      bonusCredits: p.bonusCredits,
      operator: p.operator,
      payerPhone: p.payerPhone,
      reference: p.externalReference,
      provider: p.gateway,
      // La redirection n'a de sens que tant que le paiement est ouvert.
      checkoutUrl: OPEN.includes(p.status) ? p.checkoutUrl : null,
      failureReason: p.failureReason,
      createdAt: p.createdAt.toISOString(),
      creditedAt: p.creditedAt?.toISOString() ?? null,
      simulated: p.gateway === this.mock.name,
    };
  }
}

const LEGACY_METHOD_LABELS: Record<string, string> = {
  MTN: 'MTN Mobile Money',
  AIRTEL: 'Airtel Money',
};

/** « Orange Money » pour orange_cm ; les anciens paiements sans réseau gardent le nom de leur opérateur. */
function methodLabelOf(p: Payment): string {
  return (
    p.methodName ??
    LEGACY_METHOD_LABELS[p.operator] ??
    p.network ??
    'Mobile money'
  );
}

/** Commande entièrement validée par le serveur, prête à être enregistrée. */
interface Prepared {
  country: CountryConfig;
  provider: PaymentProvider;
  network: NetworkConfig | undefined;
  pack: CreditPack | null;
  credits: number;
  amount: number;
  bonusPercent: number;
  plan: {
    sentAmount: number;
    network: string;
    feeSnapshot: Prisma.InputJsonValue;
  } | null;
}

/** Message affiché au client pour un refus définitif du fournisseur : jamais le texte brut du fournisseur. */
function rejectionMessage(code: string): string {
  const base = 'Aucun montant n’a été débité. ';
  switch (code) {
    case 'invalid_customer':
      return (
        base +
        'Vérifiez votre numéro de téléphone et vos informations de profil, puis réessayez.'
      );
    case 'invalid_method':
    case 'no_route_available':
      return (
        base +
        'Ce moyen de paiement n’est pas disponible pour le moment. Essayez avec un autre opérateur ou plus tard.'
      );
    default:
      return base + 'Le paiement a été refusé. Réessayez ou contactez-nous.';
  }
}
