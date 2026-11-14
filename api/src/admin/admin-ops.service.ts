import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EDITABLE_SETTINGS,
  type AdminAccount,
  type AdminAlert,
  type AdminGenerationRow,
  type AdminPaymentDetail,
  type AdminPaymentEvent,
  type AdminPaymentRow,
  type AdminPaymentCheck,
  type AdminPaymentStats,
  type PaymentCreditState,
  type PaymentSettleInput,
  type AdminStats,
  type DailyPoint,
  type AdminAuditPage,
  type FinanceSummary,
  type LegalPublishInput,
  type LegalVersionRow,
  type ListQuery,
  type Page,
  type PayoutInput,
  type PayoutRow,
  type PromoteAdminInput,
  type SettingsUpdateInput,
  type SettingsView,
  type TopUpInput,
  type TopUpRow,
  CUSTOM_PURCHASE_LABEL,
} from '@yamboka/shared';
import { buildPage, clampPage } from '@yamboka/shared';
import { range, startOfToday } from '../common/period';
import { orderBy } from '../common/sort';
import { AuditService } from '../audit/audit.service';
import { CatalogService } from '../catalog/catalog.service';
import type { Env } from '../config/env';
import { EmailService } from '../email/email.service';
import { Prisma } from '../generated/prisma/client';
import { MISMATCH_REASON, PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  SETTING_DEFAULTS,
  SettingsService,
} from '../settings/settings.service';
import { AdminOfferService } from './admin-offer.service';

const DAY = 24 * 3600 * 1000;

/** Forme d'un identifiant UUID : une recherche libre ne doit jamais être comparée telle quelle à une colonne UUID. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Neutralise l'injection de formules dans un tableur (=, +, -, @ en début de cellule). */
export function csvCell(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** Relations lues par une ligne de paiement : uniquement ce qui est affiché. */
const PAYMENT_INCLUDE = {
  user: { select: { email: true } },
  pack: { select: { name: true } },
  creditedBy: { select: { email: true } },
} as const;

@Injectable()
export class AdminOpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly settings: SettingsService,
    private readonly catalog: CatalogService,
    private readonly offer: AdminOfferService,
    private readonly payments: PaymentsService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
  ) {}

  // ───────────── Pilotage ─────────────

  private async daily(
    table: 'User' | 'Payment',
    since: Date,
    until: Date,
  ): Promise<DailyPoint[]> {
    const rows =
      table === 'User'
        ? await this.prisma.$queryRaw<{ day: string; value: number }[]>`
            SELECT to_char(("createdAt" AT TIME ZONE 'Africa/Brazzaville')::date, 'YYYY-MM-DD') AS day, COUNT(*)::int AS value
            FROM "User" WHERE "createdAt" >= ${since} AND "createdAt" < ${until} GROUP BY 1 ORDER BY 1`
        : await this.prisma.$queryRaw<{ day: string; value: number }[]>`
            SELECT to_char(("creditedAt" AT TIME ZONE 'Africa/Brazzaville')::date, 'YYYY-MM-DD') AS day, COALESCE(SUM("amount"), 0)::int AS value
            FROM "Payment" WHERE "status" = 'SUCCESS' AND "creditedAt" >= ${since} AND "creditedAt" < ${until} GROUP BY 1 ORDER BY 1`;
    return rows;
  }

  /**
   * Période des indicateurs. Avec `from`/`to` (jours calendaires de Brazzaville, bornes incluses) ou, à défaut,
   * les `days` derniers jours jusqu'à maintenant. Fin exclue : un jour entier se termine à minuit local suivant.
   */
  async stats(
    opts: { days?: number; from?: string; to?: string } = {},
  ): Promise<AdminStats> {
    const BRAZZAVILLE = '+01:00'; // UTC+1 toute l'année, sans heure d'été
    const custom = Boolean(opts.from || opts.to);
    const now = new Date();
    const until = opts.to
      ? new Date(new Date(`${opts.to}T00:00:00${BRAZZAVILLE}`).getTime() + DAY)
      : now;
    const since = opts.from
      ? new Date(`${opts.from}T00:00:00${BRAZZAVILLE}`)
      : new Date(until.getTime() - (opts.days ?? 30) * DAY);
    if (since >= until) {
      throw new BadRequestException({
        code: 'INVALID_PERIOD',
        message: 'La date de début doit précéder la date de fin.',
      });
    }
    const days = Math.max(
      1,
      Math.ceil((until.getTime() - since.getTime()) / DAY),
    );
    const inPeriod = { gte: since, lt: until };
    const [
      usersTotal,
      usersNew,
      suspended,
      banned,
      activeRows,
      paySuccess,
      payByStatus,
      stalePending,
      genByStatus,
      ledgerSold,
      ledgerReserved,
      ledgerRefunded,
      topUps,
      revenueSeries,
      signupSeries,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { createdAt: inPeriod } }),
      this.prisma.user.count({ where: { status: 'SUSPENDED' } }),
      this.prisma.user.count({ where: { status: 'BANNED' } }),
      this.prisma.session.groupBy({
        by: ['userId'],
        where: { createdAt: inPeriod },
      }),
      this.prisma.payment.aggregate({
        where: { status: 'SUCCESS', creditedAt: inPeriod },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.payment.groupBy({
        by: ['status'],
        where: { createdAt: inPeriod },
        _count: true,
        _sum: { amount: true },
      }),
      this.prisma.payment.count({
        where: {
          status: { in: ['INITIATED', 'PENDING'] },
          createdAt: { lt: new Date(Date.now() - 30 * 60_000) },
        },
      }),
      this.prisma.generation.groupBy({
        by: ['status'],
        where: { createdAt: inPeriod },
        _count: true,
      }),
      this.prisma.creditLedger.aggregate({
        where: {
          type: { in: ['PURCHASE', 'FIRST_PURCHASE_BONUS'] },
          createdAt: inPeriod,
        },
        _sum: { amount: true },
      }),
      this.prisma.creditLedger.aggregate({
        where: { type: 'RESERVE', createdAt: inPeriod },
        _sum: { amount: true },
      }),
      this.prisma.creditLedger.aggregate({
        where: { type: 'RELEASE', createdAt: inPeriod },
        _sum: { amount: true },
      }),
      this.prisma.providerTopUp.aggregate({
        _sum: { amountUsd: true },
        _count: true,
      }),
      this.daily('Payment', since, until),
      this.daily('User', since, until),
    ]);

    const gen = (s: string) =>
      genByStatus.find((g) => g.status === s)?._count ?? 0;
    const pay = (s: string) => payByStatus.find((p) => p.status === s);
    const volume = payByStatus.reduce((n, p) => n + (p._sum.amount ?? 0), 0);

    // Estimation du solde Higgsfield : recharges saisies moins le coût fournisseur des générations non échouées.
    const billed = await this.prisma.generation.findMany({
      where: { status: { in: ['SUBMITTED', 'PROCESSING', 'COMPLETED'] } },
      select: {
        billableSeconds: true,
        product: {
          select: {
            billingUnit: true,
            providerCostUsdPerUnit: true,
            billableMultiplier: true,
          },
        },
      },
    });
    const consumedUsd = billed.reduce((sum, g) => {
      const units =
        g.product.billingUnit === 'SECOND' ? (g.billableSeconds ?? 0) : 1;
      return (
        sum +
        g.product.providerCostUsdPerUnit.toNumber() *
          units *
          g.product.billableMultiplier
      );
    }, 0);
    const topUpsUsd = topUps._sum.amountUsd?.toNumber() ?? 0;
    const known = topUps._count > 0;

    const stats: AdminStats = {
      periodDays: days,
      periodFrom: since.toISOString(),
      periodTo: until.toISOString(),
      custom,
      users: {
        total: usersTotal,
        newInPeriod: usersNew,
        activeInPeriod: activeRows.length,
        suspended,
        banned,
      },
      payments: {
        revenueFcfa: paySuccess._sum.amount ?? 0,
        successCount: paySuccess._count,
        pendingCount:
          (pay('INITIATED')?._count ?? 0) + (pay('PENDING')?._count ?? 0),
        failedCount:
          (pay('FAILED')?._count ?? 0) + (pay('CANCELLED')?._count ?? 0),
        volumeFcfa: volume,
      },
      generations: {
        pending: gen('PENDING') + gen('SUBMITTED'),
        processing: gen('PROCESSING'),
        completed: gen('COMPLETED'),
        failed: gen('FAILED'),
      },
      credits: {
        sold: ledgerSold._sum.amount ?? 0,
        // RESERVE est négatif, RELEASE positif : consommation nette = réservé − remboursé.
        consumed: Math.max(
          0,
          -(ledgerReserved._sum.amount ?? 0) -
            (ledgerRefunded._sum.amount ?? 0),
        ),
      },
      providerBalance: {
        known,
        topUpsUsd,
        estimatedConsumedUsd: Math.round(consumedUsd * 100) / 100,
        estimatedBalanceUsd: Math.round((topUpsUsd - consumedUsd) * 100) / 100,
      },
      series: { revenue: revenueSeries, signups: signupSeries },
      alerts: [],
    };
    stats.alerts = await this.alerts(stats, stalePending);
    return stats;
  }

  private async alerts(
    stats: AdminStats,
    stalePending: number,
  ): Promise<AdminAlert[]> {
    const alerts: AdminAlert[] = [];
    if (stalePending > 0) {
      alerts.push({
        key: 'stale-payments',
        level: 'warning',
        message: `${stalePending} paiement(s) en attente depuis plus de 30 minutes.`,
        href: '/admin/paiements?status=PENDING',
      });
    }
    const uncredited = await this.prisma.payment.count({
      where: { status: 'SUCCESS', creditedAt: null },
    });
    if (uncredited > 0) {
      alerts.push({
        key: 'uncredited-payments',
        level: 'critical',
        message: `${uncredited} paiement(s) confirmé(s) par le fournisseur mais non crédité(s) : à régulariser.`,
        href: '/admin/paiements?anomaly=uncredited',
      });
    }
    const [failureAlert, balanceAlert, maintenance] = await Promise.all([
      this.settingNumber('failureRateAlertPercent', 20),
      this.settingNumber('providerBalanceAlertUsd', 10),
      this.settings.get('maintenanceMode'),
    ]);
    const finished = stats.generations.completed + stats.generations.failed;
    if (
      finished >= 10 &&
      (stats.generations.failed / finished) * 100 > failureAlert
    ) {
      alerts.push({
        key: 'failure-rate',
        level: 'critical',
        message: `Taux d’échec des générations élevé : ${Math.round((stats.generations.failed / finished) * 100)} % (seuil ${failureAlert} %).`,
        href: '/admin/generations?status=FAILED',
      });
    }
    if (
      stats.providerBalance.known &&
      stats.providerBalance.estimatedBalanceUsd < balanceAlert
    ) {
      alerts.push({
        key: 'provider-balance',
        level: 'critical',
        message: `Solde Higgsfield estimé bas : ${stats.providerBalance.estimatedBalanceUsd} $ (seuil ${balanceAlert} $). Rechargez puis saisissez la recharge.`,
        href: '/admin/finances',
      });
    }
    if (maintenance) {
      alerts.push({
        key: 'maintenance',
        level: 'info',
        message: 'Le mode maintenance est activé.',
        href: '/admin/parametres',
      });
    }
    const bad = await this.offer.packsBelowMargin();
    if (bad.length) {
      alerts.push({
        key: 'margin',
        level: 'warning',
        message: `Marge insuffisante sur : ${bad.join(', ')}.`,
        href: '/admin/packs',
      });
    }
    if (
      this.email.providerName === 'console' &&
      this.config.get('NODE_ENV', { infer: true }) === 'production'
    ) {
      alerts.push({
        key: 'email',
        level: 'critical',
        message:
          'Les e-mails ne sont pas configurés : les clients ne peuvent pas valider leur adresse.',
        href: '/admin/parametres',
      });
    }
    return alerts;
  }

  private async settingNumber(key: string, fallback: number): Promise<number> {
    const row = await this.prisma.setting.findUnique({ where: { key } });
    return typeof row?.value === 'number' ? row.value : fallback;
  }

  // ───────────── Paiements et finances ─────────────

  private paymentWhere(q: ListQuery): Prisma.PaymentWhereInput {
    const where: Prisma.PaymentWhereInput = {};
    if (
      q.status &&
      ['INITIATED', 'PENDING', 'SUCCESS', 'FAILED', 'CANCELLED'].includes(
        q.status,
      )
    )
      where.status = q.status as 'PENDING';
    if (q.provider) where.gateway = q.provider;
    if (q.country) where.country = q.country;
    if (q.method) where.OR = [{ methodCode: q.method }, { network: q.method }];
    if (q.userId) where.userId = q.userId;
    if (q.q) {
      where.AND = [
        {
          OR: [
            { user: { email: { contains: q.q, mode: 'insensitive' } } },
            { externalReference: { contains: q.q, mode: 'insensitive' } },
            // Numéro du payeur : la recherche d'un paiement part souvent du téléphone donné au guichet.
            { payerPhone: { contains: q.q } },
          ],
        },
      ];
    }
    if (q.from || q.to) {
      const { from, end } = range(q, 3650);
      where.createdAt = { gte: from, lt: end };
    }
    const anomaly = anomalyWhere(q.anomaly);
    if (anomaly) Object.assign(where, anomaly);
    return where;
  }

  private paymentRow(
    p: Prisma.PaymentGetPayload<{ include: typeof PAYMENT_INCLUDE }>,
  ): AdminPaymentRow {
    const last = (p.lastProviderStatus ?? null) as {
      at?: string;
      error?: string;
      rejected?: string;
    } | null;
    return {
      id: p.id,
      user: { id: p.userId, email: p.user.email },
      packName: p.pack?.name ?? CUSTOM_PURCHASE_LABEL,
      amount: p.amount,
      credits: p.credits,
      operator: p.operator,
      status: p.status,
      externalReference: p.externalReference,
      failureReason: p.failureReason,
      createdAt: p.createdAt.toISOString(),
      confirmedAt: p.creditedAt?.toISOString() ?? null,
      country: p.country,
      countryName: p.countryName,
      currency: p.currency,
      methodCode: p.methodCode,
      methodName: p.methodName,
      provider: p.gateway,
      network: p.network,
      sentAmount: p.sentAmount,
      clientFee: p.clientFee,
      debitedAmount: p.debitedAmount,
      lastCheckedAt: typeof last?.at === 'string' ? last.at : null,
      issue: paymentIssue(p.status, last),
      creditState: creditStateOf(p.status, p.creditedAt),
      creditOrigin: p.creditOrigin,
      needsAttention:
        (p.status === 'SUCCESS' && p.creditedAt === null) ||
        p.failureReason === MISMATCH_REASON,
    };
  }

  /**
   * Compteurs du journal : mêmes filtres que la liste (recherche, fournisseur, pays, moyen, période), mais SANS
   * le statut ni l'anomalie — ce sont justement eux que ces chiffres décomposent. Un filtre « en attente » ne
   * fait donc pas tomber les autres compteurs à zéro.
   */
  async paymentStats(q: ListQuery): Promise<AdminPaymentStats> {
    const where = this.paymentWhere({
      ...q,
      status: undefined,
      anomaly: undefined,
    });
    const count = (extra: Prisma.PaymentWhereInput) =>
      this.prisma.payment.count({ where: { ...where, ...extra } });
    const [
      total,
      success,
      pending,
      failed,
      confirmedNotCredited,
      manuallySettled,
    ] = await Promise.all([
      count({}),
      count({ status: 'SUCCESS' }),
      count({ status: { in: ['INITIATED', 'PENDING'] } }),
      count({ status: { in: ['FAILED', 'CANCELLED'] } }),
      count({ status: 'SUCCESS', creditedAt: null }),
      count({ creditOrigin: 'MANUAL' }),
    ]);
    return {
      total,
      success,
      pending,
      failed,
      confirmedNotCredited,
      manuallySettled,
    };
  }

  /**
   * Régularisation d'un paiement confirmé non crédité. Toute la logique (vérification auprès du fournisseur,
   * protection contre la double attribution, audit, notification) vit dans PaymentsService : l'administration
   * ne fait que transmettre l'identité de l'administrateur responsable.
   */
  async settlePayment(
    adminId: string,
    id: string,
    body: PaymentSettleInput,
    ip?: string,
  ) {
    return this.payments.settlePayment({
      paymentId: id,
      adminId,
      mode: body.mode,
      proofReference: body.proofReference,
      reason: body.reason,
      justification: body.justification,
      ip,
    });
  }

  async listPayments(q: ListQuery): Promise<Page<AdminPaymentRow>> {
    const where = this.paymentWhere(q);
    const total = await this.prisma.payment.count({ where });
    const page = clampPage(q.page, total, q.pageSize);
    const rows = await this.prisma.payment.findMany({
      where,
      orderBy: orderBy(q, ['createdAt', 'amount', 'status'], {
        field: 'createdAt',
        dir: 'desc',
      }),
      skip: (page - 1) * q.pageSize,
      take: q.pageSize,
      include: PAYMENT_INCLUDE,
    });
    return buildPage(
      rows.map((p) => this.paymentRow(p)),
      total,
      page,
      q.pageSize,
    );
  }

  /** Fiche d'un paiement avec sa chronologie (création, notifications reçues, vérifications manuelles, crédit). */
  async getPayment(id: string): Promise<AdminPaymentDetail> {
    const p = await this.prisma.payment.findUnique({
      where: { id },
      include: PAYMENT_INCLUDE,
    });
    if (!p)
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Paiement introuvable.',
      });
    const [webhooks, audits, checks] = await Promise.all([
      p.externalReference
        ? this.prisma.paymentWebhookEvent.findMany({
            where: { gateway: p.gateway, providerTxId: p.externalReference },
            orderBy: { receivedAt: 'asc' },
          })
        : [],
      this.prisma.auditLog.findMany({
        where: { entityType: 'Payment', entityId: id },
        orderBy: { createdAt: 'asc' },
        include: { actor: { select: { email: true } } },
      }),
      this.prisma.paymentCheck.findMany({
        where: { paymentId: id },
        orderBy: { createdAt: 'asc' },
        take: 200,
        include: { actor: { select: { email: true } } },
      }),
    ]);
    const timeline: AdminPaymentEvent[] = [
      {
        at: p.createdAt.toISOString(),
        kind: 'created',
        label: 'Paiement créé',
        detail: `${p.amount} ${p.currency}${p.sentAmount != null ? ` (envoyé : ${p.sentAmount})` : ''}`,
      },
      ...webhooks.map((w) => ({
        at: w.receivedAt.toISOString(),
        kind: 'webhook' as const,
        label: `Notification reçue : ${w.event}`,
        detail: w.processedAt
          ? 'Signature vérifiée, vérification déclenchée'
          : 'Signature vérifiée, transaction pas encore rattachée',
      })),
      ...audits.map((a) => ({
        at: a.createdAt.toISOString(),
        kind: 'verification' as const,
        label: 'Vérification manuelle',
        detail: `Par ${a.actor?.email ?? 'un administrateur'} : ${statusOf(a.before)} → ${statusOf(a.after)}`,
      })),
    ];
    if (p.creditedAt) {
      const manual = p.creditOrigin === 'MANUAL';
      timeline.push({
        at: p.creditedAt.toISOString(),
        kind: manual ? 'settled' : 'credited',
        label: manual ? 'Crédits régularisés manuellement' : 'Crédits ajoutés',
        detail: `${p.credits + p.bonusCredits} crédits${manual && p.creditedBy ? ` · par ${p.creditedBy.email}` : ''}`,
      });
    } else if (p.status === 'FAILED' || p.status === 'CANCELLED') {
      timeline.push({
        at: p.updatedAt.toISOString(),
        kind: 'failed',
        label: p.status === 'FAILED' ? 'Paiement échoué' : 'Paiement annulé',
        detail: p.failureReason,
      });
    }
    timeline.sort((a, b) => a.at.localeCompare(b.at));
    const snap = p.feeSnapshot as {
      source?: string;
      fee?: number;
      total?: number;
      absorbed?: number;
    } | null;
    return {
      ...this.paymentRow(p),
      country: p.country,
      currency: p.currency,
      payerPhone: p.payerPhone,
      bonusCredits: p.bonusCredits,
      creditedAt: p.creditedAt?.toISOString() ?? null,
      fee:
        snap && typeof snap.fee === 'number'
          ? {
              source: snap.source ?? 'inconnue',
              fee: snap.fee,
              total: snap.total ?? p.amount,
              absorbed: snap.absorbed ?? 0,
            }
          : null,
      timeline,
      creditedBy: p.creditedBy?.email ?? null,
      checks: checks.map((c): AdminPaymentCheck => ({
        at: c.createdAt.toISOString(),
        kind: c.kind,
        source: c.source,
        outcome: c.outcome,
        amount: c.amount,
        currency: c.currency,
        proofReference: c.proofReference,
        detail: c.detail,
        actor: c.actor?.email ?? null,
      })),
      reconcileAttempts: p.reconcileAttempts,
      lastReconcileAt: p.lastReconcileAt?.toISOString() ?? null,
      lastReconcileError: p.lastReconcileError,
      // Régularisable tant que les crédits ne sont pas attribués et qu'une référence fournisseur existe.
      canSettle: p.creditedAt === null && p.externalReference !== null,
    };
  }

  /** Revérifie auprès du fournisseur. N'invente jamais un statut : le crédit n'a lieu que si le fournisseur confirme. */
  async verifyPayment(
    adminId: string,
    id: string,
    ip?: string,
  ): Promise<{ status: string }> {
    const payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment)
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Paiement introuvable.',
      });
    // recheck : rejoue l'initiation si elle est restée sans réponse (même clé), puis vérifie chez le fournisseur.
    const status = await this.payments.recheck(id);
    await this.audit.log({
      actorId: adminId,
      action: 'payment.manual_verify',
      entityType: 'Payment',
      entityId: id,
      before: { status: payment.status },
      after: { status },
      reason: 'Vérification manuelle du statut',
      ip,
    });
    return { status };
  }

  async exportPaymentsCsv(q: ListQuery): Promise<string> {
    const rows = await this.prisma.payment.findMany({
      where: this.paymentWhere(q),
      orderBy: { createdAt: 'asc' },
      take: 20_000,
      include: PAYMENT_INCLUDE,
    });
    const head = [
      'id',
      'date',
      'client',
      'pack',
      'montant_fcfa',
      'credits',
      'operateur',
      'statut',
      'reference_fournisseur',
      'fournisseur',
      'reseau',
      'montant_envoye',
      'frais_client',
      'montant_debite',
    ];
    const lines = rows.map((p) =>
      [
        p.id,
        p.createdAt.toISOString(),
        p.user.email,
        p.pack?.name ?? CUSTOM_PURCHASE_LABEL,
        p.amount,
        p.credits,
        p.operator,
        p.status,
        p.externalReference,
        p.gateway,
        p.network,
        p.sentAmount,
        p.clientFee,
        p.debitedAmount,
      ]
        .map(csvCell)
        .join(','),
    );
    return [head.map(csvCell).join(','), ...lines].join('\r\n');
  }

  async financeSummary(q: {
    from?: string;
    to?: string;
  }): Promise<FinanceSummary> {
    const { from, end } = range(q, 30);
    const [pay, sold, reserved, refunded, topUps, payouts] = await Promise.all([
      this.prisma.payment.aggregate({
        where: { status: 'SUCCESS', creditedAt: { gte: from, lt: end } },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.creditLedger.aggregate({
        where: {
          type: { in: ['PURCHASE', 'FIRST_PURCHASE_BONUS'] },
          createdAt: { gte: from, lt: end },
        },
        _sum: { amount: true },
      }),
      this.prisma.creditLedger.aggregate({
        where: { type: 'RESERVE', createdAt: { gte: from, lt: end } },
        _sum: { amount: true },
      }),
      this.prisma.creditLedger.aggregate({
        where: { type: 'RELEASE', createdAt: { gte: from, lt: end } },
        _sum: { amount: true },
      }),
      this.prisma.providerTopUp.aggregate({
        where: { createdAt: { gte: from, lt: end } },
        _sum: { amountUsd: true, amountXaf: true },
      }),
      this.prisma.payoutRecord.aggregate({
        where: { date: { gte: from, lt: end } },
        _sum: { amountXaf: true, commissionXaf: true },
      }),
    ]);
    return {
      from: from.toISOString().slice(0, 10),
      to: new Date(end.getTime() - DAY).toISOString().slice(0, 10),
      collectedFcfa: pay._sum.amount ?? 0,
      paymentsCount: pay._count,
      creditsSold: sold._sum.amount ?? 0,
      // RESERVE est négatif, RELEASE positif : consommation nette = réservé − remboursé.
      creditsConsumed: Math.max(
        0,
        -(reserved._sum.amount ?? 0) - (refunded._sum.amount ?? 0),
      ),
      topUpsUsd: topUps._sum.amountUsd?.toNumber() ?? 0,
      topUpsXaf: topUps._sum.amountXaf ?? 0,
      payoutsXaf: payouts._sum.amountXaf ?? 0,
      payoutCommissionXaf: payouts._sum.commissionXaf ?? 0,
    };
  }

  async listTopUps(): Promise<TopUpRow[]> {
    const rows = await this.prisma.providerTopUp.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((r) => ({
      id: r.id,
      amountUsd: r.amountUsd.toNumber(),
      amountXaf: r.amountXaf,
      fxRate: r.fxRate.toNumber(),
      note: r.note,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async addTopUp(
    adminId: string,
    input: TopUpInput,
    ip?: string,
  ): Promise<void> {
    const fxRate =
      Math.round((input.amountXaf / input.amountUsd) * 10_000) / 10_000;
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.providerTopUp.create({
        data: {
          amountUsd: input.amountUsd,
          amountXaf: input.amountXaf,
          fxRate,
          note: input.note,
          createdById: adminId,
        },
      });
      await this.audit.log(
        {
          actorId: adminId,
          action: 'finance.topup',
          entityType: 'ProviderTopUp',
          entityId: row.id,
          after: { amountUsd: input.amountUsd, amountXaf: input.amountXaf },
          reason: input.note ?? 'Recharge Higgsfield',
          ip,
        },
        tx,
      );
    });
  }

  async listPayouts(): Promise<PayoutRow[]> {
    const rows = await this.prisma.payoutRecord.findMany({
      orderBy: { date: 'desc' },
      take: 100,
    });
    return rows.map((r) => ({
      id: r.id,
      amountXaf: r.amountXaf,
      commissionXaf: r.commissionXaf,
      date: r.date.toISOString().slice(0, 10),
      note: r.note,
    }));
  }

  async addPayout(
    adminId: string,
    input: PayoutInput,
    ip?: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.payoutRecord.create({
        data: {
          amountXaf: input.amountXaf,
          commissionXaf: input.commissionXaf,
          date: new Date(`${input.date}T00:00:00Z`),
          note: input.note,
          createdById: adminId,
        },
      });
      await this.audit.log(
        {
          actorId: adminId,
          action: 'finance.payout',
          entityType: 'PayoutRecord',
          entityId: row.id,
          after: {
            amountXaf: input.amountXaf,
            commissionXaf: input.commissionXaf,
          },
          reason: input.note ?? 'Retrait SasPay',
          ip,
        },
        tx,
      );
    });
  }

  // ───────────── Générations ─────────────

  async listGenerations(
    q: ListQuery & { presetId?: string },
  ): Promise<Page<AdminGenerationRow>> {
    const where: Prisma.GenerationWhereInput = {};
    if (
      q.status &&
      [
        'PENDING',
        'SUBMITTED',
        'PROCESSING',
        'COMPLETED',
        'FAILED',
        'CANCELLED',
      ].includes(q.status)
    )
      where.status = q.status as 'PENDING';
    if (q.q) {
      const term = q.q;
      where.OR = [
        { user: { email: { contains: term, mode: 'insensitive' } } },
        { prompt: { contains: term, mode: 'insensitive' } },
        // L'identifiant est un UUID : ne le comparer que si la saisie en a la forme, sinon Prisma refuse la requête.
        ...(UUID.test(term) ? [{ id: term }] : []),
      ];
    }
    if (q.product) where.product = { code: q.product };
    if (q.presetId && UUID.test(q.presetId)) where.presetId = q.presetId;
    if (q.from || q.to) {
      const { from, end } = range(q, 3650);
      where.createdAt = { gte: from, lt: end };
    }
    const total = await this.prisma.generation.count({ where });
    const page = clampPage(q.page, total, q.pageSize);
    const rows = await this.prisma.generation.findMany({
      where,
      orderBy: orderBy(q, ['createdAt', 'creditsCost', 'status'], {
        field: 'createdAt',
        dir: 'desc',
      }),
      skip: (page - 1) * q.pageSize,
      take: q.pageSize,
      select: {
        id: true,
        userId: true,
        status: true,
        creditsCost: true,
        hidden: true,
        createdAt: true,
        user: { select: { email: true } },
        product: { select: { name: true } },
        preset: { select: { name: true } },
      },
    });
    return buildPage(
      rows.map((g) => ({
        id: g.id,
        user: { id: g.userId, email: g.user.email },
        product: g.product.name,
        preset: g.preset?.name ?? null,
        status: g.status,
        creditsCost: g.creditsCost,
        hidden: g.hidden,
        createdAt: g.createdAt.toISOString(),
      })),
      total,
      page,
      q.pageSize,
    );
  }

  /** Masque (ou ré-affiche) une création. Le fichier n'est pas supprimé ici : la suppression des fichiers dépend du stockage (lot générations). */
  async setGenerationHidden(
    adminId: string,
    id: string,
    hidden: boolean,
    reason: string,
    ip?: string,
  ): Promise<void> {
    const gen = await this.prisma.generation.findUnique({ where: { id } });
    if (!gen)
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Création introuvable.',
      });
    await this.prisma.$transaction(async (tx) => {
      await tx.generation.update({ where: { id }, data: { hidden } });
      await tx.moderationAction.create({
        data: {
          generationId: id,
          targetUserId: gen.userId,
          action: hidden ? 'HIDE_CREATION' : 'VERIFY_CREATION',
          reason,
          actorId: adminId,
        },
      });
      await this.audit.log(
        {
          actorId: adminId,
          action: hidden ? 'generation.hide' : 'generation.unhide',
          entityType: 'Generation',
          entityId: id,
          before: { hidden: gen.hidden },
          after: { hidden },
          reason,
          ip,
        },
        tx,
      );
    });
  }

  // ───────────── Paramètres ─────────────

  async getSettings(): Promise<SettingsView> {
    const rows = await this.prisma.setting.findMany();
    const stored = new Map(rows.map((r) => [r.key, r.value]));
    const values: SettingsView['values'] = {};
    for (const [key, kind] of Object.entries(EDITABLE_SETTINGS)) {
      const v = stored.get(key);
      const fallback = (SETTING_DEFAULTS as Record<string, unknown>)[key];
      values[key] = (
        typeof v === kind
          ? v
          : (fallback ??
            (kind === 'number' ? 0 : kind === 'boolean' ? false : ''))
      ) as never;
    }
    return { values, email: { provider: this.email.providerName } };
  }

  async updateSettings(
    adminId: string,
    input: SettingsUpdateInput,
    ip?: string,
  ): Promise<SettingsView> {
    const before = (await this.getSettings()).values;
    const changes: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(input.values)) {
      const kind = (EDITABLE_SETTINGS as Record<string, string>)[key];
      if (!kind)
        throw new BadRequestException({
          code: 'UNKNOWN_SETTING',
          message: `Paramètre inconnu : ${key}.`,
        });
      if (typeof value !== kind)
        throw new BadRequestException({
          code: 'INVALID_SETTING',
          message: `Valeur invalide pour ${key}.`,
        });
      if (
        typeof value === 'number' &&
        (!Number.isFinite(value) || value < 0 || value > 1_000_000)
      )
        throw new BadRequestException({
          code: 'INVALID_SETTING',
          message: `Valeur hors limites pour ${key}.`,
        });
      if (key.endsWith('Percent') && (value as number) > 100)
        throw new BadRequestException({
          code: 'INVALID_SETTING',
          message: `${key} ne peut pas dépasser 100.`,
        });
      if (
        key === 'loginOtpMode' &&
        !['off', 'admin', 'all'].includes(value as string)
      )
        throw new BadRequestException({
          code: 'INVALID_SETTING',
          message: 'loginOtpMode : off, admin ou all.',
        });
      if (key === 'creditValueFcfa' && (value as number) <= 0)
        throw new BadRequestException({
          code: 'INVALID_SETTING',
          message: 'Le prix du crédit doit être supérieur à zéro.',
        });
      if (key === 'maintenanceMessage' && (value as string).trim().length === 0)
        throw new BadRequestException({
          code: 'INVALID_SETTING',
          message: 'Le message de maintenance ne peut pas être vide.',
        });
      if (before[key] !== value) changes[key] = value;
    }
    if (Object.keys(changes).length === 0)
      return { values: before, email: { provider: this.email.providerName } };

    await this.prisma.$transaction(async (tx) => {
      for (const [key, value] of Object.entries(changes)) {
        await tx.setting.upsert({
          where: { key },
          update: { value, updatedById: adminId },
          create: { key, value, updatedById: adminId },
        });
      }
      await this.audit.log(
        {
          actorId: adminId,
          action: 'settings.update',
          entityType: 'Setting',
          before: Object.fromEntries(
            Object.keys(changes).map((k) => [k, before[k]]),
          ),
          after: changes,
          reason: input.reason,
          ip,
        },
        tx,
      );
    });
    return this.getSettings();
  }

  // ───────────── Textes légaux ─────────────

  async listLegal(): Promise<LegalVersionRow[]> {
    const rows = await this.prisma.legalDocument.findMany({
      orderBy: [{ type: 'asc' }, { version: 'desc' }],
    });
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      version: r.version,
      major: r.major,
      publishedAt: r.publishedAt.toISOString(),
      content: r.content,
    }));
  }

  /** Publie une nouvelle version (les anciennes sont conservées). Une version majeure impose une nouvelle acceptation. */
  async publishLegal(
    adminId: string,
    input: LegalPublishInput,
    ip?: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const last = await tx.legalDocument.findFirst({
        where: { type: input.type },
        orderBy: { version: 'desc' },
      });
      const doc = await tx.legalDocument.create({
        data: {
          type: input.type,
          version: (last?.version ?? 0) + 1,
          content: input.content,
          major: input.major,
        },
      });
      await this.audit.log(
        {
          actorId: adminId,
          action: 'legal.publish',
          entityType: 'LegalDocument',
          entityId: doc.id,
          before: { version: last?.version ?? null },
          after: { version: doc.version, major: doc.major },
          reason: input.reason,
          ip,
        },
        tx,
      );
    });
  }

  // ───────────── Audit ─────────────

  async listAudit(q: ListQuery): Promise<AdminAuditPage> {
    const summary = await this.auditSummary();
    const where: Prisma.AuditLogWhereInput = {};
    if (q.q) {
      where.OR = [
        { action: { contains: q.q, mode: 'insensitive' } },
        { entityType: { contains: q.q, mode: 'insensitive' } },
        { actor: { email: { contains: q.q, mode: 'insensitive' } } },
      ];
    }
    if (q.actor)
      where.actor = { email: { contains: q.actor, mode: 'insensitive' } };
    if (q.entity) where.entityType = q.entity;
    if (q.from || q.to) {
      const { from, end } = range(q, 3650);
      where.createdAt = { gte: from, lt: end };
    }
    const total = await this.prisma.auditLog.count({ where });
    const page = clampPage(q.page, total, q.pageSize);
    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: orderBy(q, ['createdAt', 'action', 'entityType'], {
        field: 'createdAt',
        dir: 'desc',
      }),
      skip: (page - 1) * q.pageSize,
      take: q.pageSize,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        before: true,
        after: true,
        reason: true,
        ip: true,
        createdAt: true,
        actor: { select: { email: true } },
      },
    });
    const pageResult = buildPage(
      rows.map((r) => ({
        id: r.id,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        actor: r.actor?.email ?? null,
        before: r.before,
        after: r.after,
        reason: r.reason,
        ip: r.ip,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      page,
      q.pageSize,
    );
    return { ...pageResult, summary };
  }

  /**
   * Synthèse du journal, calculée sur TOUTES les entrées (jamais sur la page affichée) et indépendante des filtres.
   *
   * Il n'existe pas de notion de gravité dans le journal : plutôt que d'inventer une liste d'actions « critiques »,
   * la synthèse distingue ce qu'un administrateur a fait de ce que le système a écrit seul (webhooks, tâches).
   */
  async auditSummary(): Promise<AdminAuditPage['summary']> {
    const [total, today, byAdmin, entities] = await Promise.all([
      this.prisma.auditLog.count(),
      this.prisma.auditLog.count({
        where: { createdAt: { gte: startOfToday() } },
      }),
      this.prisma.auditLog.count({ where: { actorId: { not: null } } }),
      this.prisma.auditLog.groupBy({ by: ['entityType'] }),
    ]);
    return {
      total,
      today,
      byAdmin,
      bySystem: total - byAdmin,
      entityTypes: entities.map((e) => e.entityType).sort(),
    };
  }

  // ───────────── Comptes administrateurs ─────────────

  async listAdmins(): Promise<AdminAccount[]> {
    const rows = await this.prisma.user.findMany({
      where: { role: 'ADMIN' },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((u) => ({
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      createdAt: u.createdAt.toISOString(),
    }));
  }

  /** Donne le rôle administrateur à un compte EXISTANT et vérifié. Le rôle ne s'obtient jamais par l'inscription. */
  async promote(
    adminId: string,
    input: PromoteAdminInput,
    ip?: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
    });
    if (!user || user.deletedAt) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message:
          'Aucun compte avec cette adresse. La personne doit d’abord s’inscrire.',
      });
    }
    if (user.role === 'ADMIN')
      throw new ConflictException({
        code: 'ALREADY_ADMIN',
        message: 'Ce compte est déjà administrateur.',
      });
    if (!user.emailVerifiedAt || user.status !== 'ACTIVE') {
      throw new BadRequestException({
        code: 'NOT_ELIGIBLE',
        message: 'Le compte doit être actif et son adresse e-mail vérifiée.',
      });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
      await this.audit.log(
        {
          actorId: adminId,
          action: 'admin.promote',
          entityType: 'User',
          entityId: user.id,
          before: { role: 'USER' },
          after: { role: 'ADMIN' },
          reason: input.reason,
          ip,
        },
        tx,
      );
    });
    await this.email.sendAccountNotice(
      user.email,
      user.firstName,
      'Accès administrateur accordé',
      'Votre compte Yamboka dispose désormais d’un accès à l’administration.',
    );
  }

  /** Retire le rôle. Interdit sur soi-même, et on garde toujours au moins un administrateur. */
  async demote(
    adminId: string,
    targetId: string,
    reason: string,
    ip?: string,
  ): Promise<void> {
    if (adminId === targetId)
      throw new BadRequestException({
        code: 'SELF_ACTION',
        message: 'Vous ne pouvez pas retirer votre propre accès.',
      });
    await this.prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id: targetId } });
      if (!target || target.role !== 'ADMIN')
        throw new NotFoundException({
          code: 'NOT_FOUND',
          message: 'Administrateur introuvable.',
        });
      const count = await tx.user.count({ where: { role: 'ADMIN' } });
      if (count <= 1)
        throw new ConflictException({
          code: 'LAST_ADMIN',
          message: 'Impossible : il doit rester au moins un administrateur.',
        });
      await tx.user.update({ where: { id: targetId }, data: { role: 'USER' } });
      await this.audit.log(
        {
          actorId: adminId,
          action: 'admin.demote',
          entityType: 'User',
          entityId: targetId,
          before: { role: 'ADMIN' },
          after: { role: 'USER' },
          reason,
          ip,
        },
        tx,
      );
    });
  }

  // ───────────── E-mail ─────────────

  /** Vérifie le transport puis envoie un message de test à l'adresse de l'administrateur connecté (jamais à une adresse libre). */
  async testEmail(
    adminId: string,
  ): Promise<{ ok: boolean; provider: string; detail: string }> {
    const admin = await this.prisma.user.findUniqueOrThrow({
      where: { id: adminId },
    });
    const diag = await this.email.diagnose();
    if (!diag.ok)
      return { ok: false, provider: diag.provider, detail: diag.detail };
    try {
      await this.email.sendTest(admin.email);
      return {
        ok: true,
        provider: diag.provider,
        detail: `Message de test envoyé à ${admin.email}.`,
      };
    } catch {
      return {
        ok: false,
        provider: diag.provider,
        detail:
          'Connexion établie mais l’envoi a été refusé : vérifiez EMAIL_FROM et le domaine autorisé.',
      };
    }
  }
}

/** Statut lu dans un enregistrement d'audit (`{ status }`), « ? » s'il est absent. */
function statusOf(value: unknown): string {
  const status = (value as { status?: unknown } | null)?.status;
  return typeof status === 'string' ? status : '?';
}

/**
 * Problème de traitement à signaler à l'administrateur, déduit de la dernière réponse du fournisseur.
 * Seulement tant que le paiement n'est pas conclu : un paiement réussi n'a plus rien à signaler.
 */
/**
 * État de l'attribution des crédits, lu sur le paiement : `creditedAt` n'est renseigné que par la transaction
 * qui écrit réellement le mouvement au registre.
 */
function creditStateOf(
  status: string,
  creditedAt: Date | null,
): PaymentCreditState {
  if (creditedAt) return 'CREDITED';
  return status === 'SUCCESS' ? 'NOT_CREDITED' : 'NONE';
}

/** Traduit une anomalie choisie dans le journal en condition de recherche. */
function anomalyWhere(
  anomaly: ListQuery['anomaly'],
): Prisma.PaymentWhereInput | null {
  switch (anomaly) {
    case 'pending':
      return { status: { in: ['INITIATED', 'PENDING'] } };
    case 'uncredited':
      return { status: 'SUCCESS', creditedAt: null };
    case 'settled':
      return { creditOrigin: 'MANUAL' };
    case 'attention':
      return {
        OR: [
          { status: 'SUCCESS', creditedAt: null },
          { status: 'FAILED', failureReason: MISMATCH_REASON },
          {
            lastReconcileError: { not: null },
            status: { in: ['INITIATED', 'PENDING'] },
          },
        ],
      };
    default:
      return null;
  }
}

function paymentIssue(
  status: string,
  last: { error?: string; rejected?: string } | null,
): string | null {
  if (status === 'SUCCESS' || !last) return null;
  if (last.rejected) return `Refusé par le fournisseur (${last.rejected})`;
  switch (last.error) {
    case 'auth':
      return 'Clé API refusée par le fournisseur : à corriger d’urgence';
    case 'unavailable':
      return 'Fournisseur injoignable à la dernière tentative';
    case 'invalid_response':
      return 'Réponse illisible du fournisseur à la dernière tentative';
    default:
      return null;
  }
}
