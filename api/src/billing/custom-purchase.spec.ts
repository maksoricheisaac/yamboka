import { customAmount, customBounds, isSoldAtLoss } from './custom-purchase';

describe('customAmount', () => {
  it('multiplie les crédits par le prix du crédit', () => {
    expect(customAmount(125, 4)).toBe(500);
    expect(customAmount(250, 4)).toBe(1000);
    expect(customAmount(1250, 4)).toBe(5000);
  });

  it('arrondit au supérieur : jamais en dessous du prix', () => {
    expect(customAmount(3, 4.1)).toBe(13); // 12,3 → 13
    expect(customAmount(1, 3.68)).toBe(4);
  });

  it('évite les erreurs de flottants (4,1 × 3)', () => {
    expect(customAmount(10, 4.1)).toBe(41);
  });

  it('refuse une quantité ou un prix invalide', () => {
    expect(() => customAmount(0, 4)).toThrow();
    expect(() => customAmount(-5, 4)).toThrow();
    expect(() => customAmount(1.5, 4)).toThrow();
    expect(() => customAmount(10, 0)).toThrow();
  });
});

describe('customBounds', () => {
  it('déduit les bornes en crédits des bornes de montant', () => {
    expect(customBounds(4, { min: 500, max: 500_000 })).toEqual({
      minCredits: 125,
      maxCredits: 125_000,
    });
  });

  it('le minimum de crédits coûte au moins le montant minimum, le maximum au plus le plafond', () => {
    const limits = { min: 500, max: 500_000 };
    for (const unit of [3.68, 4, 4.1, 7]) {
      const b = customBounds(unit, limits);
      expect(customAmount(b.minCredits, unit)).toBeGreaterThanOrEqual(
        limits.min,
      );
      expect(customAmount(b.minCredits - 1, unit)).toBeLessThan(limits.min);
      expect(customAmount(b.maxCredits, unit)).toBeLessThanOrEqual(limits.max);
    }
  });
});

describe('isSoldAtLoss', () => {
  const base = {
    circuitLossPercent: 9,
    fcfaPerCredit: 2.5,
  };

  it('4 FCFA le crédit, frais à 3 % : marge positive', () => {
    expect(
      isSoldAtLoss({
        ...base,
        displayedPrice: 1000,
        sentAmount: 970,
        credits: 250,
      }),
    ).toBe(false);
  });

  it('refuse quand les frais absorbés mangent la marge (petit montant, frais fixes)', () => {
    expect(
      isSoldAtLoss({
        ...base,
        displayedPrice: 500,
        sentAmount: 330,
        credits: 125,
      }),
    ).toBe(true);
  });

  it('refuse un prix du crédit inférieur au coût', () => {
    expect(
      isSoldAtLoss({
        ...base,
        displayedPrice: 250,
        sentAmount: 250,
        credits: 125,
      }),
    ).toBe(true);
  });
});
