import { BadRequestException } from '@nestjs/common';
import {
  MarginSettings,
  PackPricing,
  ProductPricing,
  computeMargin,
  packTotalCredits,
  quoteCredits,
} from './pricing';

const videoLight: ProductPricing = {
  code: 'VIDEO_LIGHT_480',
  billingUnit: 'SECOND',
  creditsPerUnit: 4,
  providerCostUsdPerUnit: 0.05,
  billableMultiplier: 2,
  minSeconds: 4,
  maxSeconds: 15,
  active: true,
};
const imageSoul: ProductPricing = {
  code: 'IMAGE_SOUL2',
  billingUnit: 'IMAGE',
  creditsPerUnit: 2,
  providerCostUsdPerUnit: 0.0057,
  billableMultiplier: 1,
  minSeconds: null,
  maxSeconds: null,
  active: true,
};
const settings: MarginSettings = {
  usdToXafRate: 575,
  fxFeePercent: 6,
  openpayCommissionPercent: 5,
  regenOverheadPercent: 15,
  minMarginPercent: 15,
};
const packs = {
  decouverte: { price: 1000, baseCredits: 40, bonusPercent: 0 },
  agence: { price: 25000, baseCredits: 1000, bonusPercent: 10 },
} satisfies Record<string, PackPricing>;

const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return ((e as BadRequestException).getResponse() as { code: string }).code;
  }
  return undefined;
};

describe('quoteCredits', () => {
  it('vidéo de 10 s = 40 crédits (1 000 FCFA à 25 FCFA le crédit)', () => {
    expect(quoteCredits(videoLight, 10)).toEqual({
      credits: 40,
      billableSeconds: 10,
    });
  });

  it('arrondit la durée facturée à la seconde supérieure', () => {
    expect(quoteCredits(videoLight, 9.2)).toEqual({
      credits: 40,
      billableSeconds: 10,
    });
    expect(quoteCredits(videoLight, 4.01).billableSeconds).toBe(5);
  });

  it('tolère le bruit de mesure de ffprobe (10.0000001 s = 10 s)', () => {
    expect(quoteCredits(videoLight, 10.0000001).billableSeconds).toBe(10);
  });

  it('accepte les bornes 4 s et 15 s', () => {
    expect(quoteCredits(videoLight, 4).credits).toBe(16);
    expect(quoteCredits(videoLight, 15).credits).toBe(60);
  });

  it('refuse une vidéo trop courte, trop longue ou sans durée', () => {
    expect(codeOf(() => quoteCredits(videoLight, 3.9))).toBe(
      'DURATION_TOO_SHORT',
    );
    expect(codeOf(() => quoteCredits(videoLight, 15.5))).toBe(
      'DURATION_TOO_LONG',
    );
    expect(codeOf(() => quoteCredits(videoLight))).toBe('DURATION_REQUIRED');
    expect(codeOf(() => quoteCredits(videoLight, Number.NaN))).toBe(
      'DURATION_REQUIRED',
    );
  });

  it('image = prix fixe, sans durée', () => {
    expect(quoteCredits(imageSoul)).toEqual({
      credits: 2,
      billableSeconds: null,
    });
  });

  it('refuse un produit inactif', () => {
    expect(
      codeOf(() => quoteCredits({ ...videoLight, active: false }, 10)),
    ).toBe('PRODUCT_UNAVAILABLE');
  });
});

describe('computeMargin (chiffres du business plan)', () => {
  it('vidéo Light 480p de 10 s, pack Découverte : ≈ 25 % de marge', () => {
    const m = computeMargin(videoLight, packs.decouverte, 10, settings);
    expect(m.revenueFcfa).toBeCloseTo(1000, 5);
    expect(m.providerCostFcfa).toBeCloseTo(700.9, 0); // « ≈ 700 FCFA »
    expect(m.marginPercent).toBeCloseTo(24.9, 0);
    expect(m.belowThreshold).toBe(false);
  });

  it('même vidéo, pack Agence (bonus 10 %) : ≈ 18 % de marge, toujours au-dessus de 15 %', () => {
    const m = computeMargin(videoLight, packs.agence, 10, settings);
    expect(m.marginPercent).toBeCloseTo(17.9, 0);
    expect(m.belowThreshold).toBe(false);
  });

  it('image portrait : ≈ 87 % de marge, coût ≈ 4 FCFA', () => {
    const m = computeMargin(imageSoul, packs.decouverte, 1, settings);
    expect(m.providerCostFcfa).toBeCloseTo(4, 0);
    expect(m.marginPercent).toBeCloseTo(87, 0);
  });

  it('alerte quand la marge passe sous le seuil (hausse du dollar)', () => {
    const m = computeMargin(videoLight, packs.agence, 10, {
      ...settings,
      usdToXafRate: 700,
    });
    expect(m.marginPercent).toBeLessThan(15);
    expect(m.belowThreshold).toBe(true);
  });
});

describe('packTotalCredits', () => {
  it.each([
    [{ price: 500, baseCredits: 20, bonusPercent: 0 }, 20],
    [{ price: 2500, baseCredits: 100, bonusPercent: 3 }, 103],
    [{ price: 5000, baseCredits: 200, bonusPercent: 5 }, 210],
    [{ price: 10000, baseCredits: 400, bonusPercent: 8 }, 432],
    [{ price: 25000, baseCredits: 1000, bonusPercent: 10 }, 1100],
  ])('%j → %i crédits', (pack, total) =>
    expect(packTotalCredits(pack)).toBe(total),
  );
});
