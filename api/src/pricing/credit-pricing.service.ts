import { Injectable } from '@nestjs/common';
import {
  firstPurchaseBonusCredits,
  firstPurchaseBonusPercent,
} from '../billing/bonus';
import {
  creditFloorValue,
  creditsToCharge,
  type CreditFloor,
  type FloorMethod,
  type FloorPack,
} from '../billing/floor';
import {
  microUsdToFcfa,
  netNeededFcfa,
  provisionalROut,
  rPricing,
  toRate,
  type PricingRate,
} from '../billing/usd';
import { PayinRatesService } from '../payments/payin-rates.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProviderLedgerService } from '../provider-balance/provider-ledger.service';
import { SettingsService } from '../settings/settings.service';
import { PricingService, type PricingConfigView } from './pricing.service';

/**
 * Tarification DÉRIVÉE : le nombre de crédits facturés n'est plus saisi, il se calcule.
 *
 *   coût $        → coût FCFA au taux sortant retenu (r_pricing)
 *   net requis    = coût $ × r_pricing × (1 + marge)
 *   plancher      = net reçu du pack le moins favorable ÷ crédits reçus (bonus valorisé compris)
 *   crédits       = ⌈ net requis ÷ plancher ⌉
 *
 * UNE seule implémentation, utilisée par le devis affiché, le débit réel et le simulateur : un écart entre
 * ces trois-là serait exactement la façon de vendre sous le coût sans s'en apercevoir.
 *
 * Tant que `provisional = true` (aucun r_out mesuré, frais de retrait non vérifiés), le calcul applique le
 * SCÉNARIO PESSIMISTE : perte de circuit plancher de 14 %, marge de change plancher de 2 %, bonus compté à
 * 100 %, frais entrants du palier le moins favorable parmi les moyens ouverts.
 */

/** Valeurs plancher du scénario pessimiste (le plus défavorable retenu, jamais le plus favorable). */
export const PESSIMISTIC = {
  circuitLossPercent: 14,
  fxBufferPercent: 2,
  bonusValuationPercent: 100,
} as const;

export interface PricingScenario {
  marginPercent?: string | number;
  circuitLossPercent?: string | number;
  bonusValuationPercent?: string | number;
  fxBufferPercent?: string | number;
  /** Force le scénario pessimiste, quel que soit `provisional`. */
  pessimistic?: boolean;
  /**
   * Taux sortant MESURÉ imposé (FCFA/$ en texte décimal) : sert à montrer ce que deviendrait la grille si
   * le taux d'une recharge était appliqué, avant qu'il le soit. Il remplace le taux retenu, et comme il
   * est mesuré, la marge de change du scénario s'y ajoute toujours mais la perte de circuit provisoire
   * n'entre plus en jeu.
   */
  measuredRateOverride?: string;
  at?: Date;
}

export interface PricingContext {
  at: Date;
  config: PricingConfigView;
  /** Taux retenu pour tarifer (r_pricing), mesuré si une recharge l'a été. */
  rate: PricingRate;
  floor: CreditFloor;
  packs: FloorPack[];
  marginPercent: string;
  circuitLossPercent: string;
  bonusValuationPercent: string;
  fxBufferPercent: string;
  /** Vrai si le scénario pessimiste a été appliqué. */
  pessimistic: boolean;
}

export interface CreditQuote {
  /** Coût fournisseur figé pour cet appel, en micro-dollars. */
  costMicroUsd: bigint;
  costFcfa: number;
  netNeededFcfa: number;
  credits: number;
  /** Ce que ces crédits rapportent réellement, au plancher. */
  broughtFcfa: number;
  marginFcfa: number;
}

/** Le plus défavorable de deux pourcentages (le plus grand), en texte décimal. */
function worstOf(current: string, floorValue: number): string {
  return Number(current) >= floorValue ? current : String(floorValue);
}

@Injectable()
export class CreditPricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly providerLedger: ProviderLedgerService,
    private readonly payinRates: PayinRatesService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Tout ce dont dépend un prix à un instant donné : paramètres en vigueur, taux sortant retenu, plancher de
   * valeur du crédit. Un scénario remplace les valeurs sans rien enregistrer (simulateur, aperçu).
   */
  async context(scenario: PricingScenario = {}): Promise<PricingContext> {
    const at = scenario.at ?? new Date();
    const config = await this.pricing.config(at);
    const pessimistic = scenario.pessimistic ?? config.provisional;

    // Une valeur explicitement fournie par l'appelant (simulateur, aperçu) n'est JAMAIS corrigée : sans
    // cela, un scénario ne pourrait pas explorer une hypothèse plus favorable que le plancher prudent.
    // Le plancher pessimiste ne s'applique donc qu'aux valeurs non précisées — c'est-à-dire au chemin réel.
    const circuitLossPercent = this.scenarioValue(
      scenario.circuitLossPercent,
      config.circuitLossPercent,
      pessimistic ? PESSIMISTIC.circuitLossPercent : null,
    );
    const fxBufferPercent = this.scenarioValue(
      scenario.fxBufferPercent,
      config.fxBufferPercent,
      pessimistic ? PESSIMISTIC.fxBufferPercent : null,
    );
    const bonusValuationPercent = this.scenarioValue(
      scenario.bonusValuationPercent,
      config.bonusValuationPercent,
      pessimistic ? PESSIMISTIC.bonusValuationPercent : null,
    );
    const marginPercent = String(
      scenario.marginPercent ?? config.marginPercent,
    );

    // Le taux MESURÉ prime toujours : la perte de circuit n'est qu'un provisoire, et ne s'y ajoute jamais.
    const measured = scenario.measuredRateOverride
      ? { last: toRate(scenario.measuredRateOverride), weighted: null }
      : await this.providerLedger.measuredROut();
    const rate = rPricing({
      lastROut: measured.last,
      weightedROut: measured.weighted,
      fallbackROut: provisionalROut(config.cardFcfaPerUsd, circuitLossPercent),
      fxBufferPercent,
    });

    const [packs, methods] = await Promise.all([
      this.publicPacks(),
      this.openPaymentMethods(),
    ]);
    const floor = creditFloorValue(packs, methods, bonusValuationPercent);

    return {
      at,
      config,
      rate,
      floor,
      packs,
      marginPercent,
      circuitLossPercent,
      bonusValuationPercent,
      fxBufferPercent,
      pessimistic,
    };
  }

  /**
   * Valeur retenue pour un paramètre de scénario : celle fournie si elle l'est, sinon celle en vigueur,
   * ramenée au plancher prudent quand le scénario pessimiste s'applique.
   */
  private scenarioValue(
    provided: string | number | undefined,
    inForce: string,
    pessimisticFloor: number | null,
  ): string {
    if (provided !== undefined) return String(provided);
    return pessimisticFloor === null
      ? inForce
      : worstOf(inForce, pessimisticFloor);
  }

  /**
   * Crédits à facturer pour un coût fournisseur donné. C'est LA fonction : le devis, le débit et le
   * simulateur l'appellent tous les trois.
   */
  quote(ctx: PricingContext, costMicroUsd: bigint): CreditQuote {
    const costFcfa = microUsdToFcfa(costMicroUsd, ctx.rate.rate);
    const netNeeded = netNeededFcfa(
      costMicroUsd,
      ctx.rate.rate,
      ctx.marginPercent,
    );
    const credits = creditsToCharge(netNeeded, ctx.floor.floorScaled);
    const broughtFcfa = Number(
      (BigInt(credits) * ctx.floor.floorScaled) / 10_000n,
    );
    return {
      costMicroUsd,
      costFcfa,
      netNeededFcfa: netNeeded,
      credits,
      broughtFcfa,
      marginFcfa: broughtFcfa - costFcfa,
    };
  }

  /**
   * Crédits par unité facturée (seconde de vidéo) : le devis affiché reste linéaire en durée, et comme
   * chaque seconde est arrondie au-dessus, `durée × crédits par seconde` est TOUJOURS ≥ le strict requis.
   * C'est la valeur dérivée qui remplace la saisie libre de `creditsPerUnit`.
   */
  creditsPerUnit(ctx: PricingContext, costMicroUsdPerUnit: bigint): number {
    return this.quote(ctx, costMicroUsdPerUnit).credits;
  }

  /**
   * Crédits qui couvrent STRICTEMENT le coût fournisseur, sans marge commerciale. Sert à décider si un
   * devis déjà affiché peut encore être honoré après un changement de configuration : on tient la promesse
   * commerciale, mais jamais au point de vendre sous le coût.
   */
  coverCredits(ctx: PricingContext, costMicroUsd: bigint): number {
    const netNeeded = netNeededFcfa(costMicroUsd, ctx.rate.rate, 0);
    return creditsToCharge(netNeeded, ctx.floor.floorScaled);
  }

  /**
   * Plancher en dessous duquel une valeur saisie à la main vend sous le coût. Sert à REFUSER une saisie
   * manuelle trop basse : aucune valeur sous ce plancher n'est acceptée.
   */
  floorCreditsPerUnit(
    ctx: PricingContext,
    costMicroUsdPerUnit: bigint,
  ): number {
    // Sans marge commerciale : le strict nécessaire pour ne pas perdre d'argent.
    const netNeeded = netNeededFcfa(costMicroUsdPerUnit, ctx.rate.rate, 0);
    return creditsToCharge(netNeeded, ctx.floor.floorScaled);
  }

  // ───────────── Entrées du calcul ─────────────

  /** Packs publiés, avec le bonus de premier achat réellement applicable à chacun. */
  async publicPacks(): Promise<FloorPack[]> {
    const [packs, enabled, defaultPercent] = await Promise.all([
      this.prisma.creditPack.findMany({
        where: { active: true, publicVisible: true },
        orderBy: { sortOrder: 'asc' },
      }),
      this.settings.get('firstPurchaseBonusEnabled'),
      this.settings.get('firstPurchaseBonusDefaultPercent'),
    ]);
    return packs.map((p) => ({
      name: p.name,
      price: p.price,
      credits: p.credits,
      bonusCredits: firstPurchaseBonusCredits(
        p.credits,
        firstPurchaseBonusPercent(p.firstPurchaseBonusPercent, {
          enabled,
          defaultPercent,
        }),
      ),
    }));
  }

  /** Moyens de paiement ouverts, avec leur tarif d'encaissement réel (source : GET /pricing/my-rates/). */
  async openPaymentMethods(): Promise<FloorMethod[]> {
    const rows = await this.prisma.countryPaymentMethod.findMany({
      where: { status: 'ACTIVE', country: { status: 'ACTIVE' } },
      include: { country: true, method: true },
    });
    const methods: FloorMethod[] = [];
    for (const row of rows) {
      const resolved = await this.payinRates.resolve(
        row.countryIso,
        row.saspayNetwork ?? row.methodCode,
      );
      methods.push({
        label: `${row.country.name} · ${row.method.name}`,
        tiers: resolved?.tiers ?? [],
      });
    }
    // Aucun moyen ouvert (développement, fournisseur simulé) : on garde au moins le cas « sans frais ».
    return methods.length > 0
      ? methods
      : [{ label: 'Sans frais (fournisseur simulé)', tiers: [] }];
  }
}
