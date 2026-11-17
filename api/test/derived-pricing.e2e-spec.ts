import './isolate-derived-pricing-db';
import { INestApplication } from '@nestjs/common';
import { FLOOR_DECIMALS } from '../src/billing/floor';
import { microUsdToFcfa } from '../src/billing/usd';
import { ModelCatalogService } from '../src/generation/model-catalog.service';
import { pricedCombinations } from '../src/generation/model-input';
import {
  CreditPricingService,
  type PricingScenario,
} from '../src/pricing/credit-pricing.service';
import { createApp } from './helpers';
import { resetDatabase } from './reset-database';

/**
 * LA garantie du lot : aucune combinaison vendable ne se vend sous son coût fournisseur.
 *
 * Le test parcourt tout ce qui est réellement vendable — chaque modèle actif, chaque résolution, chaque
 * durée autorisée, chaque combinaison d'options payantes — et vérifie que les crédits facturés rapportent
 * au moins le coût, DANS LES DEUX scénarios : celui en vigueur et le scénario pessimiste.
 *
 * Il ne réimplémente pas le calcul : il appelle les mêmes services que le devis et le débit réel.
 */
describe('Tarification dérivée : jamais sous le coût (e2e)', () => {
  let app: INestApplication;
  let catalog: ModelCatalogService;
  let pricing: CreditPricingService;

  /** Durées testées : les bornes du modèle et des valeurs intermédiaires. */
  const durationsOf = (allowed: unknown): number[] => {
    const bounds =
      allowed && typeof allowed === 'object' && !Array.isArray(allowed)
        ? (allowed as { min?: number; max?: number })
        : {};
    const min = bounds.min ?? 1;
    const max = bounds.max ?? 30;
    const mid = Math.floor((min + max) / 2);
    return [...new Set([min, min + 1, mid, max - 1, max])].filter(
      (d) => d >= min && d <= max,
    );
  };

  beforeAll(async () => {
    await resetDatabase(process.env.DATABASE_URL!);
    app = await createApp();
    catalog = app.get(ModelCatalogService);
    pricing = app.get(CreditPricingService);
  }, 120_000);
  afterAll(async () => {
    await app.close();
  });

  /** Toutes les lignes vendables, avec leur coût et les crédits facturés, pour un scénario donné. */
  const grid = async (scenario: PricingScenario) => {
    const ctx = await pricing.context(scenario);
    const models = await catalog.active();
    expect(models.length).toBeGreaterThan(0);
    const rows: {
      slug: string;
      resolution: string | null;
      options: Record<string, unknown>;
      seconds: number;
      costFcfa: number;
      credits: number;
      broughtFcfa: number;
      marginFcfa: number;
    }[] = [];

    for (const model of models) {
      const resolutionKey = catalog.keyOfRole(model, 'RESOLUTION');
      const durationParam = model.params.find((p) => p.role === 'DURATION');
      const durations = durationsOf(durationParam?.allowedValues);
      for (const combo of pricedCombinations(model)) {
        const resolution = resolutionKey
          ? ((combo[resolutionKey] as string | undefined) ?? null)
          : null;
        const unit = await catalog.costPerUnit(model, {
          priced: combo,
          resolution,
          at: ctx.at,
        });
        // Crédits par seconde, tels que le devis les affiche : c'est eux qui sont facturés.
        const perSecond = pricing.creditsPerUnit(
          ctx,
          unit.microUsdPerUnit * BigInt(unit.price.billableMultiplier),
        );
        for (const seconds of durations) {
          const costMicroUsd =
            unit.microUsdPerUnit *
            BigInt(seconds) *
            BigInt(unit.price.billableMultiplier);
          const credits = perSecond * seconds;
          const broughtFcfa = Number(
            (BigInt(credits) * ctx.floor.floorScaled) /
              10n ** BigInt(FLOOR_DECIMALS),
          );
          rows.push({
            slug: model.slug,
            resolution,
            options: combo,
            seconds,
            costFcfa: microUsdToFcfa(costMicroUsd, ctx.rate.rate),
            credits,
            broughtFcfa,
            marginFcfa:
              broughtFcfa - microUsdToFcfa(costMicroUsd, ctx.rate.rate),
          });
        }
      }
    }
    return rows;
  };

  it.each([
    ['scénario en vigueur', {}],
    ['scénario pessimiste', { pessimistic: true }],
  ])(
    'aucune combinaison ne se vend sous son coût (%s)',
    async (_label, scenario) => {
      const rows = await grid(scenario);
      expect(rows.length).toBeGreaterThan(0);
      const negatives = rows.filter((r) => r.marginFcfa < 0);
      // Le message nomme la combinaison fautive : sans cela, un échec ici est indéchiffrable.
      expect(
        negatives.map(
          (r) =>
            `${r.slug} ${r.resolution ?? '—'} ${r.seconds}s ${JSON.stringify(r.options)} : marge ${r.marginFcfa} F`,
        ),
      ).toEqual([]);
    },
    120_000,
  );

  it('le scénario pessimiste facture toujours au moins autant que le scénario en vigueur', async () => {
    const [current, worst] = await Promise.all([
      grid({}),
      grid({ pessimistic: true }),
    ]);
    expect(worst).toHaveLength(current.length);
    for (const [i, row] of current.entries()) {
      expect(worst[i].credits).toBeGreaterThanOrEqual(row.credits);
    }
  }, 120_000);

  it('facture au moins un crédit, même pour la plus petite vidéo possible', async () => {
    const rows = await grid({});
    expect(rows.every((r) => r.credits >= 1)).toBe(true);
  }, 120_000);
});
