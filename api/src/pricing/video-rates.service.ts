import { Injectable } from '@nestjs/common';
import type { CreditRates, VideoResolution } from '@yamboka/shared';
import { DEFAULT_RESOLUTION, VIDEO_RESOLUTIONS } from '@yamboka/shared';
import { ModelCatalogService } from '../generation/model-catalog.service';
import type { CatalogModel } from '../generation/model-input';
import {
  CreditPricingService,
  type PricingContext,
} from './credit-pricing.service';

/**
 * Tarifs affichés, en crédits par seconde, DÉRIVÉS du coût fournisseur : une seule implémentation pour la
 * page de création, les équivalences des packs, le devis et le débit réel.
 *
 * Le devis reste linéaire en durée (durée × crédits par seconde) alors que la formule arrondit au-dessus :
 * comme l'arrondi est fait sur la SECONDE, `durée × crédits par seconde` est toujours supérieur ou égal au
 * strict requis. L'écart va dans le sens de la plateforme, jamais l'inverse.
 */
@Injectable()
export class VideoRatesService {
  constructor(
    private readonly catalog: ModelCatalogService,
    private readonly creditPricing: CreditPricingService,
  ) {}

  /** Tarifs du modèle actif par défaut. */
  async rates(): Promise<CreditRates> {
    const [model, ctx] = await Promise.all([
      this.catalog.defaultModel(),
      this.creditPricing.context(),
    ]);
    return this.ratesOf(model, ctx);
  }

  /** Tarifs d'un modèle donné dans un contexte donné (scénario du simulateur, aperçu d'une version). */
  async ratesOf(
    model: CatalogModel,
    ctx: PricingContext,
  ): Promise<CreditRates> {
    const rates = {} as CreditRates;
    for (const r of VIDEO_RESOLUTIONS) rates[r] = 0;
    const proposed = this.catalog.resolutionsOf(model);
    const list = proposed.length > 0 ? proposed : [DEFAULT_RESOLUTION];
    for (const resolution of list) {
      if (!(VIDEO_RESOLUTIONS as readonly string[]).includes(resolution)) {
        continue;
      }
      rates[resolution as VideoResolution] = await this.creditsPerSecond(
        model,
        ctx,
        resolution,
      );
    }
    return rates;
  }

  /** Crédits facturés pour UNE seconde d'une résolution, options par défaut du modèle comprises. */
  async creditsPerSecond(
    model: CatalogModel,
    ctx: PricingContext,
    resolution: string,
  ): Promise<number> {
    const resolutionKey = this.catalog.keyOfRole(model, 'RESOLUTION');
    const priced = this.catalog.defaultPriced(
      model,
      resolutionKey ? { [resolutionKey]: resolution } : {},
    );
    const unit = await this.catalog.costPerUnit(model, {
      priced,
      resolution,
      at: ctx.at,
    });
    return this.creditPricing.creditsPerUnit(
      ctx,
      unit.microUsdPerUnit * BigInt(unit.price.billableMultiplier),
    );
  }
}
