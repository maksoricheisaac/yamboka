import {
  FeeComputationError,
  FeeTier,
  computeFee,
  computeSendAmount,
} from './fees';

const flat = (
  percent: number | string,
  extra: Partial<FeeTier> = {},
): FeeTier[] => [{ minAmount: 0, maxAmount: null, percent, ...extra }];

const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return (e as FeeComputationError).code;
  }
  return undefined;
};

/** Oracle : recherche exhaustive du plus grand A valide (sans dichotomie). */
function bruteForce(price: number, tiers: FeeTier[]): number | null {
  for (let a = price; a >= 1; a--) {
    let fee: number;
    try {
      fee = computeFee(a, tiers);
    } catch {
      continue; // montant hors de tout palier
    }
    if (a + fee <= price) return a;
  }
  return null;
}

describe('computeSendAmount : taux simple', () => {
  it('10 000 FCFA à 5,7 % → on envoie 9 460, le client paie exactement 10 000', () => {
    const r = computeSendAmount(10_000, flat(5.7));
    expect(r).toEqual({
      sentAmount: 9460,
      fee: 540,
      total: 10_000,
      absorbed: 540,
    });
  });

  it('5 000 FCFA à 5,7 % → 4 730', () => {
    expect(computeSendAmount(5000, flat(5.7)).sentAmount).toBe(4730);
  });

  it('25 000 FCFA à 5,7 % → 23 651 (frais arrondis par excès : jamais plus que le prix affiché)', () => {
    const r = computeSendAmount(25_000, flat(5.7));
    expect(r.sentAmount).toBe(23_651);
    expect(r.total).toBe(25_000);
  });

  it('accepte un pourcentage en chaîne comme dans la réponse SasPay', () => {
    expect(computeSendAmount(10_000, flat('5.700')).sentAmount).toBe(9460);
  });

  it('le client ne paie jamais plus que le prix, et un FCFA de plus dépasserait', () => {
    for (const price of [1000, 2500, 5000, 10_000, 25_000, 99_999]) {
      for (const percent of [0.5, 1.8, 2.5, 5.7, 8.25]) {
        const tiers = flat(percent);
        const r = computeSendAmount(price, tiers);
        expect(r.total).toBeLessThanOrEqual(price);
        const next = r.sentAmount + 1;
        expect(next + computeFee(next, tiers)).toBeGreaterThan(price);
      }
    }
  });

  it('taux nul : on envoie le prix affiché', () => {
    expect(computeSendAmount(5000, flat(0)).sentAmount).toBe(5000);
  });
});

describe('computeSendAmount : plancher, plafond et frais fixes', () => {
  it('plancher dominant : 1 000 FCFA à 2,5 % avec plancher 50 → frais 50, envoi 950', () => {
    const r = computeSendAmount(1000, flat(2.5, { floorAmount: '50.00' }));
    expect(r).toMatchObject({ sentAmount: 950, fee: 50, total: 1000 });
  });

  it('le plancher n’intervient pas quand le pourcentage dépasse déjà le plancher', () => {
    const r = computeSendAmount(10_000, flat(2.5, { floorAmount: '50.00' }));
    expect(r.fee).toBeGreaterThan(50);
    expect(r.total).toBeLessThanOrEqual(10_000);
  });

  it('plafond : 10 000 FCFA à 5 % avec plafond 100 → frais 100, envoi 9 900', () => {
    const r = computeSendAmount(10_000, flat(5, { capAmount: '100.00' }));
    expect(r).toMatchObject({ sentAmount: 9900, fee: 100, total: 10_000 });
  });

  it('frais fixes : 10 000 FCFA à 1 % + 25 → envoi 9 876', () => {
    const r = computeSendAmount(10_000, flat(1, { fixed: '25.00' }));
    expect(r).toMatchObject({ sentAmount: 9876, total: 10_000 });
  });

  it('plancher et plafond ensemble', () => {
    const tiers = flat(3, { floorAmount: 40, capAmount: 200 });
    expect(computeSendAmount(500, tiers).fee).toBe(40);
    expect(computeSendAmount(20_000, tiers).fee).toBe(200);
  });

  it('le prix ne couvre pas le plancher → erreur claire', () => {
    expect(
      codeOf(() => computeSendAmount(40, flat(2.5, { floorAmount: 50 }))),
    ).toBe('AMOUNT_TOO_LOW');
  });
});

describe('computeSendAmount : paliers', () => {
  const tiers: FeeTier[] = [
    { minAmount: 0, maxAmount: 5000, percent: 5 },
    { minAmount: 5001, maxAmount: null, percent: 2 },
  ];

  it('retient le meilleur palier : au-dessus de la frontière, le taux réduit s’applique', () => {
    // palier 1 : 4 952 + 248 = 5 200 ; palier 2 : 5 098 + 102 = 5 200 → 5 098 est plus grand
    const r = computeSendAmount(5200, tiers);
    expect(r.sentAmount).toBe(5098);
    expect(r.fee).toBe(102);
  });

  it('sous la frontière, seul le premier palier convient', () => {
    expect(computeSendAmount(4000, tiers).sentAmount).toBe(3809); // 3 809 + 191 = 4 000
  });

  it('un prix pile à la frontière ne dépasse jamais le prix affiché', () => {
    for (const price of [5000, 5001, 5002, 5250, 5251]) {
      const r = computeSendAmount(price, tiers);
      expect(r.total).toBeLessThanOrEqual(price);
      expect(r.sentAmount).toBe(bruteForce(price, tiers));
    }
  });

  it('computeFee choisit le palier qui couvre le montant', () => {
    expect(computeFee(5000, tiers)).toBe(250);
    expect(computeFee(5001, tiers)).toBe(101);
  });

  it('aucun palier ne couvre le montant', () => {
    expect(
      codeOf(() =>
        computeFee(50, [{ minAmount: 100, maxAmount: null, percent: 5 }]),
      ),
    ).toBe('NO_TIER');
  });
});

describe('computeSendAmount : validations', () => {
  it('refuse le mode DEDUCTED (frais retirés du montant) : non pris en charge', () => {
    expect(
      codeOf(() =>
        computeSendAmount(5000, flat(5, { feeChargeMode: 'DEDUCTED' })),
      ),
    ).toBe('UNSUPPORTED_FEE_MODE');
  });

  it.each([0, -5, 12.5, Number.NaN])('refuse le prix invalide %p', (price) => {
    expect(codeOf(() => computeSendAmount(price, flat(5)))).toBe(
      'INVALID_PRICE',
    );
  });

  it('refuse une liste de paliers vide', () => {
    expect(codeOf(() => computeSendAmount(5000, []))).toBe('NO_TIER');
  });

  it('refuse un taux avec trop de décimales plutôt que de l’arrondir en silence', () => {
    expect(() => computeSendAmount(5000, flat('5.123456'))).toThrow(RangeError);
  });
});

describe('computeSendAmount : égal à la recherche exhaustive', () => {
  const scenarios: [string, FeeTier[]][] = [
    ['simple', flat(5.7)],
    ['plancher', flat(2.5, { floorAmount: 50 })],
    ['plafond', flat(5, { capAmount: 100 })],
    ['fixe', flat(1.8, { fixed: 25 })],
    [
      'plancher+plafond+fixe',
      flat(2.5, { fixed: 10, floorAmount: 60, capAmount: 150 }),
    ],
    [
      'paliers',
      [
        { minAmount: 0, maxAmount: 2000, percent: 6, fixed: 10 },
        { minAmount: 2001, maxAmount: 10_000, percent: 3.5 },
        { minAmount: 10_001, maxAmount: null, percent: 2, capAmount: 400 },
      ],
    ],
  ];

  it.each(scenarios)('%s', (_name, tiers) => {
    const prices = [
      200, 777, 1000, 1999, 2000, 2001, 2500, 5000, 9999, 10_000, 10_001,
      15_000, 25_000,
    ];
    for (const price of prices) {
      const expected = bruteForce(price, tiers);
      if (expected === null) {
        expect(() => computeSendAmount(price, tiers)).toThrow(
          FeeComputationError,
        );
      } else {
        expect(computeSendAmount(price, tiers).sentAmount).toBe(expected);
      }
    }
  });
});
