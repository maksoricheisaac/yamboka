import { firstPurchaseBonusCredits, firstPurchaseBonusPercent } from './bonus';
import { computePackMargin } from './margin';
import { computeSendAmount } from './fees';

const on = { enabled: true, defaultPercent: 20 };

describe('bonus de premier achat', () => {
  it('un pack sans pourcentage propre prend la valeur globale', () => {
    expect(firstPurchaseBonusPercent(null, on)).toBe(20);
  });

  it('un pourcentage propre au pack remplace la valeur globale', () => {
    expect(firstPurchaseBonusPercent(10, on)).toBe(10);
    expect(firstPurchaseBonusPercent(35, on)).toBe(35);
  });

  it('0 sur un pack = aucun bonus pour ce pack', () => {
    expect(firstPurchaseBonusPercent(0, on)).toBe(0);
  });

  it('désactivé globalement : jamais de bonus, même avec un pourcentage de pack', () => {
    expect(firstPurchaseBonusPercent(10, { ...on, enabled: false })).toBe(0);
    expect(firstPurchaseBonusPercent(null, { ...on, enabled: false })).toBe(0);
  });

  it('borne les valeurs aberrantes', () => {
    expect(firstPurchaseBonusPercent(-5, on)).toBe(0);
    expect(firstPurchaseBonusPercent(250, on)).toBe(100);
    expect(firstPurchaseBonusPercent(Number.NaN, on)).toBe(0);
  });

  it.each([
    [1250, 20, 250],
    [2600, 20, 520], // Pro : 2 600 + 520 = 3 120
    [6800, 20, 1360],
    [1255, 20, 251], // arrondi à l'inférieur
    [1250, 0, 0],
  ])('%i crédits à %i %% → %i crédits de bonus', (base, percent, bonus) => {
    expect(firstPurchaseBonusCredits(base, percent)).toBe(bonus);
  });
});

describe('marge d’un pack (perte du circuit 9 %, 1 crédit = 2,5 FCFA)', () => {
  const tiers = [{ minAmount: 0, maxAmount: null, percent: 5.7 }];
  const margin = (price: number, credits: number) => {
    const { sentAmount } = computeSendAmount(price, tiers);
    return computePackMargin({
      displayedPrice: price,
      sentAmount,
      credits,
      bonusCredits: Math.floor(credits * 0.2),
      circuitLossPercent: 9,
      fcfaPerCredit: 2.5,
    });
  };

  it('Starter 5 000 FCFA / 1 250 crédits', () => {
    const m = margin(5000, 1250);
    expect(m.receivedFcfa).toBe(4730);
    expect(m.netAfterCircuitFcfa).toBeCloseTo(4304.3, 1);
    expect(m.withoutBonus.hfCostFcfa).toBe(3125);
    expect(m.withoutBonus.marginPercent).toBeCloseTo(24.9, 1);
    expect(m.withBonus.marginPercent).toBeCloseTo(11.7, 1);
  });

  it('Pro 10 000 FCFA / 2 600 crédits', () => {
    const m = margin(10_000, 2600);
    expect(m.withoutBonus.marginPercent).toBeCloseTo(22.3, 1);
    expect(m.withBonus.marginPercent).toBeCloseTo(8.5, 1);
  });

  it('Business 25 000 FCFA / 6 800 crédits', () => {
    const m = margin(25_000, 6800);
    expect(m.receivedFcfa).toBe(23_651);
    expect(m.withoutBonus.marginPercent).toBeCloseTo(19.1, 1);
    expect(m.withBonus.marginPercent).toBeCloseTo(4.7, 1);
  });

  it('la perte du circuit est un paramètre : 14 % réduit la marge', () => {
    const base = margin(10_000, 2600).withoutBonus.marginPercent;
    const worse = computePackMargin({
      displayedPrice: 10_000,
      sentAmount: 9460,
      credits: 2600,
      bonusCredits: 520,
      circuitLossPercent: 14,
      fcfaPerCredit: 2.5,
    }).withoutBonus.marginPercent;
    expect(worse).toBeLessThan(base);
  });
});
