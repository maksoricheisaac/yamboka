import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  PackMarginRow,
  VideoSimulationRow,
  SimulationView,
} from '@yamboka/shared';
import {
  firstPurchaseBonusCredits,
  firstPurchaseBonusPercent,
} from '../billing/bonus';
import {
  creditFloorValue,
  creditsToCharge,
  formatFloor,
  type FloorMethod,
  type FloorPack,
} from '../billing/floor';
import {
  formatMicroUsd,
  formatRate,
  microUsdToFcfa,
  netNeededFcfa,
  provisionalROut,
  rPricing,
} from '../billing/usd';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../pricing/pricing.service';
import { ProviderLedgerService } from '../provider-balance/provider-ledger.service';
import { SettingsService } from '../settings/settings.service';

/** Durées proposées par défaut dans le simulateur : la plus courte, l'usuelle, la plus longue. */
const DEFAULT_DURATIONS = [5, 10, 30];

/**
 * Simulateur d'administration : pour chaque vidéo du catalogue, ce qu'elle coûte, ce qu'elle doit rapporter,
 * combien de crédits il faudrait facturer, et ce que la grille facture aujourd'hui.
 *
 * Il ne réimplémente AUCUN calcul : il appelle les mêmes fonctions que la facturation réelle (`usd.ts`,
 * `floor.ts`, `fees.ts`). Un scénario change seulement des paramètres d'entrée — perte de circuit, marge,
 * part du bonus valorisée — ce qui permet de voir où la grille passe sous le coût AVANT de la modifier.
 */
@Injectable()
export class AdminSimulatorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly providerLedger: ProviderLedgerService,
    private readonly payments: PaymentsService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Simulation complète : plancher de valeur du crédit, une ligne par résolution et durée, et la marge de
   * chaque pack. Les scénarios passés en paramètre remplacent les valeurs en vigueur, sans rien enregistrer.
   */
  async simulate(scenario: {
    marginPercent?: string;
    circuitLossPercent?: string;
    bonusValuationPercent?: string;
    durations?: number[];
  }): Promise<SimulationView> {
    const at = new Date();
    const config = await this.pricing.config(at);
    const marginPercent = scenario.marginPercent ?? config.marginPercent;
    const circuitLossPercent =
      scenario.circuitLossPercent ?? config.circuitLossPercent;
    const bonusValuationPercent =
      scenario.bonusValuationPercent ?? config.bonusValuationPercent;
    const durations =
      scenario.durations && scenario.durations.length > 0
        ? scenario.durations
        : DEFAULT_DURATIONS;

    // Taux sortant : la mesure prime ; à défaut, le provisoire RECONSTRUIT avec la perte de circuit du scénario.
    const measured = await this.providerLedger.measuredROut();
    const rate = rPricing({
      lastROut: measured.last,
      weightedROut: measured.weighted,
      fallbackROut: provisionalROut(config.cardFcfaPerUsd, circuitLossPercent),
      fxBufferPercent: config.fxBufferPercent,
    });

    const [packs, methods] = await Promise.all([
      this.publicPacks(),
      this.openPaymentMethods(),
    ]);
    if (packs.length === 0) {
      throw new ConflictException({
        code: 'NO_PUBLIC_PACK',
        message:
          'Aucun pack publié : la valeur plancher du crédit est incalculable.',
      });
    }
    const floor = creditFloorValue(packs, methods, bonusValuationPercent);

    const products = await this.prisma.generationProduct.findMany({
      where: { active: true, resolution: { not: null } },
      orderBy: { creditsPerUnit: 'asc' },
    });
    if (products.length === 0) {
      throw new NotFoundException({
        code: 'NO_PRODUCT',
        message: 'Aucun produit vidéo actif à simuler.',
      });
    }

    const videos: VideoSimulationRow[] = [];
    for (const product of products) {
      const price = await this.pricing.modelPrice({
        providerModel: product.providerModel,
        resolution: product.resolution,
        at,
      });
      for (const seconds of durations) {
        const inRange =
          (price.minSeconds === null || seconds >= price.minSeconds) &&
          (price.maxSeconds === null || seconds <= price.maxSeconds);
        if (!inRange) continue;
        const costMicroUsd = this.pricing.providerCostMicroUsd(price, {
          durationSeconds: seconds,
        });
        const costFcfa = microUsdToFcfa(costMicroUsd, rate.rate);
        const netNeeded = netNeededFcfa(costMicroUsd, rate.rate, marginPercent);
        const required = creditsToCharge(netNeeded, floor.floorScaled);
        const charged = product.creditsPerUnit * seconds;
        // Ce que les crédits facturés ont RÉELLEMENT rapporté, au plancher.
        const broughtFcfa = Number(
          (BigInt(charged) * floor.floorScaled) / 10_000n,
        );
        videos.push({
          resolution: product.resolution ?? '—',
          durationSeconds: seconds,
          costUsd: formatMicroUsd(costMicroUsd, 4),
          costFcfa,
          netNeededFcfa: netNeeded,
          requiredCredits: required,
          chargedCredits: charged,
          marginFcfa: broughtFcfa - costFcfa,
          belowCost: charged < required,
          missingCredits: Math.max(0, required - charged),
          priceSource: price.source,
        });
      }
    }

    return {
      pricingRate: formatRate(rate.rate),
      rateMeasured: rate.measured,
      marginPercent: String(marginPercent),
      circuitLossPercent: String(circuitLossPercent),
      bonusValuationPercent: String(bonusValuationPercent),
      fxBufferPercent: config.fxBufferPercent,
      configProvisional: config.provisional,
      creditFloorFcfa: formatFloor(floor.floorScaled),
      floorFromPack: floor.worst.packName,
      floorFromMethod: floor.worst.methodLabel,
      floorNetFcfa: floor.worst.netFcfa,
      floorCredits: floor.worst.credits,
      videos,
      packs: floor.candidates
        .filter((c) => c.methodLabel === floor.worst.methodLabel)
        .map((c): PackMarginRow => {
          const pack = packs.find((p) => p.name === c.packName);
          return {
            name: c.packName,
            priceFcfa: pack?.price ?? 0,
            credits: pack?.credits ?? 0,
            bonusCredits: pack?.bonusCredits ?? 0,
            netFcfa: c.netFcfa,
            valuedCredits: c.credits,
            fcfaPerCredit: formatFloor(c.floorScaled),
            /** Coût du bonus : ce que les crédits offerts coûteront en FCFA au taux retenu. */
            bonusCostFcfa: microUsdToFcfa(
              this.bonusMicroUsd(
                pack?.bonusCredits ?? 0,
                floor.floorScaled,
                marginPercent,
              ),
              rate.rate,
            ),
          };
        }),
      anyBelowCost: videos.some((v) => v.belowCost),
    };
  }

  /**
   * Coût fournisseur approché des crédits offerts : ce qu'ils permettent de consommer. Un crédit « vaut »
   * le plancher en FCFA, dont il faut retirer la marge pour retrouver la part de coût fournisseur, puis
   * repasser en dollars. Approché et volontairement prudent : il sert à chiffrer ce que le bonus coûte.
   */
  private bonusMicroUsd(
    bonusCredits: number,
    floorScaled: bigint,
    marginPercent: string | number,
  ): bigint {
    if (bonusCredits <= 0) return 0n;
    const fcfa = (BigInt(bonusCredits) * floorScaled) / 10_000n;
    const margin = BigInt(Math.round(Number(marginPercent) * 100));
    // fcfa ÷ (1 + marge) = part de coût fournisseur, exprimée ensuite en micro-dollars par le taux.
    const costFcfa = (fcfa * 10_000n) / (10_000n + margin);
    return costFcfa > 0n ? costFcfa : 0n;
  }

  /** Packs publiés, avec le bonus de premier achat réellement applicable à chacun. */
  private async publicPacks(): Promise<FloorPack[]> {
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

  /** Moyens de paiement ouverts, avec leur tarif d'encaissement réel : entrée du calcul du plancher. */
  private async openPaymentMethods(): Promise<FloorMethod[]> {
    const rows = await this.prisma.countryPaymentMethod.findMany({
      where: { status: 'ACTIVE', country: { status: 'ACTIVE' } },
      include: { country: true, method: true },
    });
    const methods: FloorMethod[] = [];
    for (const row of rows) {
      const resolved = await this.payments.resolvePayinTiers(
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
