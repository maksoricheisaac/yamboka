import {
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  PricingConfigRow,
  PricingDraftInput,
  PricingPreview,
  PricingPreviewRow,
  PricingSections,
} from '@yamboka/shared';
import { AuditService } from '../audit/audit.service';
import { FLOOR_DECIMALS, formatFloor } from '../billing/floor';
import { formatMicroUsd, formatRate } from '../billing/usd';
import { ModelCalibrationService } from '../generation/model-calibration.service';
import { ModelCatalogService } from '../generation/model-catalog.service';
import { pricedCombinations } from '../generation/model-input';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreditPricingService,
  type PricingContext,
} from '../pricing/credit-pricing.service';
import {
  PricingService,
  type PricingConfigView,
} from '../pricing/pricing.service';

const FLOOR_SCALE = 10n ** BigInt(FLOOR_DECIMALS);

/** Au-delà de cette variation du prix d'une vidéo, l'application exige une confirmation explicite. */
export const BIG_PRICE_CHANGE_PERCENT = 20;

/** Durées montrées dans l'aperçu : la plus courte usuelle, l'usuelle, une longue. */
const PREVIEW_DURATIONS = [5, 10, 30];

/**
 * Page « Configuration des calculs » : brouillon → aperçu → application.
 *
 * Aucun paramètre de calcul ne passe plus par le code. Appliquer une version prend effet IMMÉDIATEMENT,
 * sans redéploiement : la nouvelle ligne de PricingConfig entre en vigueur et les caches de catalogue sont
 * invalidés. Rien ne s'écrase : un retour en arrière crée une nouvelle version qui recopie l'ancienne.
 *
 * Trois garde-fous, dans cet ordre :
 *   1. une configuration qui vend sous le coût est refusée, sauf confirmation renforcée ;
 *   2. une variation de prix de plus de 20 %, ou une marge qui passe sous le minimum, exige une
 *      confirmation explicite ;
 *   3. chaque version garde son auteur, sa date et sa note de motif, et passe dans AuditLog.
 */
@Injectable()
export class AdminPricingService {
  private readonly logger = new Logger(AdminPricingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly creditPricing: CreditPricingService,
    private readonly catalog: ModelCatalogService,
    private readonly calibration: ModelCalibrationService,
    private readonly audit: AuditService,
  ) {}

  // ───────────── Lecture ─────────────

  /** Tout ce que la page affiche : version en vigueur, historique, modèles, packs, moyens de paiement. */
  async sections(): Promise<PricingSections> {
    const [config, history, models, packs, methods, alerts] = await Promise.all(
      [
        this.pricing.config(),
        this.pricing.configHistory(30),
        this.catalog.all(),
        this.creditPricing.publicPacks(),
        this.creditPricing.openPaymentMethods(),
        this.calibration.pendingAlerts(),
      ],
    );
    const ctx = await this.creditPricing.context();
    return {
      current: toRow(config),
      history: history.map(toRow),
      models: await Promise.all(
        models.map(async (m) => ({
          slug: m.slug,
          name: m.name,
          mode: m.mode,
          active: m.active,
          isDefault: m.isDefault,
          sortOrder: m.sortOrder,
          paramCount: m.params.length,
          resolutions: this.catalog.resolutionsOf(m),
          pricedCombinations: pricedCombinations(m).length,
          missingPrices: (await this.catalog.missingPrices(m)).length,
        })),
      ),
      packs: packs.map((p) => ({
        name: p.name,
        priceFcfa: p.price,
        credits: p.credits,
        bonusCredits: p.bonusCredits,
      })),
      paymentMethods: methods.map((m) => ({
        label: m.label,
        tierCount: m.tiers.length,
        /** Pourcentage du premier palier : le « dès X % » de la grille publique. */
        firstTierPercent:
          m.tiers[0] === undefined ? null : String(m.tiers[0].percent),
      })),
      creditFloorFcfa: formatFloor(ctx.floor.floorScaled),
      floorFromPack: ctx.floor.worst.packName,
      floorFromMethod: ctx.floor.worst.methodLabel,
      pricingRate: formatRate(ctx.rate.rate),
      rateMeasured: ctx.rate.measured,
      pessimisticApplied: ctx.pessimistic,
      estimateAlerts: alerts,
      estimateAvailable: this.calibration.available,
    };
  }

  // ───────────── Aperçu ─────────────

  /**
   * Avant / après pour chaque (modèle, qualité, durée) : coût en dollars, coût en FCFA, crédits, prix
   * équivalent et marge nette. Rien n'est enregistré. C'est cet aperçu qui dit si la version est applicable.
   */
  async preview(draft: PricingDraftInput): Promise<PricingPreview> {
    const current = await this.pricing.config();
    const next = this.merge(current, draft);
    const [beforeCtx, afterCtx, worstCtx] = await Promise.all([
      this.creditPricing.context(),
      this.creditPricing.context({
        marginPercent: next.marginPercent,
        circuitLossPercent: next.circuitLossPercent,
        bonusValuationPercent: next.bonusValuationPercent,
        fxBufferPercent: next.fxBufferPercent,
        // L'aperçu applique le même scénario que celui qui s'appliquera réellement après l'application.
        pessimistic: next.provisional,
      }),
      // Référence de sûreté : le scénario le plus défavorable, quelles que soient les valeurs du brouillon.
      // C'est contre LUI qu'on vérifie qu'on ne vend pas sous le coût, sinon le garde-fou ne sert à rien :
      // une configuration trop optimiste produit toujours une marge positive… dans ses propres hypothèses.
      this.creditPricing.context({ pessimistic: true }),
    ]);

    const rows: PricingPreviewRow[] = [];
    const models = await this.catalog.active();
    for (const model of models) {
      const resolutionKey = this.catalog.keyOfRole(model, 'RESOLUTION');
      for (const combo of pricedCombinations(model)) {
        const resolution = resolutionKey
          ? ((combo[resolutionKey] as string | undefined) ?? null)
          : null;
        let unit;
        try {
          unit = await this.catalog.costPerUnit(model, {
            priced: combo,
            resolution,
          });
        } catch {
          continue;
        }
        const perUnit =
          unit.microUsdPerUnit * BigInt(unit.price.billableMultiplier);
        for (const seconds of PREVIEW_DURATIONS) {
          const inRange =
            (unit.price.minSeconds === null ||
              seconds >= unit.price.minSeconds) &&
            (unit.price.maxSeconds === null ||
              seconds <= unit.price.maxSeconds);
          if (!inRange) continue;
          const cost = perUnit * BigInt(seconds);
          const before = this.line(beforeCtx, perUnit, seconds, cost);
          const after = this.line(afterCtx, perUnit, seconds, cost);
          // Ce que les crédits de la NOUVELLE grille rapportent, et coûtent, dans le pire des cas.
          const worstQuote = this.creditPricing.quote(worstCtx, cost);
          const worstBrought = Number(
            (BigInt(after.credits) * worstCtx.floor.floorScaled) / FLOOR_SCALE,
          );
          rows.push({
            modelSlug: model.slug,
            modelName: model.name,
            resolution: resolution ?? '—',
            durationSeconds: seconds,
            costUsd: formatMicroUsd(cost, 4),
            before,
            after,
            afterWorstMarginFcfa: worstBrought - worstQuote.costFcfa,
            changePercent: percentChange(
              before.priceEquivalentFcfa,
              after.priceEquivalentFcfa,
            ),
          });
        }
      }
    }

    // « Sous le coût » se juge dans le scénario pessimiste : c'est la seule lecture qui protège vraiment.
    const belowCost = rows.filter(
      (r) => r.after.marginFcfa < 0 || r.afterWorstMarginFcfa < 0,
    );
    const bigChanges = rows.filter(
      (r) => Math.abs(r.changePercent) > BIG_PRICE_CHANGE_PERCENT,
    );
    const minMargin = Number(next.minMarginPercent);
    const underMinMargin = rows.filter(
      (r) =>
        r.after.priceEquivalentFcfa > 0 &&
        (r.after.marginFcfa / r.after.priceEquivalentFcfa) * 100 < minMargin,
    );

    return {
      rows,
      before: toRow(current),
      after: toRow({ ...current, ...next, id: current.id }),
      creditFloorBeforeFcfa: formatFloor(beforeCtx.floor.floorScaled),
      creditFloorAfterFcfa: formatFloor(afterCtx.floor.floorScaled),
      pricingRateBefore: formatRate(beforeCtx.rate.rate),
      pricingRateAfter: formatRate(afterCtx.rate.rate),
      sellsBelowCost: belowCost.length > 0,
      belowCostLabels: belowCost.map(label),
      bigPriceChange: bigChanges.length > 0,
      bigPriceChangeLabels: bigChanges.map(label),
      underMinMargin: underMinMargin.length > 0,
      underMinMarginLabels: underMinMargin.map(label),
    };
  }

  // ───────────── Application ─────────────

  /**
   * Applique le brouillon : une NOUVELLE version, prise en compte immédiatement. Refuse si l'aperçu
   * annonce une vente sous le coût (sauf confirmation renforcée), ou si une confirmation attendue manque.
   */
  async apply(
    adminId: string,
    draft: PricingDraftInput,
    ip?: string,
  ): Promise<{ versionId: string; appliedAt: string }> {
    const preview = await this.preview(draft);
    if (preview.sellsBelowCost && !draft.confirmBelowCost) {
      throw new UnprocessableEntityException({
        code: 'SELLS_BELOW_COST',
        message: `Cette configuration vend sous le coût sur ${preview.belowCostLabels.length} ligne(s) : ${preview.belowCostLabels.slice(0, 5).join(' ; ')}. Confirmez explicitement pour l’appliquer quand même.`,
      });
    }
    if (preview.bigPriceChange && !draft.confirmBigChange) {
      throw new UnprocessableEntityException({
        code: 'BIG_PRICE_CHANGE',
        message: `Le prix d’au moins une vidéo change de plus de ${BIG_PRICE_CHANGE_PERCENT} % : ${preview.bigPriceChangeLabels.slice(0, 5).join(' ; ')}. Confirmez pour l’appliquer.`,
      });
    }
    if (preview.underMinMargin && !draft.confirmBigChange) {
      throw new UnprocessableEntityException({
        code: 'UNDER_MIN_MARGIN',
        message: `La marge passe sous le minimum (${preview.after.minMarginPercent} %) sur ${preview.underMinMarginLabels.length} ligne(s). Confirmez pour l’appliquer.`,
      });
    }

    const current = await this.pricing.config();
    const version = await this.pricing.updateConfig(
      this.merge(current, draft),
      { adminId, note: draft.note },
    );
    // Prise d'effet immédiate, sans redéploiement : les caches de lecture sont vidés ici.
    this.catalog.invalidate();
    await this.audit.log({
      actorId: adminId,
      action: 'pricing.apply',
      entityType: 'PricingConfig',
      entityId: version.id,
      before: { versionId: current.id },
      after: {
        versionId: version.id,
        confirmedBelowCost: draft.confirmBelowCost ?? false,
        confirmedBigChange: draft.confirmBigChange ?? false,
      },
      reason: draft.note,
      ip,
    });
    this.logger.log(
      `Configuration des calculs appliquée par ${adminId} (version ${version.id}).`,
    );
    return {
      versionId: version.id,
      appliedAt: version.effectiveFrom.toISOString(),
    };
  }

  /**
   * Retour à une version précédente : crée une NOUVELLE version qui en recopie les valeurs. Aucune
   * suppression, aucune réécriture — l'historique reste lisible de bout en bout.
   */
  async rollback(
    adminId: string,
    versionId: string,
    note: string,
    ip?: string,
  ): Promise<{ versionId: string }> {
    const target = await this.prisma.pricingConfig.findUnique({
      where: { id: versionId },
    });
    if (!target) {
      throw new NotFoundException({
        code: 'VERSION_NOT_FOUND',
        message: 'Cette version de configuration n’existe pas.',
      });
    }
    const version = await this.pricing.updateConfig(
      {
        marginPercent: target.marginPercent.toFixed(4),
        fxBufferPercent: target.fxBufferPercent.toFixed(4),
        cardFcfaPerUsd: target.cardFcfaPerUsd.toFixed(4),
        circuitLossPercent: target.circuitLossPercent.toFixed(4),
        bonusValuationPercent: target.bonusValuationPercent.toFixed(4),
        withdrawalFeePercent: target.withdrawalFeePercent.toFixed(4),
        momoToCardFeePercent: target.momoToCardFeePercent.toFixed(4),
        topUpFeePercent: target.topUpFeePercent.toFixed(4),
        minMarginPercent: target.minMarginPercent.toFixed(4),
        safetyMarginUsd: formatMicroUsd(target.safetyMarginMicroUsd, 6),
        dailyCapUsd: formatMicroUsd(target.dailyCapMicroUsd, 6),
        dailyUserCapUsd: formatMicroUsd(target.dailyUserCapMicroUsd, 6),
        minWithdrawalXaf: target.minWithdrawalXaf,
        minPurchaseXaf: target.minPurchaseXaf,
        quoteValiditySeconds: target.quoteValiditySeconds,
        provisional: target.provisional,
        revertedFromId: target.id,
      },
      { adminId, note },
    );
    this.catalog.invalidate();
    await this.audit.log({
      actorId: adminId,
      action: 'pricing.rollback',
      entityType: 'PricingConfig',
      entityId: version.id,
      after: { revertedFromId: target.id },
      reason: note,
      ip,
    });
    return { versionId: version.id };
  }

  // ───────────── Interne ─────────────

  /** Une ligne de l'aperçu pour un contexte donné. */
  private line(
    ctx: PricingContext,
    perUnitMicroUsd: bigint,
    seconds: number,
    costMicroUsd: bigint,
  ) {
    const quote = this.creditPricing.quote(ctx, costMicroUsd);
    const perSecond = this.creditPricing.creditsPerUnit(ctx, perUnitMicroUsd);
    const credits = perSecond * seconds;
    const priceEquivalentFcfa = Number(
      (BigInt(credits) * ctx.floor.floorScaled) / FLOOR_SCALE,
    );
    return {
      costFcfa: quote.costFcfa,
      credits,
      priceEquivalentFcfa,
      marginFcfa: priceEquivalentFcfa - quote.costFcfa,
    };
  }

  /** Valeurs de la version à venir : celles du brouillon là où il en fournit, sinon celles en vigueur. */
  private merge(
    current: PricingConfigView,
    draft: PricingDraftInput,
  ): Required<
    Pick<
      PricingConfigView,
      | 'marginPercent'
      | 'fxBufferPercent'
      | 'cardFcfaPerUsd'
      | 'circuitLossPercent'
      | 'bonusValuationPercent'
      | 'withdrawalFeePercent'
      | 'momoToCardFeePercent'
      | 'topUpFeePercent'
      | 'minMarginPercent'
      | 'minWithdrawalXaf'
      | 'minPurchaseXaf'
      | 'quoteValiditySeconds'
      | 'provisional'
    >
  > & {
    safetyMarginUsd: string;
    dailyCapUsd: string;
    dailyUserCapUsd: string;
  } {
    return {
      marginPercent: draft.marginPercent ?? current.marginPercent,
      fxBufferPercent: draft.fxBufferPercent ?? current.fxBufferPercent,
      cardFcfaPerUsd: draft.cardFcfaPerUsd ?? current.cardFcfaPerUsd,
      circuitLossPercent:
        draft.circuitLossPercent ?? current.circuitLossPercent,
      bonusValuationPercent:
        draft.bonusValuationPercent ?? current.bonusValuationPercent,
      withdrawalFeePercent:
        draft.withdrawalFeePercent ?? current.withdrawalFeePercent,
      momoToCardFeePercent:
        draft.momoToCardFeePercent ?? current.momoToCardFeePercent,
      topUpFeePercent: draft.topUpFeePercent ?? current.topUpFeePercent,
      minMarginPercent: draft.minMarginPercent ?? current.minMarginPercent,
      minWithdrawalXaf: draft.minWithdrawalXaf ?? current.minWithdrawalXaf,
      minPurchaseXaf: draft.minPurchaseXaf ?? current.minPurchaseXaf,
      quoteValiditySeconds:
        draft.quoteValiditySeconds ?? current.quoteValiditySeconds,
      provisional: draft.provisional ?? current.provisional,
      safetyMarginUsd:
        draft.safetyMarginUsd ??
        formatMicroUsd(current.safetyMarginMicroUsd, 6),
      dailyCapUsd:
        draft.dailyCapUsd ?? formatMicroUsd(current.dailyCapMicroUsd, 6),
      dailyUserCapUsd:
        draft.dailyUserCapUsd ??
        formatMicroUsd(current.dailyUserCapMicroUsd, 6),
    };
  }
}

/** Libellé court d'une ligne d'aperçu, pour les messages de refus. */
function label(r: PricingPreviewRow): string {
  return `${r.modelName} ${r.resolution} ${r.durationSeconds} s`;
}

/** Variation en % entre deux prix, arrondie à l'entier. 0 si le point de départ est nul. */
function percentChange(before: number, after: number): number {
  if (before <= 0) return after > 0 ? 100 : 0;
  return Math.round(((after - before) / before) * 100);
}

function toRow(
  c: PricingConfigView & {
    safetyMarginUsd?: string;
    dailyCapUsd?: string;
    dailyUserCapUsd?: string;
  },
): PricingConfigRow {
  return {
    id: c.id,
    marginPercent: c.marginPercent,
    fxBufferPercent: c.fxBufferPercent,
    cardFcfaPerUsd: c.cardFcfaPerUsd,
    circuitLossPercent: c.circuitLossPercent,
    bonusValuationPercent: c.bonusValuationPercent,
    withdrawalFeePercent: c.withdrawalFeePercent,
    momoToCardFeePercent: c.momoToCardFeePercent,
    topUpFeePercent: c.topUpFeePercent,
    minMarginPercent: c.minMarginPercent,
    safetyMarginUsd:
      c.safetyMarginUsd ?? formatMicroUsd(c.safetyMarginMicroUsd, 2),
    dailyCapUsd: c.dailyCapUsd ?? formatMicroUsd(c.dailyCapMicroUsd, 2),
    dailyUserCapUsd:
      c.dailyUserCapUsd ?? formatMicroUsd(c.dailyUserCapMicroUsd, 2),
    minWithdrawalXaf: c.minWithdrawalXaf,
    minPurchaseXaf: c.minPurchaseXaf,
    quoteValiditySeconds: c.quoteValiditySeconds,
    provisional: c.provisional,
    effectiveFrom: c.effectiveFrom.toISOString(),
    note: c.note,
    revertedFromId: c.revertedFromId,
  };
}
