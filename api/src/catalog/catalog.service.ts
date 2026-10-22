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
  packTotalCredits,
  quoteCredits,
} from './pricing';

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

  async listPacks(country = 'CG'): Promise<PackView[]> {
    const [packs, products] = await Promise.all([
      this.prisma.creditPack.findMany({
        where: { country, active: true },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.generationProduct.findMany({ where: { active: true } }),
    ]);
    const video = products.find((p) => p.billingUnit === 'SECOND');
    const image = products.find((p) => p.billingUnit === 'IMAGE');

    return packs.map((p) => {
      const total = packTotalCredits({
        price: p.price,
        baseCredits: p.credits,
        bonusPercent: p.bonusPercent,
      });
      return {
        id: p.id,
        name: p.name,
        currency: p.currency,
        priceFcfa: p.price,
        baseCredits: p.credits,
        bonusPercent: p.bonusPercent,
        totalCredits: total,
        featured: p.featured,
        equivalent: {
          videoSeconds: video ? Math.floor(total / video.creditsPerUnit) : 0,
          images: image ? Math.floor(total / image.creditsPerUnit) : 0,
        },
      };
    });
  }

  async listProducts(): Promise<ProductView[]> {
    const products = await this.prisma.generationProduct.findMany({
      where: { active: true },
      orderBy: { createdAt: 'asc' },
    });
    return products.map((p) => ({
      code: p.code,
      name: p.name,
      billingUnit: p.billingUnit,
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
      openpayCommissionPercent,
      regenOverheadPercent,
      minMarginPercent,
    ] = await Promise.all([
      this.settings.get('usdToXafRate'),
      this.settings.get('fxFeePercent'),
      this.settings.get('openpayCommissionPercent'),
      this.settings.get('regenOverheadPercent'),
      this.settings.get('minMarginPercent'),
    ]);
    return {
      usdToXafRate,
      fxFeePercent,
      openpayCommissionPercent,
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
      // Référence : une vidéo de 10 s, ou une image.
      const units = product.billingUnit === 'SECOND' ? 10 : 1;
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
