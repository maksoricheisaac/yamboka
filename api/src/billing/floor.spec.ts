import {
  creditFloorValue,
  creditsToCharge,
  formatFloor,
  valuedCredits,
  type FloorMethod,
  type FloorPack,
} from './floor';
import { netNeededFcfa, toMicroUsd, toRate } from './usd';

/** Grille du lancement : 10 FCFA par crédit affiché, 20 % de bonus au premier achat. */
const PACKS: FloorPack[] = [
  { name: 'Starter', price: 5000, credits: 500, bonusCredits: 100 },
  { name: 'Pro', price: 10_000, credits: 1000, bonusCredits: 200 },
  { name: 'Business', price: 25_000, credits: 2500, bonusCredits: 500 },
];

const mtn: FloorMethod = {
  label: 'Congo · MTN MoMo',
  tiers: [{ minAmount: 0, maxAmount: null, percent: 5.7 }],
};
const card: FloorMethod = {
  label: 'International · Carte',
  tiers: [{ minAmount: 0, maxAmount: null, percent: 3.5 }],
};

describe('crédits valorisés', () => {
  it('compte le bonus sur chaque crédit au lancement (100 %)', () => {
    expect(valuedCredits(PACKS[0], 100)).toBe(600);
  });

  it('ne compte qu’une part du bonus quand la mesure le permet', () => {
    // 30 % de 100 = 30 crédits de bonus valorisés.
    expect(valuedCredits(PACKS[0], 30)).toBe(530);
    // Arrondi au supérieur : compter plus de crédits abaisse le plancher, donc protège la plateforme.
    expect(valuedCredits({ ...PACKS[0], bonusCredits: 101 }, 33)).toBe(534);
  });

  it('0 % = le bonus n’est pas valorisé du tout', () => {
    expect(valuedCredits(PACKS[0], 0)).toBe(500);
  });

  it('refuse une part aberrante', () => {
    expect(() => valuedCredits(PACKS[0], 150)).toThrow(RangeError);
    expect(() => valuedCredits(PACKS[0], -1)).toThrow(RangeError);
  });
});

describe('plancher de valeur du crédit', () => {
  it('retient la combinaison la plus défavorable', () => {
    const floor = creditFloorValue(PACKS, [mtn, card], 100);
    // Starter sur MTN : net 4 715 ÷ 600 crédits = 7,8583 F par crédit.
    expect(floor.worst.packName).toBe('Starter');
    expect(floor.worst.methodLabel).toBe('Congo · MTN MoMo');
    expect(floor.worst.netFcfa).toBe(4715);
    expect(floor.worst.credits).toBe(600);
    expect(formatFloor(floor.floorScaled)).toBe('7.8583');
    expect(floor.candidates).toHaveLength(6);
  });

  it('un moyen de paiement plus cher fait baisser le plancher', () => {
    const expensive: FloorMethod = {
      label: 'Cher',
      tiers: [{ minAmount: 0, maxAmount: null, percent: 12 }],
    };
    const base = creditFloorValue(PACKS, [mtn], 100).floorScaled;
    const worse = creditFloorValue(PACKS, [mtn, expensive], 100).floorScaled;
    expect(worse).toBeLessThan(base);
  });

  it('sans frais (fournisseur simulé), le net est le prix affiché', () => {
    const floor = creditFloorValue(
      PACKS,
      [{ label: 'Simulé', tiers: [] }],
      100,
    );
    // 5 000 ÷ 600 = 8,3333.
    expect(formatFloor(floor.floorScaled)).toBe('8.3333');
  });

  it('refuse de calculer sans pack ou sans moyen de paiement', () => {
    expect(() => creditFloorValue([], [mtn], 100)).toThrow(RangeError);
    expect(() => creditFloorValue(PACKS, [], 100)).toThrow(RangeError);
  });
});

describe('crédits à facturer', () => {
  const floor = creditFloorValue(PACKS, [mtn, card], 100).floorScaled;

  it('arrondit au-dessus et jamais sous un crédit', () => {
    // 192 F attendus ÷ 7,8583 = 24,43 → 25 crédits.
    expect(creditsToCharge(192, floor)).toBe(25);
    expect(creditsToCharge(1, floor)).toBe(1);
  });

  it('PROPRIÉTÉ : les crédits facturés couvrent toujours le net attendu', () => {
    for (const usd of ['0.01', '0.05', '0.25', '0.50', '1.20', '6']) {
      for (const rate of [600, '694.9451', 800]) {
        for (const margin of [0, 5, 10, 25]) {
          const net = netNeededFcfa(toMicroUsd(usd), toRate(rate), margin);
          const credits = creditsToCharge(net, floor);
          // Ce que ces crédits ont rapporté, au plancher, est au moins le net attendu.
          const broughtScaled = BigInt(credits) * floor;
          expect(broughtScaled >= BigInt(net) * 10_000n).toBe(true);
        }
      }
    }
  });

  it('refuse un net ou un plancher invalide', () => {
    expect(() => creditsToCharge(0, floor)).toThrow(RangeError);
    expect(() => creditsToCharge(100, 0n)).toThrow(RangeError);
  });
});

describe('diagnostic de la grille actuelle (480p, 5 s)', () => {
  it('montre que 20 crédits ne couvrent PAS le coût au taux provisoire', () => {
    const floor = creditFloorValue(PACKS, [mtn], 100).floorScaled;
    // Coût fournisseur : 5 s × 0,05 $ = 0,25 $, au taux provisoire 694,9451 F/$, marge 10 %.
    const net = netNeededFcfa(toMicroUsd('0.25'), toRate('694.9451'), 10);
    expect(net).toBe(192);
    const needed = creditsToCharge(net, floor);
    // Il faudrait 25 crédits là où la grille en facture 20 : 5 crédits de perte par vidéo.
    expect(needed).toBe(25);
    expect(needed).toBeGreaterThan(20);
  });
});
