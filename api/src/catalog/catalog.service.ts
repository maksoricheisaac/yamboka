import { BadRequestException, Injectable } from '@nestjs/common';
import type { PackView, ProductView, QuoteView } from '@yamboka/shared';
import { CreditsService } from '../credits/credits.service';
import type { GenerationProduct } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import {
  Margin,
  MarginSettings,
  ProductPricing,
  computeMargin,
  quoteCredits,
} from './pricing';
import { loadVideoRates, toPackView } from './pack-view';

export function toPricing(p: GenerationProduct): ProductPricing {
  return {
    code: p.code,
    billingUnit: p.billingUnit,
    creditsPerUnit: p.creditsPerUnit,
    providerCostUsdPerUnit: p.providerCostUsdPerUnit.toNumber(),
    billableMultiplier: p.billableMultiplier,
    minSeconds: p.minSeconds,
    maxSeconds: p.maxSeconds,
    active: p.active,
  };
}

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credits: CreditsService,
    private readonly settings: SettingsService,
  ) {}

  /** `publicOnly` : catalogue des pages publiques (packs actifs ET publiés, trois au maximum). */
  async listPacks(country = 'CG', publicOnly = false): Promise<PackView[]> {
    const [packs, rates] = await Promise.all([
      this.prisma.creditPack.findMany({
        where: {
          country,
          active: true,
          ...(publicOnly ? { publicVisible: true } : {}),
        },
        orderBy: { sortOrder: 'asc' },
        ...(publicOnly ? { take: 3 } : {}),
      }),
      loadVideoRates(this.prisma),
    ]);
    return packs.map((p) => toPackView(p, rates));
  }

  /** État de maintenance, lisible sans connexion (bandeau et blocage des nouvelles créations). */
  async maintenance(): Promise<{ enabled: boolean; message: string | null }> {
    const enabled = await this.settings.get('maintenanceMode');
    if (!enabled) return { enabled: false, message: null };
    const row = await this.prisma.setting.findUnique({
      where: { key: 'maintenanceMessage' },
    });
    return {
      enabled: true,
      message: typeof row?.value === 'string' ? row.value : null,
    };
  }

  async listProducts(): Promise<ProductView[]> {
    const products = await this.prisma.generationProduct.findMany({
      where: { active: true, billingUnit: 'SECOND' },
      orderBy: { createdAt: 'asc' },
    });
    return products.map((p) => ({
      code: p.code,
      name: p.name,
      billingUnit: 'SECOND' as const,
      creditsPerUnit: p.creditsPerUnit,
      minSeconds: p.minSeconds,
      maxSeconds: p.maxSeconds,
    }));
  }

  /** Devis : le coût est calculé ici, à partir du produit en base. Aucune donnée de prix ne vient du client. */
  async quote(
    productCode: string,
    durationSeconds?: number,
  ): Promise<QuoteView> {
    const product = await this.prisma.generationProduct.findUnique({
      where: { code: productCode },
    });
    if (!product) {
      throw new BadRequestException({
        code: 'PRODUCT_UNAVAILABLE',
        message: 'Ce type de création n’existe pas.',
      });
    }
    const { credits, billableSeconds } = quoteCredits(
      toPricing(product),
      durationSeconds,
    );
    const creditValueFcfa = await this.credits.creditValue();
    return {
      productCode,
      credits,
      billableSeconds,
      creditValueFcfa,
      valueFcfa: credits * creditValueFcfa,
    };
  }

  async marginSettings(): Promise<MarginSettings> {
    const [
      usdToXafRate,
      fxFeePercent,
      paymentCommissionPercent,
      regenOverheadPercent,
      minMarginPercent,
    ] = await Promise.all([
      this.settings.get('usdToXafRate'),
      this.settings.get('fxFeePercent'),
      this.settings.get('paymentCommissionPercent'),
      this.settings.get('regenOverheadPercent'),
      this.settings.get('minMarginPercent'),
    ]);
    return {
      usdToXafRate,
      fxFeePercent,
      paymentCommissionPercent,
      regenOverheadPercent,
      minMarginPercent,
    };
  }

  /** Marge de chaque produit pour chaque pack actif, avec alerte sous le seuil (AD-32). Utilisée par l'admin. */
  async margins(): Promise<
    { product: string; pack: string; margin: Margin }[]
  > {
    const [products, packs, s] = await Promise.all([
      this.prisma.generationProduct.findMany({ where: { active: true } }),
      this.prisma.creditPack.findMany({
        where: { active: true },
        orderBy: { sortOrder: 'asc' },
      }),
      this.marginSettings(),
    ]);
    const rows: { product: string; pack: string; margin: Margin }[] = [];
    for (const product of products) {
      // Référence : une vidéo de 10 s.
      const units = 10;
      for (const pack of packs) {
        rows.push({
          product: product.code,
          pack: pack.name,
          margin: computeMargin(
            toPricing(product),
            {
              price: pack.price,
              baseCredits: pack.credits,
              bonusPercent: pack.bonusPercent,
            },
            units,
            s,
          ),
        });
      }
    }
    return rows;
  }
}
