import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  formatMicroUsd,
  formatRate,
  measureROut,
  provisionalROut,
  rPricing,
  toMicroUsd,
  toRate,
  weightedROutOfBalance,
  type PricingRate,
  type TopUpLot,
} from '../billing/usd';
import { lockProviderBalance } from '../common/locks';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

type Db = PrismaService | Prisma.TransactionClient;

export const DEFAULT_PROVIDER = 'higgsfield';

/** Le solde prépayé du fournisseur ne couvre pas la génération demandée. */
export class ProviderBalanceExhaustedException extends ConflictException {
  constructor() {
    super({
      code: 'GENERATION_UNAVAILABLE',
      message:
        'La création est momentanément indisponible. Réessaie un peu plus tard.',
    });
  }
}

export interface TopUpStep {
  /** Étape du circuit : « saspay_withdrawal », « momo_to_card », « card_payment », « fx »… */
  step: string;
  amountXaf?: number;
  feeXaf?: number;
  note?: string;
}

export interface RecordTopUpInput {
  /** FCFA NETS sortis du portefeuille SasPay pour cette recharge (numérateur de r_out). */
  netWithdrawnXaf: number;
  /** Dollars réellement arrivés chez le fournisseur, en texte décimal (« 20.00 »). */
  receivedUsd: string | number;
  /** FCFA débités de la carte (information : le détail des frais est dans `steps`). */
  cardAmountXaf: number;
  steps?: TopUpStep[];
  occurredAt?: Date;
  note?: string;
  adminId: string;
}

export interface ProviderBalanceView {
  provider: string;
  /** Solde estimé, somme du journal, en micro-dollars. */
  balanceMicroUsd: bigint;
  balanceUsd: string;
  /** Part du solde déjà engagée par des générations en cours. */
  reservedMicroUsd: bigint;
  /** Dernier calibrage : ce qui a été lu en console et l'écart constaté. */
  lastCalibration: { readAt: Date; readUsd: string; deltaUsd: string } | null;
  /** false = aucune recharge mesurée : tout ce qui en découle est provisoire. */
  measured: boolean;
}

/**
 * Solde prépayé du fournisseur de génération, tenu en ajout seul et en micro-dollars entiers.
 *
 * - `ProviderLedger` est la source de vérité : le solde est TOUJOURS la somme des mouvements, jamais une
 *   colonne que l'on écrase. Un trigger en base refuse toute modification ou suppression.
 * - Chaque mouvement porte une référence déterministe unique, donc un événement rejoué n'écrit qu'une fois.
 * - Toute opération qui lit puis écrit prend le verrou GLOBAL du solde : ce solde est partagé par tous les
 *   utilisateurs, le verrou par utilisateur des crédits ne protège donc pas du double engagement.
 * - L'API du fournisseur n'expose pas le solde : la seule mesure vraie est la lecture manuelle en console
 *   (`calibrate`), dont l'écart avec l'estimation est enregistré.
 */
@Injectable()
export class ProviderLedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  // ───────────── Lecture ─────────────

  /** Solde estimé = somme des mouvements (micro-dollars). */
  async balanceMicroUsd(
    db: Db = this.prisma,
    provider = DEFAULT_PROVIDER,
  ): Promise<bigint> {
    const { _sum } = await db.providerLedger.aggregate({
      where: { provider },
      _sum: { amountMicroUsd: true },
    });
    return _sum.amountMicroUsd ?? 0n;
  }

  /**
   * Dollars engagés par des réservations encore ouvertes (ni capturées, ni libérées). Une capture vaut 0 :
   * la dépense reste faite, elle n'est simplement plus « en attente ».
   */
  async reservedMicroUsd(
    db: Db = this.prisma,
    provider = DEFAULT_PROVIDER,
  ): Promise<bigint> {
    const open = await db.$queryRaw<{ sum: bigint | null }[]>`
      SELECT COALESCE(SUM(-r."amountMicroUsd"), 0)::bigint AS sum
      FROM "ProviderLedger" r
      WHERE r."provider" = ${provider}
        AND r."type" = 'GENERATION_RESERVE'
        AND NOT EXISTS (
          SELECT 1 FROM "ProviderLedger" s
          WHERE s."generationId" = r."generationId"
            AND s."type" IN ('GENERATION_CAPTURE', 'GENERATION_RELEASE')
        )
    `;
    return open[0]?.sum ?? 0n;
  }

  async view(provider = DEFAULT_PROVIDER): Promise<ProviderBalanceView> {
    const [balance, reserved, calibration, measuredTopUps] = await Promise.all([
      this.balanceMicroUsd(this.prisma, provider),
      this.reservedMicroUsd(this.prisma, provider),
      this.prisma.providerBalanceCalibration.findFirst({
        where: { provider },
        orderBy: { readAt: 'desc' },
      }),
      this.prisma.providerTopUp.count({
        where: { provider, measured: true, appliedToPricingAt: { not: null } },
      }),
    ]);
    return {
      provider,
      balanceMicroUsd: balance,
      balanceUsd: formatMicroUsd(balance),
      reservedMicroUsd: reserved,
      lastCalibration: calibration
        ? {
            readAt: calibration.readAt,
            readUsd: formatMicroUsd(calibration.readMicroUsd),
            deltaUsd: formatMicroUsd(calibration.deltaMicroUsd),
          }
        : null,
      measured: measuredTopUps > 0,
    };
  }

  // ───────────── Taux sortant ─────────────

  /**
   * Taux de tarification en vigueur : le plus défavorable entre la dernière recharge mesurée et la moyenne
   * pondérée du solde, majoré de la marge de change. Sans aucune recharge mesurée, se rabat sur un taux
   * provisoire construit depuis le taux carte et la perte de circuit (`measured: false`).
   */
  async pricingRate(provider = DEFAULT_PROVIDER): Promise<PricingRate> {
    const [measured, cardRate, circuitLoss, fxBuffer] = await Promise.all([
      this.measuredROut(provider),
      this.settings.get('usdToXafRate'),
      this.settings.get('circuitLossPercent'),
      this.settings.get('fxBufferPercent'),
    ]);
    return rPricing({
      lastROut: measured.last,
      weightedROut: measured.weighted,
      fallbackROut: provisionalROut(cardRate, circuitLoss),
      fxBufferPercent: fxBuffer,
    });
  }

  /**
   * Taux sortants MESURÉS : celui de la dernière recharge et la moyenne pondérée de ce qui reste du solde.
   * Les deux valent null tant qu'aucune recharge n'est mesurée. Séparé de `pricingRate` pour que le
   * simulateur puisse rejouer d'autres hypothèses de repli sans refaire la lecture.
   */
  async measuredROut(
    provider = DEFAULT_PROVIDER,
  ): Promise<{ last: bigint | null; weighted: bigint | null }> {
    const [topUps, balance] = await Promise.all([
      this.prisma.providerTopUp.findMany({
        // Seules les recharges dont le taux a été APPLIQUÉ comptent : un taux mesuré mais pas encore
        // confirmé ne change aucun prix (voir ProviderTopUp.appliedToPricingAt).
        where: { provider, measured: true, appliedToPricingAt: { not: null } },
        orderBy: { occurredAt: 'asc' },
        select: { amountMicroUsd: true, rOut: true },
      }),
      this.balanceMicroUsd(this.prisma, provider),
    ]);
    const lots: TopUpLot[] = topUps
      .filter((t) => t.amountMicroUsd !== null && t.rOut !== null)
      .map((t) => ({
        microUsd: t.amountMicroUsd as bigint,
        rOut: toRate((t.rOut as Prisma.Decimal).toString()),
      }));
    const toppedUp = lots.reduce((n, l) => n + l.microUsd, 0n);
    // Consommation imputable aux recharges MESURÉES : le solde peut aussi venir de recharges non mesurées ou
    // de calibrages, donc on borne à ce qui a été rechargé plutôt que de déduire un chiffre négatif.
    const consumed = toppedUp > balance ? toppedUp - balance : 0n;
    return {
      last: lots.length > 0 ? lots[lots.length - 1].rOut : null,
      weighted: weightedROutOfBalance(lots, consumed),
    };
  }

  // ───────────── Recharges et calibrage ─────────────

  /**
   * Marque le taux mesuré d'une recharge comme APPLIQUÉ à la grille. Tant que ce n'est pas fait, le taux
   * reste en attente et la tarification garde le taux provisoire : saisir une recharge ne change jamais un
   * prix à l'insu de qui la saisit (T5). Idempotent.
   */
  async applyRateToPricing(
    topUpId: string,
  ): Promise<{ applied: boolean; rOut: string | null }> {
    const row = await this.prisma.providerTopUp.findUnique({
      where: { id: topUpId },
    });
    if (!row || !row.measured || row.rOut === null) {
      return { applied: false, rOut: null };
    }
    if (row.appliedToPricingAt === null) {
      await this.prisma.providerTopUp.update({
        where: { id: row.id },
        data: { appliedToPricingAt: new Date() },
      });
    }
    return { applied: true, rOut: row.rOut.toString() };
  }

  /** Recharges mesurées dont le taux attend encore d'être appliqué à la grille. */
  async topUpsAwaitingRate(
    provider = DEFAULT_PROVIDER,
  ): Promise<{ id: string; rOut: string; occurredAt: Date }[]> {
    const rows = await this.prisma.providerTopUp.findMany({
      where: { provider, measured: true, appliedToPricingAt: null },
      orderBy: { occurredAt: 'desc' },
      take: 20,
    });
    return rows
      .filter((r) => r.rOut !== null)
      .map((r) => ({
        id: r.id,
        rOut: (r.rOut as Prisma.Decimal).toString(),
        occurredAt: r.occurredAt,
      }));
  }

  /**
   * Enregistre une recharge : la ligne de recharge (avec `r_out` figé) et le mouvement TOPUP, dans la même
   * transaction. `r_out` est calculé ici une fois pour toutes et jamais recalculé ensuite.
   */
  async recordTopUp(
    p: RecordTopUpInput,
  ): Promise<{ id: string; rOut: string }> {
    const receivedMicroUsd = toMicroUsd(p.receivedUsd);
    if (receivedMicroUsd <= 0n) {
      throw new BadRequestException({
        code: 'INVALID_AMOUNT',
        message: 'Les dollars reçus doivent être supérieurs à zéro.',
      });
    }
    for (const [value, message] of [
      [
        p.netWithdrawnXaf,
        'Les FCFA nets retirés doivent être un entier positif.',
      ],
      [
        p.cardAmountXaf,
        'Le montant débité de la carte doit être un entier positif.',
      ],
    ] as const) {
      if (!Number.isInteger(value) || value <= 0) {
        throw new BadRequestException({ code: 'INVALID_AMOUNT', message });
      }
    }
    const rOutText = formatRate(
      measureROut(p.netWithdrawnXaf, receivedMicroUsd),
    );
    const occurredAt = p.occurredAt ?? new Date();

    return this.prisma.$transaction(async (tx) => {
      await lockProviderBalance(tx);
      const topUp = await tx.providerTopUp.create({
        data: {
          provider: DEFAULT_PROVIDER,
          amountUsd: formatMicroUsd(receivedMicroUsd),
          amountXaf: p.cardAmountXaf,
          saspayWithdrawnXaf: p.netWithdrawnXaf,
          netWithdrawnXaf: p.netWithdrawnXaf,
          amountMicroUsd: receivedMicroUsd,
          fxRate: rOutText,
          rOut: rOutText,
          feeSteps: (p.steps ?? []) as unknown as Prisma.InputJsonValue,
          measured: true,
          occurredAt,
          note: p.note,
          createdById: p.adminId,
        },
      });
      await tx.providerLedger.create({
        data: {
          provider: DEFAULT_PROVIDER,
          type: 'TOPUP',
          amountMicroUsd: receivedMicroUsd,
          reference: `topup:${topUp.id}`,
          topUpId: topUp.id,
          fcfaPerUsd: rOutText,
          note: p.note ?? 'Recharge du compte fournisseur',
          createdById: p.adminId,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: p.adminId,
          action: 'provider.topup',
          entityType: 'ProviderTopUp',
          entityId: topUp.id,
          after: {
            netWithdrawnXaf: p.netWithdrawnXaf,
            receivedUsd: formatMicroUsd(receivedMicroUsd),
            cardAmountXaf: p.cardAmountXaf,
            rOut: rOutText,
          },
          reason: p.note,
        },
      });
      return { id: topUp.id, rOut: rOutText };
    });
  }

  /**
   * Recalage sur le solde lu dans la console du fournisseur : enregistre la lecture, l'estimation du moment et
   * leur écart, puis écrit le mouvement CALIBRATION qui aligne le journal sur la réalité. Un écart nul n'écrit
   * aucun mouvement, mais la lecture est tout de même conservée.
   */
  async calibrate(p: {
    readUsd: string | number;
    readAt?: Date;
    note?: string;
    adminId: string;
  }): Promise<{ id: string; deltaUsd: string; estimatedUsd: string }> {
    const readMicroUsd = toMicroUsd(p.readUsd);
    if (readMicroUsd < 0n) {
      throw new BadRequestException({
        code: 'INVALID_AMOUNT',
        message: 'Le solde lu ne peut pas être négatif.',
      });
    }
    return this.prisma.$transaction(async (tx) => {
      await lockProviderBalance(tx);
      const estimated = await this.balanceMicroUsd(tx);
      const delta = readMicroUsd - estimated;
      const row = await tx.providerBalanceCalibration.create({
        data: {
          provider: DEFAULT_PROVIDER,
          readMicroUsd,
          estimatedMicroUsd: estimated,
          deltaMicroUsd: delta,
          readAt: p.readAt ?? new Date(),
          note: p.note,
          createdById: p.adminId,
        },
      });
      if (delta !== 0n) {
        await tx.providerLedger.create({
          data: {
            provider: DEFAULT_PROVIDER,
            type: 'CALIBRATION',
            amountMicroUsd: delta,
            reference: `calib:${row.id}`,
            note:
              p.note ??
              `Recalage sur le solde lu en console (écart ${formatMicroUsd(delta)} $)`,
            createdById: p.adminId,
          },
        });
      }
      await tx.auditLog.create({
        data: {
          actorId: p.adminId,
          action: 'provider.calibrate',
          entityType: 'ProviderBalanceCalibration',
          entityId: row.id,
          after: {
            readUsd: formatMicroUsd(readMicroUsd),
            estimatedUsd: formatMicroUsd(estimated),
            deltaUsd: formatMicroUsd(delta),
          },
          reason: p.note,
        },
      });
      return {
        id: row.id,
        deltaUsd: formatMicroUsd(delta),
        estimatedUsd: formatMicroUsd(estimated),
      };
    });
  }

  /**
   * Filet de secours : le fournisseur a répondu « solde insuffisant ». Notre estimation était donc fausse, et
   * la seule valeur sûre est zéro. Écrit un mouvement de recalage qui ramène le solde à zéro et enregistre la
   * lecture correspondante, pour que l'écart reste visible. Sans effet si le solde est déjà nul ou négatif.
   */
  async markExhausted(reason: string): Promise<{ written: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      await lockProviderBalance(tx);
      const estimated = await this.balanceMicroUsd(tx);
      if (estimated <= 0n) return { written: false };
      const row = await tx.providerBalanceCalibration.create({
        data: {
          provider: DEFAULT_PROVIDER,
          readMicroUsd: 0n,
          estimatedMicroUsd: estimated,
          deltaMicroUsd: -estimated,
          readAt: new Date(),
          note: `Solde épuisé annoncé par le fournisseur : ${reason.slice(0, 200)}`,
          createdById: await this.systemAdminId(tx),
        },
      });
      await tx.providerLedger.create({
        data: {
          provider: DEFAULT_PROVIDER,
          type: 'CALIBRATION',
          amountMicroUsd: -estimated,
          reference: `calib:${row.id}`,
          note: 'Solde ramené à zéro : le fournisseur refuse de produire faute de crédit',
        },
      });
      return { written: true };
    });
  }

  /**
   * Un calibrage exige un auteur. Pour un recalage AUTOMATIQUE, on attribue la trace au premier
   * administrateur : c'est à lui de la traiter, et l'audit reste honnête (la note dit que c'est automatique).
   */
  private async systemAdminId(tx: Prisma.TransactionClient): Promise<string> {
    const admin = await tx.user.findFirst({
      where: { role: 'ADMIN' },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!admin) {
      throw new ConflictException({
        code: 'NO_ADMIN',
        message: 'Aucun administrateur pour porter le recalage automatique.',
      });
    }
    return admin.id;
  }

  /** Correction manuelle motivée, hors recalage (mouvement ADJUSTMENT). */
  async adjust(p: {
    microUsd: bigint;
    reason: string;
    adminId: string;
  }): Promise<{ reference: string }> {
    const reason = p.reason?.trim();
    if (!reason || reason.length < 3) {
      throw new BadRequestException({
        code: 'REASON_REQUIRED',
        message: 'Un motif est obligatoire.',
      });
    }
    if (p.microUsd === 0n) {
      throw new BadRequestException({
        code: 'INVALID_AMOUNT',
        message: 'Montant d’ajustement invalide.',
      });
    }
    const reference = `hfadjust:${randomUUID()}`;
    await this.prisma.$transaction(async (tx) => {
      await lockProviderBalance(tx);
      await tx.providerLedger.create({
        data: {
          provider: DEFAULT_PROVIDER,
          type: 'ADJUSTMENT',
          amountMicroUsd: p.microUsd,
          reference,
          note: reason,
          createdById: p.adminId,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: p.adminId,
          action: 'provider.adjust',
          entityType: 'ProviderLedger',
          entityId: reference,
          after: { usd: formatMicroUsd(p.microUsd) },
          reason,
        },
      });
    });
    return { reference };
  }

  // ───────────── Engagement d'une génération ─────────────

  /**
   * Engage les dollars d'une génération, DANS la transaction qui la crée et réserve ses crédits : les deux
   * réservations réussissent ou échouent ensemble. Refuse si le solde, marge de sécurité déduite, ne couvre
   * pas le coût. Idempotent par génération.
   */
  async reserve(
    tx: Prisma.TransactionClient,
    p: {
      generationId: string;
      costMicroUsd: bigint;
      /** Taux de tarification figé sur la génération (pour la valorisation ultérieure). */
      fcfaPerUsd?: string;
      /** Dollars à garder en réserve en permanence, en micro-dollars. */
      safetyMarginMicroUsd?: bigint;
    },
  ): Promise<{ created: boolean }> {
    if (p.costMicroUsd <= 0n) {
      throw new BadRequestException({
        code: 'INVALID_AMOUNT',
        message: 'Coût fournisseur invalide.',
      });
    }
    await lockProviderBalance(tx);
    const reference = `hfreserve:${p.generationId}`;
    const existing = await tx.providerLedger.findUnique({
      where: { reference },
    });
    if (existing) return { created: false };

    const balance = await this.balanceMicroUsd(tx);
    const safety = p.safetyMarginMicroUsd ?? 0n;
    if (balance - p.costMicroUsd < safety) {
      throw new ProviderBalanceExhaustedException();
    }
    await tx.providerLedger.create({
      data: {
        provider: DEFAULT_PROVIDER,
        type: 'GENERATION_RESERVE',
        amountMicroUsd: -p.costMicroUsd,
        reference,
        generationId: p.generationId,
        fcfaPerUsd: p.fcfaPerUsd,
        note: 'Engagement pour une création',
      },
    });
    return { created: true };
  }

  /** Génération réussie : l'engagement devient définitif (mouvement de montant 0, comme pour les crédits). */
  async capture(generationId: string): Promise<{ created: boolean }> {
    return this.settle(generationId, 'capture');
  }

  /** Génération échouée : les dollars engagés reviennent au solde. */
  async release(generationId: string): Promise<{ created: boolean }> {
    return this.settle(generationId, 'release');
  }

  /** Clôt un engagement une seule fois : soit capturé, soit libéré, jamais les deux. */
  private async settle(
    generationId: string,
    kind: 'capture' | 'release',
  ): Promise<{ created: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      await lockProviderBalance(tx);
      const reservation = await tx.providerLedger.findUnique({
        where: { reference: `hfreserve:${generationId}` },
      });
      // Aucun engagement (création d'avant ce journal, ou refusée avant soumission) : rien à solder.
      if (!reservation) return { created: false };

      const captureRef = `hfcapture:${generationId}`;
      const releaseRef = `hfrelease:${generationId}`;
      const done = await tx.providerLedger.findUnique({
        where: { reference: kind === 'capture' ? captureRef : releaseRef },
      });
      if (done) return { created: false };
      const opposite = await tx.providerLedger.findUnique({
        where: { reference: kind === 'capture' ? releaseRef : captureRef },
      });
      if (opposite) {
        throw new ConflictException({
          code: kind === 'capture' ? 'ALREADY_RELEASED' : 'ALREADY_CAPTURED',
          message:
            kind === 'capture'
              ? 'Les dollars de cette création ont déjà été restitués.'
              : 'Les dollars de cette création ont déjà été dépensés.',
        });
      }
      await tx.providerLedger.create({
        data: {
          provider: DEFAULT_PROVIDER,
          type:
            kind === 'capture' ? 'GENERATION_CAPTURE' : 'GENERATION_RELEASE',
          amountMicroUsd: kind === 'capture' ? 0n : -reservation.amountMicroUsd,
          reference: kind === 'capture' ? captureRef : releaseRef,
          generationId,
          fcfaPerUsd: reservation.fcfaPerUsd,
          note:
            kind === 'capture'
              ? 'Dépense fournisseur confirmée'
              : 'Dollars engagés restitués (création échouée)',
        },
      });
      return { created: true };
    });
  }

  /** Dollars dépensés depuis une date (engagements non libérés) : sert aux plafonds quotidiens. */
  async spentSince(
    since: Date,
    opts: { userId?: string } = {},
  ): Promise<bigint> {
    const where: Prisma.ProviderLedgerWhereInput = {
      provider: DEFAULT_PROVIDER,
      type: { in: ['GENERATION_RESERVE', 'GENERATION_RELEASE'] },
      createdAt: { gte: since },
    };
    if (opts.userId) {
      const ids = await this.prisma.generation.findMany({
        where: { userId: opts.userId, createdAt: { gte: since } },
        select: { id: true },
      });
      where.generationId = { in: ids.map((g) => g.id) };
    }
    const { _sum } = await this.prisma.providerLedger.aggregate({
      where,
      _sum: { amountMicroUsd: true },
    });
    const net = _sum.amountMicroUsd ?? 0n;
    return net < 0n ? -net : 0n;
  }
}
