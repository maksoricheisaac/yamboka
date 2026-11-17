import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  PackMarginRow,
  VideoSimulationRow,
  SimulationView,
} from '@yamboka/shared';
import { FLOOR_DECIMALS, formatFloor } from '../billing/floor';
import { formatMicroUsd, formatRate } from '../billing/usd';
import { ModelCatalogService } from '../generation/model-catalog.service';
import {
  pricedCombinations,
  type CatalogModel,
} from '../generation/model-input';
import {
  CreditPricingService,
  type PricingContext,
  type PricingScenario,
} from '../pricing/credit-pricing.service';

/** Durées proposées par défaut dans le simulateur : la plus courte, l'usuelle, la plus longue. */
const DEFAULT_DURATIONS = [5, 10, 30];

const FLOOR_SCALE = 10n ** BigInt(FLOOR_DECIMALS);

/**
 * Simulateur d'administration : pour chaque combinaison vendable du catalogue (modèle × qualité × durée ×
 * options), ce qu'elle coûte, ce qu'elle doit rapporter, combien de crédits elle facture, et sa marge — dans
 * le scénario demandé ET dans le scénario pessimiste.
 *
 * Il ne réimplémente AUCUN calcul : il appelle les mêmes services que le devis affiché et que le débit réel
 * (catalogue pour le coût, CreditPricingService pour les crédits). Un scénario ne change que des paramètres
 * d'entrée, ce qui permet de voir où la grille passerait sous le coût AVANT de la modifier.
 */
@Injectable()
export class AdminSimulatorService {
  constructor(
    private readonly catalog: ModelCatalogService,
    private readonly pricing: CreditPricingService,
  ) {}

  async simulate(scenario: {
    marginPercent?: string;
    circuitLossPercent?: string;
    bonusValuationPercent?: string;
    durations?: number[];
    /** Inclure aussi les modèles inactifs (aperçu avant activation). */
    includeInactive?: boolean;
  }): Promise<SimulationView> {
    const base: PricingScenario = {
      marginPercent: scenario.marginPercent,
      circuitLossPercent: scenario.circuitLossPercent,
      bonusValuationPercent: scenario.bonusValuationPercent,
    };
    const [ctx, worstCtx] = await Promise.all([
      this.pricing.context(base),
      this.pricing.context({ ...base, pessimistic: true }),
    ]);
    const durations =
      scenario.durations && scenario.durations.length > 0
        ? scenario.durations
        : DEFAULT_DURATIONS;

    const models = scenario.includeInactive
      ? await this.catalog.all()
      : await this.catalog.active();
    if (models.length === 0) {
      throw new NotFoundException({
        code: 'NO_ACTIVE_MODEL',
        message: 'Aucun modèle de création actif à simuler.',
      });
    }

    const videos: VideoSimulationRow[] = [];
    for (const model of models) {
      videos.push(...(await this.rowsOf(model, ctx, worstCtx, durations)));
    }

    return {
      pricingRate: formatRate(ctx.rate.rate),
      rateMeasured: ctx.rate.measured,
      marginPercent: ctx.marginPercent,
      circuitLossPercent: ctx.circuitLossPercent,
      bonusValuationPercent: ctx.bonusValuationPercent,
      fxBufferPercent: ctx.fxBufferPercent,
      configProvisional: ctx.config.provisional,
      creditFloorFcfa: formatFloor(ctx.floor.floorScaled),
      floorFromPack: ctx.floor.worst.packName,
      floorFromMethod: ctx.floor.worst.methodLabel,
      floorNetFcfa: ctx.floor.worst.netFcfa,
      floorCredits: ctx.floor.worst.credits,
      videos,
      packs: this.packRows(ctx),
      // La décision d'ouvrir la vente se prend sur le scénario PESSIMISTE, pas sur celui en vigueur.
      anyBelowCost: videos.some((v) => v.belowCost || v.worst.belowCost),
    };
  }

  /** Lignes d'un modèle : chaque combinaison d'options payantes × chaque durée retenue. */
  private async rowsOf(
    model: CatalogModel,
    ctx: PricingContext,
    worstCtx: PricingContext,
    durations: number[],
  ): Promise<VideoSimulationRow[]> {
    const rows: VideoSimulationRow[] = [];
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
          at: ctx.at,
        });
      } catch {
        // Combinaison sans tarif : elle ne peut pas être vendue (l'activation du modèle est refusée).
        continue;
      }
      const perUnit =
        unit.microUsdPerUnit * BigInt(unit.price.billableMultiplier);
      const perSecond = this.pricing.creditsPerUnit(ctx, perUnit);
      const perSecondWorst = this.pricing.creditsPerUnit(worstCtx, perUnit);

      for (const seconds of durations) {
        const inRange =
          (unit.price.minSeconds === null ||
            seconds >= unit.price.minSeconds) &&
          (unit.price.maxSeconds === null || seconds <= unit.price.maxSeconds);
        if (!inRange) continue;
        const costMicroUsd = perUnit * BigInt(seconds);
        const quote = this.pricing.quote(ctx, costMicroUsd);
        const worstQuote = this.pricing.quote(worstCtx, costMicroUsd);
        const charged = perSecond * seconds;
        const chargedWorst = perSecondWorst * seconds;
        const brought = this.broughtFcfa(charged, ctx);
        const broughtWorst = this.broughtFcfa(chargedWorst, worstCtx);

        rows.push({
          modelSlug: model.slug,
          modelName: model.name,
          resolution: resolution ?? '—',
          durationSeconds: seconds,
          optionsLabel: this.optionsLabel(model, combo, resolutionKey),
          costUsd: formatMicroUsd(costMicroUsd, 4),
          costFcfa: quote.costFcfa,
          netNeededFcfa: quote.netNeededFcfa,
          requiredCredits: quote.credits,
          chargedCredits: charged,
          priceEquivalentFcfa: brought,
          marginFcfa: brought - quote.costFcfa,
          belowCost: charged < quote.credits,
          missingCredits: Math.max(0, quote.credits - charged),
          priceSource: unit.price.source,
          worst: {
            costFcfa: worstQuote.costFcfa,
            netNeededFcfa: worstQuote.netNeededFcfa,
            requiredCredits: worstQuote.credits,
            chargedCredits: chargedWorst,
            priceEquivalentFcfa: broughtWorst,
            marginFcfa: broughtWorst - worstQuote.costFcfa,
            belowCost: chargedWorst < worstQuote.credits,
          },
        });
      }
    }
    return rows;
  }

  /** Ce que des crédits facturés rapportent réellement, au plancher du scénario. */
  private broughtFcfa(credits: number, ctx: PricingContext): number {
    return Number((BigInt(credits) * ctx.floor.floorScaled) / FLOOR_SCALE);
  }

  /** Options payantes d'une ligne, en clair. La résolution n'y figure pas : elle a sa propre colonne. */
  private optionsLabel(
    model: CatalogModel,
    combo: Record<string, unknown>,
    resolutionKey: string | null,
  ): string {
    const parts: string[] = [];
    for (const param of model.params) {
      if (!param.affectsPrice) continue;
      if (param.key === resolutionKey) continue;
      if (param.role === 'DURATION') continue;
      if (!(param.key in combo)) continue;
      const value = combo[param.key];
      const shown =
        typeof value === 'boolean' ? (value ? 'oui' : 'non') : String(value);
      parts.push(`${param.label ?? param.key} : ${shown}`);
    }
    return parts.join(' · ');
  }

  /** Marge de chaque pack, au moyen de paiement le moins favorable (celui qui fixe le plancher). */
  private packRows(ctx: PricingContext): PackMarginRow[] {
    return ctx.floor.candidates
      .filter((c) => c.methodLabel === ctx.floor.worst.methodLabel)
      .map((c): PackMarginRow => {
        const pack = ctx.packs.find((p) => p.name === c.packName);
        return {
          name: c.packName,
          priceFcfa: pack?.price ?? 0,
          credits: pack?.credits ?? 0,
          bonusCredits: pack?.bonusCredits ?? 0,
          netFcfa: c.netFcfa,
          valuedCredits: c.credits,
          fcfaPerCredit: formatFloor(c.floorScaled),
          bonusCostFcfa: this.bonusCostFcfa(
            pack?.bonusCredits ?? 0,
            ctx.floor.floorScaled,
            ctx.marginPercent,
          ),
        };
      });
  }

  /**
   * Ce que les crédits offerts coûteront, EN FCFA. Un crédit « vaut » le plancher en FCFA ; en retirant la
   * marge commerciale de cette valeur, on retrouve la part qui part chez le fournisseur. Approché et
   * volontairement prudent : il sert à chiffrer ce que le bonus coûte, pas à le facturer.
   */
  private bonusCostFcfa(
    bonusCredits: number,
    floorScaled: bigint,
    marginPercent: string | number,
  ): number {
    if (bonusCredits <= 0) return 0;
    const broughtFcfa = (BigInt(bonusCredits) * floorScaled) / FLOOR_SCALE;
    const margin = BigInt(Math.round(Number(marginPercent) * 100));
    // valeur ÷ (1 + marge) = part de coût fournisseur.
    const costFcfa = (broughtFcfa * 10_000n) / (10_000n + margin);
    return Number(costFcfa);
  }
}
