import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { firstPurchaseBonusCredits } from '../billing/bonus';
import { lockUserRow } from '../common/locks';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { allocateFifo, spendableTotal } from './fifo';

type Db = PrismaService | Prisma.TransactionClient;

/** Validité d'un lot créé par un ajustement manuel quand l'administrateur n'en précise pas. */
const DEFAULT_ADJUST_LOT_MONTHS = 12;

export class InsufficientCreditsException extends HttpException {
  constructor(required: number, available: number) {
    super(
      {
        code: 'INSUFFICIENT_CREDITS',
        message: `Solde insuffisant : il vous faut ${required} crédits, vous en avez ${available}.`,
        required,
        available,
        missing: required - available,
      },
      402,
    );
  }
}

export interface LedgerEntryView {
  id: string;
  type: string;
  amount: number;
  note: string | null;
  expiresAt: Date | null;
  createdAt: Date;
}

/**
 * Crédits : journal immuable + lots avec échéance.
 *
 * - `CreditLedger` (ajout seul, RG-02) est la source de vérité : le solde est la somme des mouvements.
 * - `CreditLot` porte, pour chaque entrée de crédits, ce qui reste à dépenser et son échéance. Il est mis à jour
 *   dans la MÊME transaction que le mouvement qui l'explique, donc la somme des lots égale toujours le solde.
 * - On dépense en priorité le lot qui expire le plus tôt (FIFO). Une réservation note, lot par lot, ce qu'elle a
 *   prélevé (`LotAllocation`) pour restituer les crédits au bon lot en cas d'échec.
 *
 * Toute opération qui lit puis écrit prend d'abord un verrou de ligne sur l'utilisateur : deux requêtes
 * simultanées pour un même utilisateur s'exécutent l'une après l'autre. Les références uniques rendent chaque
 * opération idempotente.
 */
@Injectable()
export class CreditsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Solde = somme du journal. */
  async getBalance(userId: string, db: Db = this.prisma): Promise<number> {
    const { _sum } = await db.creditLedger.aggregate({
      where: { userId },
      _sum: { amount: true },
    });
    return _sum.amount ?? 0;
  }

  /** Valeur d'un crédit dans la devise (XAF : 25 FCFA au lancement), paramétrable dans l'admin. */
  async creditValue(currency = 'XAF', db: Db = this.prisma): Promise<number> {
    const row = await db.currencySetting.findUnique({ where: { currency } });
    return row?.creditValue ?? 25;
  }

  // ───────────── Achat et bonus de premier achat ─────────────

  /**
   * Crédite un achat confirmé : un lot PURCHASE et, s'il s'agit du premier achat réussi du compte, un lot distinct
   * FIRST_PURCHASE_BONUS de même validité. À appeler dans la transaction qui fait passer le paiement à SUCCESS.
   *
   * - Références `pay:<réf>` et `firstbonus:<réf>` : un paiement ne crédite qu'une fois (RG-05).
   * - Le verrou utilisateur sérialise deux confirmations simultanées : la seconde voit déjà le premier achat.
   * - Un index unique en base garantit un seul bonus par compte même si ce code était contourné.
   */
  async grantPurchase(
    tx: Prisma.TransactionClient,
    p: {
      userId: string;
      paymentId: string;
      reference: string;
      baseCredits: number;
      expiresAt: Date;
      /** Pourcentage de bonus de premier achat promis pour ce paiement (0 = aucun). */
      bonusPercent: number;
    },
  ): Promise<{ created: boolean; bonusCredits: number }> {
    await lockUserRow(tx, p.userId);

    const payRef = `pay:${p.reference}`;
    const bonusRef = `firstbonus:${p.reference}`;
    const already = await tx.creditLedger.findUnique({
      where: { reference: payRef },
    });
    if (already) {
      const bonus = await tx.creditLedger.findUnique({
        where: { reference: bonusRef },
      });
      return { created: false, bonusCredits: bonus?.amount ?? 0 };
    }

    await this.addLot(tx, {
      userId: p.userId,
      amount: p.baseCredits,
      type: 'PURCHASE',
      reference: payRef,
      paymentId: p.paymentId,
      expiresAt: p.expiresAt,
      note: 'Achat de crédits',
    });

    let bonusCredits = 0;
    if (p.bonusPercent > 0) {
      const previousBonus = await tx.creditLedger.count({
        where: {
          userId: p.userId,
          type: 'FIRST_PURCHASE_BONUS',
          reference: { startsWith: 'firstbonus:' },
        },
      });
      const previousPurchases = await tx.payment.count({
        where: {
          userId: p.userId,
          status: 'SUCCESS',
          id: { not: p.paymentId },
        },
      });
      if (previousBonus === 0 && previousPurchases === 0) {
        bonusCredits = firstPurchaseBonusCredits(p.baseCredits, p.bonusPercent);
        if (bonusCredits > 0) {
          await this.addLot(tx, {
            userId: p.userId,
            amount: bonusCredits,
            type: 'FIRST_PURCHASE_BONUS',
            reference: bonusRef,
            paymentId: p.paymentId,
            expiresAt: p.expiresAt,
            note: 'Bonus de premier achat',
          });
        }
      }
    }
    return { created: true, bonusCredits };
  }

  /** Écrit un mouvement qui crée des crédits ET le lot qui les porte (même transaction). */
  private async addLot(
    tx: Prisma.TransactionClient,
    p: {
      userId: string;
      amount: number;
      type: 'PURCHASE' | 'FIRST_PURCHASE_BONUS' | 'ADMIN_ADJUST';
      reference: string;
      expiresAt: Date;
      paymentId?: string;
      note?: string;
      createdById?: string;
    },
  ): Promise<void> {
    const row = await tx.creditLedger.create({
      data: {
        userId: p.userId,
        amount: p.amount,
        type: p.type,
        reference: p.reference,
        paymentId: p.paymentId,
        expiresAt: p.expiresAt,
        note: p.note,
        createdById: p.createdById,
      },
    });
    await tx.creditLot.create({
      data: {
        userId: p.userId,
        kind: p.type,
        initialAmount: p.amount,
        remaining: p.amount,
        expiresAt: p.expiresAt,
        ledgerId: row.id,
        paymentId: p.paymentId,
      },
    });
  }

  // ───────────── Génération : réserver, capturer, libérer ─────────────

  /**
   * Réserve les crédits d'une génération (RG-06, RG-07) en les prélevant sur les lots qui expirent le plus tôt.
   * À appeler DANS la transaction qui crée la génération : le verrou garantit que deux réservations concurrentes
   * ne dépensent jamais deux fois le même solde. Idempotent : une seconde réservation pour la même génération
   * ne débite pas une seconde fois.
   */
  async reserve(
    tx: Prisma.TransactionClient,
    p: { userId: string; generationId: string; amount: number },
  ): Promise<{ created: boolean }> {
    if (!Number.isInteger(p.amount) || p.amount <= 0) {
      throw new BadRequestException({
        code: 'INVALID_AMOUNT',
        message: 'Montant de réservation invalide.',
      });
    }
    await lockUserRow(tx, p.userId);

    const reference = `reserve:${p.generationId}`;
    const existing = await tx.creditLedger.findUnique({ where: { reference } });
    if (existing) return { created: false };

    const now = new Date();
    await this.expireDueLots(tx, p.userId, now);
    const lots = await tx.creditLot.findMany({
      where: { userId: p.userId, remaining: { gt: 0 } },
    });
    const available = spendableTotal(lots, now);
    if (available < p.amount)
      throw new InsufficientCreditsException(p.amount, available);

    const { takes } = allocateFifo(lots, p.amount, now);
    await tx.creditLedger.create({
      data: {
        userId: p.userId,
        amount: -p.amount,
        type: 'RESERVE',
        reference,
        generationId: p.generationId,
        note: 'Réservation pour une création',
      },
    });
    for (const take of takes) {
      await tx.creditLot.update({
        where: { id: take.lotId },
        data: { remaining: { decrement: take.amount } },
      });
      await tx.lotAllocation.create({
        data: {
          lotId: take.lotId,
          generationId: p.generationId,
          amount: take.amount,
        },
      });
    }
    return { created: true };
  }

  /** Succès de la génération : la réservation devient une consommation définitive (CAPTURE de montant 0). */
  async capture(generationId: string): Promise<{ created: boolean }> {
    return this.settle(generationId, 'capture');
  }

  /** Échec technique, annulation ou délai dépassé : les crédits réservés sont restitués (RELEASE). */
  async release(generationId: string): Promise<{ created: boolean }> {
    return this.settle(generationId, 'release');
  }

  /** Clôt une réservation une seule fois : soit capturée, soit libérée, jamais les deux. */
  private async settle(
    generationId: string,
    kind: 'capture' | 'release',
  ): Promise<{ created: boolean }> {
    const reservation = await this.prisma.creditLedger.findUnique({
      where: { reference: `reserve:${generationId}` },
    });
    if (!reservation) {
      throw new ConflictException({
        code: 'NO_RESERVATION',
        message: 'Aucune réservation de crédits pour cette création.',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await lockUserRow(tx, reservation.userId);

      // « refund: » est l'ancien préfixe des libérations : il compte toujours comme une libération.
      const releaseRefs = [`release:${generationId}`, `refund:${generationId}`];
      const captureRef = `capture:${generationId}`;
      const done = await tx.creditLedger.findFirst({
        where: {
          reference: {
            in: kind === 'capture' ? [captureRef] : releaseRefs,
          },
        },
      });
      if (done) return { created: false };

      const opposite = await tx.creditLedger.findFirst({
        where: {
          reference: { in: kind === 'capture' ? releaseRefs : [captureRef] },
        },
      });
      if (opposite) {
        throw new ConflictException({
          code: kind === 'capture' ? 'ALREADY_REFUNDED' : 'ALREADY_CAPTURED',
          message:
            kind === 'capture'
              ? 'Les crédits de cette création ont déjà été restitués.'
              : 'Les crédits de cette création ont déjà été débités définitivement.',
        });
      }

      if (kind === 'capture') {
        await tx.creditLedger.create({
          data: {
            userId: reservation.userId,
            amount: 0,
            type: 'CAPTURE',
            reference: captureRef,
            generationId,
            note: 'Débit définitif',
          },
        });
        return { created: true };
      }

      const reserved = -reservation.amount;
      const restored = await this.restoreToLots(tx, generationId);
      // Réservation sans détail par lot (antérieure aux lots) : le reste revient dans un lot neuf.
      const shortfall = reserved - restored;
      if (shortfall > 0) {
        const expiresAt = new Date();
        expiresAt.setUTCMonth(
          expiresAt.getUTCMonth() + DEFAULT_ADJUST_LOT_MONTHS,
        );
        await tx.creditLot.create({
          data: {
            userId: reservation.userId,
            kind: 'ADMIN_ADJUST',
            initialAmount: shortfall,
            remaining: shortfall,
            expiresAt,
          },
        });
      }
      await tx.creditLedger.create({
        data: {
          userId: reservation.userId,
          amount: reserved,
          type: 'RELEASE',
          reference: releaseRefs[0],
          generationId,
          note: 'Crédits restitués',
        },
      });
      // Si un lot a expiré entre-temps, les crédits qui y reviennent expirent aussitôt.
      await this.expireDueLots(tx, reservation.userId, new Date());
      return { created: true };
    });
  }

  /** Rend à chaque lot ce que la réservation lui avait pris ; retourne le total restitué. */
  private async restoreToLots(
    tx: Prisma.TransactionClient,
    generationId: string,
  ): Promise<number> {
    const allocations = await tx.lotAllocation.findMany({
      where: { generationId },
    });
    let restored = 0;
    for (const a of allocations) {
      const back = a.amount - a.returned;
      if (back <= 0) continue;
      await tx.creditLot.update({
        where: { id: a.lotId },
        data: { remaining: { increment: back } },
      });
      await tx.lotAllocation.update({
        where: { id: a.id },
        data: { returned: a.amount },
      });
      restored += back;
    }
    return restored;
  }

  // ───────────── Ajustement administratif ─────────────

  /** Geste commercial ou correction (AD-23) : motif obligatoire, jamais de solde négatif. */
  async adjust(p: {
    userId: string;
    amount: number;
    reason: string;
    adminId: string;
    expiresAt?: Date;
    /** Exécuté dans la même transaction (ex. écriture du journal d'audit) : tout réussit ou rien. */
    onCommit?: (
      tx: Prisma.TransactionClient,
      reference: string,
    ) => Promise<void>;
  }): Promise<{ reference: string; balance: number }> {
    const reason = p.reason?.trim();
    if (!reason || reason.length < 3) {
      throw new BadRequestException({
        code: 'REASON_REQUIRED',
        message: 'Un motif est obligatoire.',
      });
    }
    if (!Number.isInteger(p.amount) || p.amount === 0) {
      throw new BadRequestException({
        code: 'INVALID_AMOUNT',
        message: 'Montant d’ajustement invalide.',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await lockUserRow(tx, p.userId);
      const now = new Date();
      await this.expireDueLots(tx, p.userId, now);
      const reference = `adjust:${randomUUID()}`;

      if (p.amount > 0) {
        const expiresAt = p.expiresAt ?? new Date(now);
        if (!p.expiresAt)
          expiresAt.setUTCMonth(
            expiresAt.getUTCMonth() + DEFAULT_ADJUST_LOT_MONTHS,
          );
        await this.addLot(tx, {
          userId: p.userId,
          amount: p.amount,
          type: 'ADMIN_ADJUST',
          reference,
          expiresAt,
          note: reason,
          createdById: p.adminId,
        });
      } else {
        // Retrait : pris sur les lots qui expirent le plus tôt, comme une consommation.
        const lots = await tx.creditLot.findMany({
          where: { userId: p.userId, remaining: { gt: 0 } },
        });
        const available = spendableTotal(lots, now);
        if (available + p.amount < 0)
          throw new InsufficientCreditsException(-p.amount, available);
        const { takes } = allocateFifo(lots, -p.amount, now);
        await tx.creditLedger.create({
          data: {
            userId: p.userId,
            amount: p.amount,
            type: 'ADMIN_ADJUST',
            reference,
            note: reason,
            createdById: p.adminId,
          },
        });
        for (const take of takes) {
          await tx.creditLot.update({
            where: { id: take.lotId },
            data: { remaining: { decrement: take.amount } },
          });
        }
      }
      await p.onCommit?.(tx, reference);
      return { reference, balance: await this.getBalance(p.userId, tx) };
    });
  }

  // ───────────── Expiration ─────────────

  /**
   * Expire les lots échus d'un utilisateur (EXPIRE, montant = ce qui reste). Appelée sous le verrou utilisateur.
   * Un lot qui reçoit à nouveau des crédits après son expiration (libération tardive) expire de nouveau : la
   * référence porte donc un numéro d'ordre. Retourne le nombre de mouvements écrits.
   */
  private async expireDueLots(
    tx: Prisma.TransactionClient,
    userId: string,
    now: Date,
  ): Promise<number> {
    const due = await tx.creditLot.findMany({
      where: { userId, remaining: { gt: 0 }, expiresAt: { lte: now } },
    });
    for (const lot of due) {
      const previous = await tx.creditLedger.count({
        where: { userId, reference: { startsWith: `expire:${lot.id}` } },
      });
      await tx.creditLedger.create({
        data: {
          userId,
          amount: -lot.remaining,
          type: 'EXPIRE',
          reference:
            previous === 0
              ? `expire:${lot.id}`
              : `expire:${lot.id}:${previous}`,
          note: 'Crédits expirés',
        },
      });
      await tx.creditLot.update({
        where: { id: lot.id },
        data: { remaining: 0 },
      });
    }
    return due.length;
  }

  /**
   * Job d'expiration (RG-08) : écrit les mouvements EXPIRE des lots échus. Idempotent (un lot vidé n'est plus
   * candidat) et sûr en concurrence (verrou utilisateur). Retourne le nombre de mouvements écrits.
   */
  async runExpiry(now = new Date()): Promise<number> {
    const candidates = await this.prisma.creditLot.findMany({
      where: { remaining: { gt: 0 }, expiresAt: { lte: now } },
      select: { userId: true },
      distinct: ['userId'],
    });
    let written = 0;
    for (const { userId } of candidates) {
      written += await this.prisma.$transaction(async (tx) => {
        await lockUserRow(tx, userId);
        return this.expireDueLots(tx, userId, now);
      });
    }
    return written;
  }

  // ───────────── Historique ─────────────

  /** Historique des mouvements d'un utilisateur, du plus récent au plus ancien (UF-61), paginé par curseur. */
  async listLedger(
    userId: string,
    opts: { cursor?: string; limit?: number },
  ): Promise<{ items: LedgerEntryView[]; nextCursor: string | null }> {
    const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
    const rows = await this.prisma.creditLedger.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        type: true,
        amount: true,
        note: true,
        expiresAt: true,
        createdAt: true,
      },
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
  }
}
