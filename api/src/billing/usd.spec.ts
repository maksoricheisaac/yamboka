import {
  formatMicroUsd,
  formatRate,
  measureROut,
  microUsdToFcfa,
  netNeededFcfa,
  provisionalROut,
  remainingPerTopUp,
  rPricing,
  toMicroUsd,
  toRate,
  weightedROutOfBalance,
} from './usd';

describe('micro-dollars', () => {
  it('convertit sans flottant et refuse une précision perdue', () => {
    expect(toMicroUsd('0.23')).toBe(230_000n);
    expect(toMicroUsd(0.05)).toBe(50_000n);
    expect(toMicroUsd('1')).toBe(1_000_000n);
    expect(() => toMicroUsd('0.0000001')).toThrow(RangeError);
  });

  it('formate pour l’affichage', () => {
    expect(formatMicroUsd(230_000n)).toBe('0.23');
    expect(formatMicroUsd(1_234_567n, 6)).toBe('1.234567');
    expect(formatMicroUsd(-500_000n)).toBe('-0.50');
    expect(formatMicroUsd(2_000_000n, 0)).toBe('2');
  });

  it('valorise en FCFA en arrondissant au-dessus', () => {
    // 0,23 $ × 600 = 138 F pile.
    expect(microUsdToFcfa(230_000n, toRate(600))).toBe(138);
    // 0,23 $ × 600,5 = 138,115 → 139 : jamais en dessous du coût.
    expect(microUsdToFcfa(230_000n, toRate('600.5'))).toBe(139);
  });
});

describe('r_out', () => {
  it('mesure le taux sortant et arrondit au-dessus', () => {
    // 15 000 F nets retirés pour 20 $ arrivés = 750 F/$.
    expect(measureROut(15_000, toMicroUsd(20))).toBe(toRate(750));
    // 10 000 F pour 14,53 $ = 688,2312… → arrondi au-dessus.
    expect(measureROut(10_000, toMicroUsd('14.53'))).toBe(toRate('688.2313'));
  });

  it('refuse une mesure incomplète plutôt que d’inventer un taux', () => {
    expect(() => measureROut(0, toMicroUsd(20))).toThrow(RangeError);
    expect(() => measureROut(15_000, 0n)).toThrow(RangeError);
  });

  it('consomme les recharges de la plus ancienne à la plus récente', () => {
    const lots = [
      { microUsd: toMicroUsd(10), rOut: toRate(700) },
      { microUsd: toMicroUsd(10), rOut: toRate(800) },
    ];
    expect(remainingPerTopUp(lots, toMicroUsd(0))).toEqual([
      toMicroUsd(10),
      toMicroUsd(10),
    ]);
    expect(remainingPerTopUp(lots, toMicroUsd(12))).toEqual([
      0n,
      toMicroUsd(8),
    ]);
    expect(remainingPerTopUp(lots, toMicroUsd(25))).toEqual([0n, 0n]);
  });

  it('pondère la moyenne par ce qui reste de chaque recharge', () => {
    const lots = [
      { microUsd: toMicroUsd(10), rOut: toRate(700) },
      { microUsd: toMicroUsd(10), rOut: toRate(800) },
    ];
    // Rien de consommé : moyenne des deux.
    expect(weightedROutOfBalance(lots, 0n)).toBe(toRate(750));
    // La première recharge est épuisée : seule la seconde compte.
    expect(weightedROutOfBalance(lots, toMicroUsd(10))).toBe(toRate(800));
    // Solde épuisé : aucune mesure à offrir.
    expect(weightedROutOfBalance(lots, toMicroUsd(20))).toBeNull();
  });
});

describe('valeur attendue d’une génération', () => {
  it('applique le taux puis la marge, arrondi au-dessus', () => {
    // 0,23 $ × 600 F = 138 F, + 5 % = 144,9 → 145 F.
    expect(netNeededFcfa(toMicroUsd('0.23'), toRate(600), 5)).toBe(145);
    // 0,50 $ × 612 F = 306 F, + 10 % = 336,6 → 337 F.
    expect(netNeededFcfa(toMicroUsd('0.50'), toRate(612), 10)).toBe(337);
    // Sans marge, le net attendu reste le coût valorisé.
    expect(netNeededFcfa(toMicroUsd('0.50'), toRate(600), 0)).toBe(300);
  });

  it('ne descend JAMAIS sous le coût valorisé, quelle que soit la configuration', () => {
    for (const usd of ['0.01', '0.05', '0.23', '0.50', '1.37', '6']) {
      for (const rate of [600, 681, '694.9451', 1000]) {
        for (const margin of [0, 5, 10, '12.5', 30]) {
          const micro = toMicroUsd(usd);
          const r = toRate(rate);
          const net = netNeededFcfa(micro, r, margin);
          // Propriété : le net attendu couvre toujours le coût fournisseur valorisé au même taux.
          expect(net).toBeGreaterThanOrEqual(microUsdToFcfa(micro, r));
        }
      }
    }
  });

  it('refuse un coût, un taux ou une marge absurdes', () => {
    expect(() => netNeededFcfa(0n, toRate(600), 5)).toThrow(RangeError);
    expect(() => netNeededFcfa(toMicroUsd(1), 0n, 5)).toThrow(RangeError);
    expect(() => netNeededFcfa(toMicroUsd(1), toRate(600), -1)).toThrow(
      RangeError,
    );
  });
});

describe('taux de tarification', () => {
  const fallback = provisionalROut(620, 9);

  it('construit un repli prudent à partir du taux carte et de la perte de circuit', () => {
    // 620 ÷ 0,91 = 681,3186… → arrondi au-dessus.
    expect(fallback).toBe(toRate('681.3187'));
  });

  it('retient le taux le plus défavorable, majoré de la marge de change', () => {
    const out = rPricing({
      lastROut: toRate(700),
      weightedROut: toRate(750),
      fallbackROut: fallback,
      fxBufferPercent: 2,
    });
    // max(700, 750) × 1,02 = 765.
    expect(formatRate(out.rate)).toBe('765.0000');
    expect(out.measured).toBe(true);
  });

  it('se rabat sur le provisoire quand aucune recharge n’est mesurée, et le dit', () => {
    const out = rPricing({
      lastROut: null,
      weightedROut: null,
      fallbackROut: fallback,
      fxBufferPercent: 0,
    });
    expect(out.rate).toBe(fallback);
    expect(out.measured).toBe(false);
  });

  it('ne descend jamais sous le taux mesuré', () => {
    for (const buffer of [0, 1, '2.5', 10]) {
      const out = rPricing({
        lastROut: toRate(700),
        weightedROut: toRate(812),
        fallbackROut: fallback,
        fxBufferPercent: buffer,
      });
      expect(out.rate >= toRate(812)).toBe(true);
    }
  });

  it('refuse une marge négative ou une perte de circuit absurde', () => {
    expect(() =>
      rPricing({
        lastROut: toRate(700),
        weightedROut: null,
        fallbackROut: fallback,
        fxBufferPercent: -1,
      }),
    ).toThrow(RangeError);
    expect(() => provisionalROut(620, 100)).toThrow(RangeError);
  });
});
