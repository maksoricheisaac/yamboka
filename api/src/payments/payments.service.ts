import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  CreatePaymentInput,
  PaymentReceipt,
  PaymentStatus,
  PaymentView,
  SimulatePaymentInput,
} from '@yamboka/shared';
import { firstPurchaseBonusPercent } from '../billing/bonus';
import { lockUserRow } from '../common/locks';
import { CreditsService } from '../credits/credits.service';
import { EmailService } from '../email/email.service';
import type { CreditPack, Payment } from '../generated/prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { JobQueue } from '../queue/job-queue';
import { SettingsService } from '../settings/settings.service';
import { MockPaymentProvider } from './mock-payment.provider';
import { PaymentProviders } from './payment-providers.service';
import {
  ProviderInvalidResponseError,
  ProviderUnavailableError,
} from './payment-provider';

/** Un paiement jamais confirmé au bout de ce délai est déclaré échoué (rattrapage de callbacks perdus). */
const PENDING_TTL_MS = 24 * 3600 * 1000;
/** Un double clic ou un double envoi dans cette fenêtre renvoie le paiement déjà créé. */
const DEDUPE_WINDOW_MS = 2 * 60 * 1000;
/** Motif d'un échec dû au seul délai : un succès tardif confirmé par le fournisseur reste crédité. */
export const TIMEOUT_REASON = 'Délai de confirmation dépassé';

const OPEN: PaymentStatus[] = ['INITIATED', 'PENDING'];
type PaymentWithPack = Payment & { pack: CreditPack };

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: PaymentProviders,
    private readonly mock: MockPaymentProvider,
    private readonly credits: CreditsService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly queue: JobQueue,
    private readonly email: EmailService,
  ) {}

  // ───────────── Création ─────────────

  async create(
    userId: string,
    input: CreatePaymentInput,
  ): Promise<PaymentView> {
    const pack = await this.prisma.creditPack.findFirst({
      where: { id: input.packId, active: true },
    });
    if (!pack) {
      throw new NotFoundException({
        code: 'PACK_NOT_FOUND',
        message: 'Ce pack n’existe pas ou n’est plus proposé.',
      });
    }
    const provider = this.providers.forCountry(pack.country);
    const bonusPercent = firstPurchaseBonusPercent(
      pack.firstPurchaseBonusPercent,
      {
        enabled: await this.settings.get('firstPurchaseBonusEnabled'),
        defaultPercent: await this.settings.get(
          'firstPurchaseBonusDefaultPercent',
        ),
      },
    );

    // Création sérialisée par utilisateur : deux envois simultanés identiques ne donnent qu'un paiement.
    const payment = await this.prisma.$transaction(async (tx) => {
      await lockUserRow(tx, userId);
      const recent = await tx.payment.findFirst({
        where: {
          userId,
          packId: pack.id,
          operator: input.operator,
          payerPhone: input.phone,
          status: { in: OPEN },
          createdAt: { gte: new Date(Date.now() - DEDUPE_WINDOW_MS) },
        },
        orderBy: { createdAt: 'desc' },
        include: { pack: true },
      });
      if (recent) return { row: recent, created: false };

      // Crédits de base du pack. Le bonus de premier achat n'est pas connu ici : il est jugé à la confirmation
      // (premier paiement RÉUSSI du compte) ; seul son pourcentage promis est figé pour que le client reçoive
      // ce qui lui a été affiché.
      const row = await tx.payment.create({
        data: {
          userId,
          packId: pack.id,
          country: pack.country,
          currency: pack.currency,
          amount: pack.price,
          credits: pack.credits,
          bonusCredits: 0,
          firstPurchaseBonusPercent: bonusPercent,
          gateway: provider.name,
          operator: input.operator,
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

    try {
      const started = await provider.initiate({
        amount: payment.row.amount,
        currency: payment.row.currency,
        phone: input.phone,
        operator: input.operator,
        customerId: userId,
        metadata: { paymentId: payment.row.id, userId, packId: pack.id },
      });
      const updated = await this.prisma.payment.update({
        where: { id: payment.row.id },
        data: { externalReference: started.reference, status: 'PENDING' },
        include: { pack: true },
      });
      return this.toView(updated);
    } catch (e) {
      if (
        e instanceof ProviderUnavailableError ||
        e instanceof ProviderInvalidResponseError
      ) {
        await this.prisma.payment.update({
          where: { id: payment.row.id },
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

    // Succès annoncé : le montant et la devise doivent correspondre exactement à ce que nous avons demandé.
    if (
      result.amount !== payment.amount ||
      result.currency !== payment.currency
    ) {
      this.logger.error(
        `Paiement ${paymentId} : montant incohérent (attendu ${payment.amount} ${payment.currency}, reçu ${result.amount} ${result.currency})`,
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
  ): Promise<{ checked: number; expired: number }> {
    const open = await this.prisma.payment.findMany({
      where: { status: { in: OPEN } },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    let expired = 0;
    for (const p of open) {
      const status = await this.verify(p.id);
      const tooOld = now.getTime() - p.createdAt.getTime() > PENDING_TTL_MS;
      const neverStarted =
        !p.externalReference &&
        now.getTime() - p.createdAt.getTime() > 10 * 60 * 1000;
      if (OPEN.includes(status) && (tooOld || neverStarted)) {
        const res = await this.prisma.payment.updateMany({
          where: { id: p.id, status: { in: OPEN } },
          data: { status: 'FAILED', failureReason: TIMEOUT_REASON },
        });
        expired += res.count;
      }
    }
    return { checked: open.length, expired };
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
      packName: p.pack.name,
      amountFcfa: p.amount,
      currency: p.currency,
      // Total crédité : crédits du pack + bonus de premier achat éventuel.
      credits: p.credits + p.bonusCredits,
      bonusCredits: p.bonusCredits,
      operator: p.operator,
      payerPhone: p.payerPhone,
      reference: p.externalReference,
      failureReason: p.failureReason,
      createdAt: p.createdAt.toISOString(),
      creditedAt: p.creditedAt?.toISOString() ?? null,
      simulated: p.gateway === this.mock.name,
    };
  }
}
