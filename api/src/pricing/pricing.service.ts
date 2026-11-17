import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ceilDiv } from '../billing/decimal';
import { MICRO_PER_USD, formatMicroUsd, toMicroUsd } from '../billing/usd';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Db = PrismaService | Prisma.TransactionClient;

/** Paramètres de tarification en vigueur à un instant donné. */
export interface PricingConfigView {
  id: string;
  marginPercent: string;
  fxBufferPercent: string;
  cardFcfaPerUsd: string;
  circuitLossPercent: string;
  /** Part du bonus de premier achat comptée dans la valeur d'un crédit, en %. */
  bonusValuationPercent: string;
  /** Frais de chaque étape du circuit de recharge, en % (provisoires tant que r_out n'est pas mesuré). */
  withdrawalFeePercent: string;
  momoToCardFeePercent: string;
  topUpFeePercent: string;
  /** Marge nette minimale acceptée, en %. */
  minMarginPercent: string;
  safetyMarginMicroUsd: bigint;
  dailyCapMicroUsd: bigint;
  dailyUserCapMicroUsd: bigint;
  minWithdrawalXaf: number;
  minPurchaseXaf: number;
  quoteValiditySeconds: number;
  /** true = au moins une valeur n'est pas mesurée : à afficher comme tel, et à ne pas activer en production. */
  provisional: boolean;
  effectiveFrom: Date;
  note: string | null;
  /** Version dont celle-ci est le retour en arrière, ou null. */
  revertedFromId: string | null;
  createdAt: Date;
}

/** Tarif fournisseur retenu pour un modèle et une résolution, à une date donnée. */
export interface ModelPriceView {
  id: string;
  providerModel: string;
  resolution: string | null;
  billingUnit: 'SECOND' | 'IMAGE';
  microUsdPerUnit: bigint;
  billableMultiplier: number;
  minSeconds: number | null;
  maxSeconds: number | null;
  source: 'MANUAL' | 'ESTIMATE';
  effectiveFrom: Date;
}

export interface ConfigPatch {
  marginPercent?: string | number;
  bonusValuationPercent?: string | number;
  fxBufferPercent?: string | number;
  cardFcfaPerUsd?: string | number;
  circuitLossPercent?: string | number;
  withdrawalFeePercent?: string | number;
  momoToCardFeePercent?: string | number;
  topUpFeePercent?: string | number;
  minMarginPercent?: string | number;
  safetyMarginUsd?: string | number;
  dailyCapUsd?: string | number;
  dailyUserCapUsd?: string | number;
  minWithdrawalXaf?: number;
  minPurchaseXaf?: number;
  quoteValiditySeconds?: number;
  provisional?: boolean;
  /** Version dont la nouvelle est le retour en arrière (trace, jamais de suppression). */
  revertedFromId?: string | null;
}

/**
 * Paramètres et tarifs, VERSIONNÉS et en ajout seul.
 *
 * Rien ne se modifie sur place : changer une marge ou un tarif AJOUTE une ligne portant sa date d'entrée en
 * vigueur, et un trigger en base refuse toute mise à jour. Un prix se calcule donc toujours avec la ligne en
 * vigueur à la date de la génération, ce qui rend les anciennes générations définitivement explicables : un
 * changement de tarif ne réécrit jamais ce qui a été facturé.
 */
@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  // ───────────── Lecture ─────────────

  /** Paramètres en vigueur à `at` (par défaut maintenant) : la ligne la plus récente déjà entrée en vigueur. */
  async config(
    at: Date = new Date(),
    db: Db = this.prisma,
  ): Promise<PricingConfigView> {
    const row = await db.pricingConfig.findFirst({
      where: { effectiveFrom: { lte: at } },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    });
    if (!row) {
      throw new NotFoundException({
        code: 'PRICING_CONFIG_MISSING',
        message:
          'Aucun paramètre de tarification en vigueur : renseignez-les avant d’ouvrir la vente.',
      });
    }
    return toConfigView(row);
  }

  /** Historique complet des paramètres, du plus récent au plus ancien. */
  async configHistory(limit = 50): Promise<PricingConfigView[]> {
    const rows = await this.prisma.pricingConfig.findMany({
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });
    return rows.map(toConfigView);
  }

  /**
   * Tarif fournisseur en vigueur à `at` pour un modèle et une résolution. Cherche d'abord la ligne de cette
   * résolution ; à défaut, la ligne sans résolution (tarif unique du modèle).
   */
  async modelPrice(
    p: { providerModel: string; resolution?: string | null; at?: Date },
    db: Db = this.prisma,
  ): Promise<ModelPriceView> {
    const at = p.at ?? new Date();
    const candidates = await db.modelPrice.findMany({
      where: {
        providerModel: p.providerModel,
        effectiveFrom: { lte: at },
        OR: [{ resolution: p.resolution ?? null }, { resolution: null }],
      },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
      take: 10,
    });
    // Une ligne propre à la résolution demandée l'emporte sur le tarif générique du modèle.
    const exact = candidates.find(
      (c) => c.resolution === (p.resolution ?? null),
    );
    const row = exact ?? candidates.find((c) => c.resolution === null);
    if (!row) {
      throw new NotFoundException({
        code: 'MODEL_PRICE_MISSING',
        message: 'Aucun tarif fournisseur enregistré pour ce modèle.',
      });
    }
    return toPriceView(row);
  }

  /** Historique des tarifs d'un modèle (ou de tous), du plus récent au plus ancien. */
  async priceHistory(
    opts: { providerModel?: string; limit?: number } = {},
  ): Promise<ModelPriceView[]> {
    const rows = await this.prisma.modelPrice.findMany({
      where: opts.providerModel
        ? { providerModel: opts.providerModel }
        : undefined,
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
      take: opts.limit ?? 100,
    });
    return rows.map(toPriceView);
  }

  /**
   * Coût fournisseur d'une génération, en micro-dollars : prix unitaire × unités facturées × multiplicateur.
   * Arrondi au-dessus par construction (tout est entier), et borné par les durées du tarif.
   */
  providerCostMicroUsd(
    price: ModelPriceView,
    opts: { durationSeconds?: number } = {},
  ): bigint {
    const units =
      price.billingUnit === 'SECOND' ? Math.ceil(opts.durationSeconds ?? 0) : 1;
    if (!Number.isInteger(units) || units <= 0) {
      throw new BadRequestException({
        code: 'DURATION_REQUIRED',
        message: 'La durée de la vidéo est requise.',
      });
    }
    if (
      price.minSeconds !== null &&
      price.billingUnit === 'SECOND' &&
      units < price.minSeconds
    ) {
      throw new BadRequestException({
        code: 'DURATION_TOO_SHORT',
        message: `La vidéo doit durer au moins ${price.minSeconds} secondes.`,
      });
    }
    if (
      price.maxSeconds !== null &&
      price.billingUnit === 'SECOND' &&
      units > price.maxSeconds
    ) {
      throw new BadRequestException({
        code: 'DURATION_TOO_LONG',
        message: `La vidéo ne doit pas dépasser ${price.maxSeconds} secondes.`,
      });
    }
    return (
      price.microUsdPerUnit * BigInt(units) * BigInt(price.billableMultiplier)
    );
  }

  // ───────────── Écriture (nouvelle version) ─────────────

  /**
   * Nouvelle version des paramètres : copie la version en vigueur, applique les changements demandés, et
   * ajoute une ligne. L'ancienne reste intacte, donc les anciens calculs restent explicables.
   */
  async updateConfig(
    patch: ConfigPatch,
    p: { adminId: string; effectiveFrom?: Date; note?: string },
  ): Promise<PricingConfigView> {
    const current = await this.config();
    const next = {
      marginPercent: decimalOf(patch.marginPercent, current.marginPercent),
      fxBufferPercent: decimalOf(
        patch.fxBufferPercent,
        current.fxBufferPercent,
      ),
      cardFcfaPerUsd: decimalOf(patch.cardFcfaPerUsd, current.cardFcfaPerUsd),
      circuitLossPercent: decimalOf(
        patch.circuitLossPercent,
        current.circuitLossPercent,
      ),
      bonusValuationPercent: decimalOf(
        patch.bonusValuationPercent,
        current.bonusValuationPercent,
      ),
      safetyMarginMicroUsd: microOf(
        patch.safetyMarginUsd,
        current.safetyMarginMicroUsd,
      ),
      dailyCapMicroUsd: microOf(patch.dailyCapUsd, current.dailyCapMicroUsd),
      dailyUserCapMicroUsd: microOf(
        patch.dailyUserCapUsd,
        current.dailyUserCapMicroUsd,
      ),
      withdrawalFeePercent: decimalOf(
        patch.withdrawalFeePercent,
        current.withdrawalFeePercent,
      ),
      momoToCardFeePercent: decimalOf(
        patch.momoToCardFeePercent,
        current.momoToCardFeePercent,
      ),
      topUpFeePercent: decimalOf(
        patch.topUpFeePercent,
        current.topUpFeePercent,
      ),
      minMarginPercent: decimalOf(
        patch.minMarginPercent,
        current.minMarginPercent,
      ),
      minWithdrawalXaf: patch.minWithdrawalXaf ?? current.minWithdrawalXaf,
      minPurchaseXaf: patch.minPurchaseXaf ?? current.minPurchaseXaf,
      quoteValiditySeconds:
        patch.quoteValiditySeconds ?? current.quoteValiditySeconds,
      provisional: patch.provisional ?? current.provisional,
      revertedFromId: patch.revertedFromId ?? null,
    };
    const effectiveFrom = p.effectiveFrom ?? new Date();

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.pricingConfig.create({
        data: { ...next, effectiveFrom, note: p.note, createdById: p.adminId },
      });
      await tx.auditLog.create({
        data: {
          actorId: p.adminId,
          action: 'pricing.config',
          entityType: 'PricingConfig',
          entityId: row.id,
          before: {
            ...current,
            effectiveFrom: current.effectiveFrom.toISOString(),
          } as unknown as Prisma.InputJsonValue,
          after: {
            ...next,
            safetyMarginUsd: formatMicroUsd(next.safetyMarginMicroUsd),
            dailyCapUsd: formatMicroUsd(next.dailyCapMicroUsd),
            dailyUserCapUsd: formatMicroUsd(next.dailyUserCapMicroUsd),
            effectiveFrom: effectiveFrom.toISOString(),
          } as unknown as Prisma.InputJsonValue,
          reason: p.note,
        },
      });
      return toConfigView(row);
    });
  }

  /**
   * Nouveau tarif pour un modèle : ajoute une ligne datée. `source` dit d'où vient le chiffre (saisie ou
   * estimation du fournisseur), ce qui permet de distinguer une mesure d'une hypothèse.
   */
  async addModelPrice(p: {
    providerModel: string;
    resolution?: string | null;
    format?: string | null;
    billingUnit?: 'SECOND' | 'IMAGE';
    usdPerUnit: string | number;
    billableMultiplier?: number;
    minSeconds?: number | null;
    maxSeconds?: number | null;
    source: 'MANUAL' | 'ESTIMATE';
    effectiveFrom?: Date;
    note?: string;
    adminId?: string;
  }): Promise<ModelPriceView> {
    const microUsdPerUnit = toMicroUsd(p.usdPerUnit);
    if (microUsdPerUnit <= 0n) {
      throw new BadRequestException({
        code: 'INVALID_AMOUNT',
        message: 'Le tarif fournisseur doit être supérieur à zéro.',
      });
    }
    const previous = await this.prisma.modelPrice.findFirst({
      where: {
        providerModel: p.providerModel,
        resolution: p.resolution ?? null,
      },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    });
    const effectiveFrom = p.effectiveFrom ?? new Date();

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.modelPrice.create({
        data: {
          providerModel: p.providerModel,
          resolution: p.resolution ?? null,
          format: p.format ?? null,
          billingUnit: p.billingUnit ?? 'SECOND',
          microUsdPerUnit,
          billableMultiplier: p.billableMultiplier ?? 1,
          minSeconds: p.minSeconds ?? null,
          maxSeconds: p.maxSeconds ?? null,
          source: p.source,
          effectiveFrom,
          note: p.note,
          createdById: p.adminId,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: p.adminId,
          action: 'pricing.modelPrice',
          entityType: 'ModelPrice',
          entityId: row.id,
          before: previous
            ? {
                usdPerUnit: formatMicroUsd(previous.microUsdPerUnit, 6),
                source: previous.source,
                effectiveFrom: previous.effectiveFrom.toISOString(),
              }
            : undefined,
          after: {
            providerModel: p.providerModel,
            resolution: p.resolution ?? null,
            usdPerUnit: formatMicroUsd(microUsdPerUnit, 6),
            source: p.source,
            effectiveFrom: effectiveFrom.toISOString(),
          },
          reason: p.note,
        },
      });
      return toPriceView(row);
    });
  }

  /**
   * Écart relatif entre un tarif observé et le tarif en vigueur, en pourcentage arrondi au-dessus : sert à
   * alerter quand l'estimation du fournisseur s'éloigne de la config (seuil de 5 %).
   */
  deviationPercent(currentMicroUsd: bigint, observedMicroUsd: bigint): number {
    if (currentMicroUsd <= 0n) return 100;
    const diff =
      observedMicroUsd > currentMicroUsd
        ? observedMicroUsd - currentMicroUsd
        : currentMicroUsd - observedMicroUsd;
    return Number(ceilDiv(diff * 100n, currentMicroUsd));
  }
}

type ConfigRow = {
  id: string;
  marginPercent: Prisma.Decimal;
  fxBufferPercent: Prisma.Decimal;
  cardFcfaPerUsd: Prisma.Decimal;
  circuitLossPercent: Prisma.Decimal;
  bonusValuationPercent: Prisma.Decimal;
  withdrawalFeePercent: Prisma.Decimal;
  momoToCardFeePercent: Prisma.Decimal;
  topUpFeePercent: Prisma.Decimal;
  minMarginPercent: Prisma.Decimal;
  safetyMarginMicroUsd: bigint;
  dailyCapMicroUsd: bigint;
  dailyUserCapMicroUsd: bigint;
  minWithdrawalXaf: number;
  minPurchaseXaf: number;
  quoteValiditySeconds: number;
  provisional: boolean;
  effectiveFrom: Date;
  note: string | null;
  revertedFromId: string | null;
  createdAt: Date;
};

function toConfigView(row: ConfigRow): PricingConfigView {
  return {
    id: row.id,
    marginPercent: row.marginPercent.toFixed(4),
    fxBufferPercent: row.fxBufferPercent.toFixed(4),
    cardFcfaPerUsd: row.cardFcfaPerUsd.toFixed(4),
    circuitLossPercent: row.circuitLossPercent.toFixed(4),
    bonusValuationPercent: row.bonusValuationPercent.toFixed(4),
    withdrawalFeePercent: row.withdrawalFeePercent.toFixed(4),
    momoToCardFeePercent: row.momoToCardFeePercent.toFixed(4),
    topUpFeePercent: row.topUpFeePercent.toFixed(4),
    minMarginPercent: row.minMarginPercent.toFixed(4),
    safetyMarginMicroUsd: row.safetyMarginMicroUsd,
    dailyCapMicroUsd: row.dailyCapMicroUsd,
    dailyUserCapMicroUsd: row.dailyUserCapMicroUsd,
    minWithdrawalXaf: row.minWithdrawalXaf,
    minPurchaseXaf: row.minPurchaseXaf,
    quoteValiditySeconds: row.quoteValiditySeconds,
    provisional: row.provisional,
    effectiveFrom: row.effectiveFrom,
    note: row.note,
    revertedFromId: row.revertedFromId,
    createdAt: row.createdAt,
  };
}

function toPriceView(row: {
  id: string;
  providerModel: string;
  resolution: string | null;
  billingUnit: 'SECOND' | 'IMAGE';
  microUsdPerUnit: bigint;
  billableMultiplier: number;
  minSeconds: number | null;
  maxSeconds: number | null;
  source: 'MANUAL' | 'ESTIMATE';
  effectiveFrom: Date;
}): ModelPriceView {
  return {
    id: row.id,
    providerModel: row.providerModel,
    resolution: row.resolution,
    billingUnit: row.billingUnit,
    microUsdPerUnit: row.microUsdPerUnit,
    billableMultiplier: row.billableMultiplier,
    minSeconds: row.minSeconds,
    maxSeconds: row.maxSeconds,
    source: row.source,
    effectiveFrom: row.effectiveFrom,
  };
}

/** Valeur décimale en texte : celle fournie, sinon celle en vigueur. */
function decimalOf(
  value: string | number | undefined,
  fallback: string,
): string {
  return value === undefined ? fallback : String(value);
}

/** Dollars en texte → micro-dollars ; à défaut, la valeur en vigueur. */
function microOf(value: string | number | undefined, fallback: bigint): bigint {
  if (value === undefined) return fallback;
  const micro = toMicroUsd(value);
  if (micro < 0n) {
    throw new BadRequestException({
      code: 'INVALID_AMOUNT',
      message: 'Un plafond ou une marge en dollars ne peut pas être négatif.',
    });
  }
  return micro;
}

/** Dollars entiers d'un montant en micro-dollars, arrondis au-dessus (usage interne, lisibilité). */
export function ceilUsd(microUsd: bigint): number {
  return Number(ceilDiv(microUsd, MICRO_PER_USD));
}
