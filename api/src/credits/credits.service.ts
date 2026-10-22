import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { lockUserRow } from '../common/locks';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreditLot, computeExpirations } from './expiry';

type Db = PrismaService | Prisma.TransactionClient;

/** Types de lignes qui créent des crédits avec une échéance (lots soumis à l'expiration FIFO). */
const LOT_TYPES = ['PURCHASE', 'BONUS', 'WELCOME', 'ADJUSTMENT'] as const;

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
 * Registre de crédits en ajout seul (RG-02) : le solde est TOUJOURS la somme des mouvements.
 * Toute opération qui lit le solde puis écrit (réservation, capture, remboursement, ajustement)
 * verrouille d'abord la ligne de l'utilisateur (SELECT … FOR UPDATE) : deux requêtes concurrentes
 * pour un même utilisateur s'exécutent l'une après l'autre. Les références uniques rendent chaque
 * opération idempotente.
 */
@Injectable()
export class CreditsService {
  constructor(private readonly prisma: PrismaService) {}

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

  // ───────────── Bienvenue et achats ─────────────

  /**
   * Crédits de bienvenue, une seule fois par compte : la référence `welcome:<userId>` est unique,
   * donc un second appel (ou un appel concurrent) n'a aucun effet. Retourne vrai si les crédits ont été ajoutés.
   */
  async grantWelcome(
    db: Db,
    userId: string,
    amount: number,
    expiresAt: Date,
  ): Promise<boolean> {
    if (amount <= 0) return false;
    const result = await db.creditLedger.createMany({
      data: [
        {
          userId,
          amount,
          type: 'WELCOME',
          reference: `welcome:${userId}`,
          expiresAt,
          note: 'Crédits de bienvenue',
        },
      ],
      skipDuplicates: true,
    });
    return result.count === 1;
  }

  /**
   * Crédite un achat confirmé : un mouvement PURCHASE (crédits de base) et, s'il y a un bonus, un mouvement BONUS.
   * Références `pay:<réf>` et `bonus:<réf>` : un même paiement ne peut créditer qu'une seule fois (RG-05).
   * À appeler dans la transaction qui fait passer le paiement à SUCCESS.
   */
  async grantPurchase(
    db: Db,
    p: {
      userId: string;
      paymentId: string;
      reference: string;
      baseCredits: number;
      bonusCredits: number;
      expiresAt: Date;
    },
  ): Promise<void> {
    const rows: Prisma.CreditLedgerCreateManyInput[] = [
      {
        userId: p.userId,
        amount: p.baseCredits,
        type: 'PURCHASE',
        reference: `pay:${p.reference}`,
        paymentId: p.paymentId,
        expiresAt: p.expiresAt,
        note: 'Achat de crédits',
      },
    ];
    if (p.bonusCredits > 0) {
      rows.push({
        userId: p.userId,
        amount: p.bonusCredits,
        type: 'BONUS',
        reference: `bonus:${p.reference}`,
        paymentId: p.paymentId,
        expiresAt: p.expiresAt,
        note: 'Bonus du pack',
      });
    }
    await db.creditLedger.createMany({ data: rows, skipDuplicates: true });
  }

  // ───────────── Génération : réserver, capturer, rembourser ─────────────

  /**
   * Réserve les crédits d'une génération (RG-06, RG-07). À appeler DANS la transaction qui crée la génération :
   * le verrou garantit que deux réservations concurrentes ne dépensent jamais deux fois le même solde.
   * Idempotent : une seconde réservation pour la même génération ne débite pas une seconde fois.
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

    const balance = await this.getBalance(p.userId, tx);
    if (balance < p.amount)
      throw new InsufficientCreditsException(p.amount, balance);

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
    return { created: true };
  }

  /** Succès de la génération : la réservation devient une consommation définitive (CAPTURE de montant 0). */
  async capture(generationId: string): Promise<{ created: boolean }> {
    return this.settle(generationId, 'capture');
  }

  /** Échec, annulation ou délai dépassé : les crédits réservés sont restitués (REFUND). */
  async refund(generationId: string): Promise<{ created: boolean }> {
    return this.settle(generationId, 'refund');
  }

  /** Clôt une réservation une seule fois : soit capturée, soit remboursée, jamais les deux. */
  private async settle(
    generationId: string,
    kind: 'capture' | 'refund',
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
      const other = kind === 'capture' ? 'refund' : 'capture';

      if (
        await tx.creditLedger.findUnique({
          where: { reference: `${other}:${generationId}` },
        })
      ) {
        throw new ConflictException({
          code: kind === 'capture' ? 'ALREADY_REFUNDED' : 'ALREADY_CAPTURED',
          message:
            kind === 'capture'
              ? 'Les crédits de cette création ont déjà été restitués.'
              : 'Les crédits de cette création ont déjà été débités définitivement.',
        });
      }
      if (
        await tx.creditLedger.findUnique({
          where: { reference: `${kind}:${generationId}` },
        })
      ) {
        return { created: false };
      }

      await tx.creditLedger.create({
        data:
          kind === 'capture'
            ? {
                userId: reservation.userId,
                amount: 0,
                type: 'CAPTURE',
                reference: `capture:${generationId}`,
                generationId,
                note: 'Débit définitif',
              }
            : {
                userId: reservation.userId,
                amount: -reservation.amount,
                type: 'REFUND',
                reference: `refund:${generationId}`,
                generationId,
                note: 'Remboursement automatique',
              },
      });
      return { created: true };
    });
  }

  // ───────────── Ajustement administratif ─────────────

  /** Geste commercial ou correction (AD-23) : motif obligatoire, jamais de solde négatif. */
  async adjust(p: {
    userId: string;
    amount: number;
    reason: string;
    adminId: string;
    expiresAt?: Date;
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
      const balance = await this.getBalance(p.userId, tx);
      if (balance + p.amount < 0)
        throw new InsufficientCreditsException(-p.amount, balance);
      const reference = `adjust:${randomUUID()}`;
      await tx.creditLedger.create({
        data: {
          userId: p.userId,
          amount: p.amount,
          type: 'ADJUSTMENT',
          reference,
          note: reason,
          createdById: p.adminId,
          expiresAt: p.amount > 0 ? p.expiresAt : undefined,
        },
      });
      return { reference, balance: balance + p.amount };
    });
  }

  // ───────────── Expiration (job quotidien) ─────────────

  /**
   * Écrit les mouvements EXPIRE des lots échus (RG-08). Idempotent : la référence `expire:<lot>` est unique,
   * donc relancer le job ne fait rien de plus. Retourne le nombre de mouvements écrits.
   */
  async runExpiry(now = new Date()): Promise<number> {
    const candidates = await this.prisma.creditLedger.findMany({
      where: {
        amount: { gt: 0 },
        type: { in: [...LOT_TYPES] },
        expiresAt: { lte: now },
      },
      select: { userId: true },
      distinct: ['userId'],
    });

    let written = 0;
    for (const { userId } of candidates) {
      written += await this.prisma.$transaction(async (tx) => {
        await lockUserRow(tx, userId);
        const rows = await tx.creditLedger.findMany({ where: { userId } });

        const lots: CreditLot[] = rows
          .filter(
            (r) =>
              r.amount > 0 &&
              r.expiresAt &&
              (LOT_TYPES as readonly string[]).includes(r.type),
          )
          .map((r) => ({
            id: r.id,
            amount: r.amount,
            expiresAt: r.expiresAt!,
            createdAt: r.createdAt,
          }));

        const expired = new Map<string, number>();
        for (const r of rows) {
          if (r.type === 'EXPIRE' && r.reference.startsWith('expire:')) {
            expired.set(r.reference.slice('expire:'.length), -r.amount);
          }
        }

        // Consommation nette : réservations et ajustements négatifs, nets des remboursements.
        let consumption = 0;
        for (const r of rows) {
          if (
            r.type === 'RESERVE' ||
            r.type === 'REFUND' ||
            (r.type === 'ADJUSTMENT' && r.amount < 0)
          ) {
            consumption -= r.amount;
          }
        }

        const toExpire = computeExpirations(lots, expired, consumption, now);
        if (toExpire.length === 0) return 0;
        const result = await tx.creditLedger.createMany({
          data: toExpire.map((e) => ({
            userId,
            amount: -e.amount,
            type: 'EXPIRE' as const,
            reference: `expire:${e.lotId}`,
            note: 'Crédits expirés',
          })),
          skipDuplicates: true,
        });
        return result.count;
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
