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
  PaymentQuoteView,
  PaymentReceipt,
  PaymentStatus,
  PaymentView,
  QuotePaymentInput,
  SimulatePaymentInput,
} from '@yamboka/shared';
import { CUSTOM_PURCHASE_LABEL } from '@yamboka/shared';
import { randomUUID } from 'node:crypto';
import { firstPurchaseBonusPercent } from '../billing/bonus';
import { customAmount, isSoldAtLoss } from '../billing/custom-purchase';
import {
  computeSendAmount,
  FeeComputationError,
  type FeeTier,
} from '../billing/fees';
import { lockUserRow } from '../common/locks';
import type { Env } from '../config/env';
import { CreditsService } from '../credits/credits.service';
import { EmailService } from '../email/email.service';
import type { CreditPack, Payment, Prisma } from '../generated/prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { JobQueue } from '../queue/job-queue';
import { SettingsService } from '../settings/settings.service';
import { MockPaymentProvider } from './mock-payment.provider';
import {
  findNetwork,
  legacyNetworkCode,
  networkLabel,
  operatorOf,
  type CountryConfig,
  type NetworkConfig,
} from './payment-countries';
import { isCfa, PaymentOffersService } from './payment-offers.service';
import { PaymentProviders } from './payment-providers.service';
import {
  InitiatePaymentRequest,
  PaymentProvider,
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

const OPEN: PaymentStatus[] = ['INITIATED', 'PENDING'];
type PaymentWithPack = Payment & { pack: CreditPack | null };

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: PaymentProviders,
    private readonly offers: PaymentOffersService,
    private readonly mock: MockPaymentProvider,
    private readonly credits: CreditsService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly queue: JobQueue,
    private readonly email: EmailService,
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
    const provider = this.providers.forCountry(country.iso);

    const networkCode =
      input.network ??
      (input.operator
        ? legacyNetworkCode(input.operator, country.iso)
        : undefined);
    let network: NetworkConfig | undefined;
    if (networkCode !== undefined || opts.requireNetwork) {
      network = networkCode ? findNetwork(country, networkCode) : undefined;
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

  async list(userId: string, limit = 50): Promise<PaymentView[]> {
    const rows = await this.prisma.payment.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: Math.min(Math.max(limit, 1), 100),
      include: { pack: true },
    });
    return rows.map((r) => this.toView(r));
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
      await this.verify(payment.id);
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
  async verify(paymentId: string): Promise<PaymentStatus> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) return 'FAILED';
    const reopenable =
      payment.status === 'FAILED' && payment.failureReason === TIMEOUT_REASON;
    if (!OPEN.includes(payment.status) && !reopenable) return payment.status;
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
        },
      });
      return payment.status;
    }

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
      await this.prisma.payment.updateMany({
        where: { id: paymentId, status: { in: OPEN } },
        data: {
          status: 'FAILED',
          failureReason: 'Montant incohérent : vérification manuelle requise',
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

    const months = await this.settings.get('purchasedCreditsExpiryMonths');
    const expiresAt = new Date();
    expiresAt.setUTCMonth(expiresAt.getUTCMonth() + months);

    let successNoteId: string | null = null;
    const credited = await this.prisma.$transaction(async (tx) => {
      // Le verrou utilisateur d'abord : deux confirmations simultanées du même compte passent l'une après l'autre,
      // et la seconde voit que la première est déjà réussie (bonus de premier achat une seule fois).
      await lockUserRow(tx, payment.userId);
      const claimed = await tx.payment.updateMany({
        where: {
          id: paymentId,
          OR: [
            { status: { in: OPEN } },
            { status: 'FAILED', failureReason: TIMEOUT_REASON },
          ],
        },
        data: {
          status: 'SUCCESS',
          creditedAt: new Date(),
          failureReason: null,
          clientFee: result.clientFee ?? null,
          debitedAmount: result.debitedAmount ?? null,
          lastProviderStatus: { status: 'success' },
        },
      });
      if (claimed.count !== 1) return false; // déjà conclu par un autre appelant : rien à créditer
      const granted = await this.credits.grantPurchase(tx, {
        userId: payment.userId,
        paymentId,
        reference,
        baseCredits: payment.credits,
        expiresAt,
        bonusPercent: payment.firstPurchaseBonusPercent ?? 0,
      });
      if (granted.bonusCredits > 0) {
        await tx.payment.update({
          where: { id: paymentId },
          data: { bonusCredits: granted.bonusCredits },
        });
      }
      const note = await this.notifications.notify(tx, {
        userId: payment.userId,
        type: 'PAYMENT_SUCCESS',
        title: 'Paiement confirmé',
        body:
          granted.bonusCredits > 0
            ? `${payment.credits + granted.bonusCredits} crédits ont été ajoutés à votre compte, dont ${granted.bonusCredits} offerts pour votre premier achat.`
            : `${payment.credits} crédits ont été ajoutés à votre compte.`,
        link: '/app/credits',
        dedupKey: `payment-ok:${paymentId}`,
      });
      successNoteId = note.id;
      return true;
    });
    // E-mail de confirmation (et reçu) après validation de la transaction, selon la préférence de l'utilisateur.
    if (credited) await this.notifications.dispatchEmail(successNoteId);
    return 'SUCCESS';
  }

  /**
   * Rattrapage (toutes les 2 minutes) : revérifie les paiements ouverts (callback perdu), puis déclare échoués
   * ceux qui n'ont jamais abouti au bout de 24 h.
   */
  async reconcile(
    now = new Date(),
    /** Limite le passage à un fournisseur (diagnostic, tests) ; par défaut tous. */
    gateway?: string,
  ): Promise<{ checked: number; expired: number }> {
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
      const status = await this.verify(p.id);
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
    for (const p of late) await this.verify(p.id);
    return { checked: open.length, expired };
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
    networkLabel(p.network, p.country) ??
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
