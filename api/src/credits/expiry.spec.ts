import { CreditLot, computeExpirations } from './expiry';

const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n));
const lot = (
  id: string,
  amount: number,
  expiresInDays: number,
  createdDay = 0,
): CreditLot => ({
  id,
  amount,
  expiresAt: day(expiresInDays),
  createdAt: day(createdDay),
});

describe('computeExpirations (FIFO)', () => {
  it("n'expire rien tant que l'échéance n'est pas atteinte", () => {
    expect(
      computeExpirations([lot('a', 10, 30)], new Map(), 0, day(10)),
    ).toEqual([]);
  });

  it('expire tout un lot échu et intact', () => {
    expect(
      computeExpirations([lot('a', 10, 30)], new Map(), 0, day(31)),
    ).toEqual([{ lotId: 'a', amount: 10 }]);
  });

  it("n'expire que le reste d'un lot partiellement consommé", () => {
    expect(
      computeExpirations([lot('a', 10, 30)], new Map(), 4, day(31)),
    ).toEqual([{ lotId: 'a', amount: 6 }]);
  });

  it("n'expire rien d'un lot entièrement consommé", () => {
    expect(
      computeExpirations([lot('a', 10, 30)], new Map(), 10, day(31)),
    ).toEqual([]);
  });

  it('consomme d’abord le lot qui expire en premier, quel que soit l’ordre de la liste', () => {
    const lots = [lot('tard', 10, 365), lot('tot', 10, 30)];
    // 10 consommés : ils entament le lot « tot » ; « tard » reste intact.
    expect(computeExpirations(lots, new Map(), 10, day(31))).toEqual([]);
    // 3 consommés : 7 restent dans « tot », qui expire.
    expect(computeExpirations(lots, new Map(), 3, day(31))).toEqual([
      { lotId: 'tot', amount: 7 },
    ]);
  });

  it('les crédits de bienvenue (30 jours) sont consommés avant les crédits achetés (12 mois)', () => {
    const lots = [lot('achat', 100, 365), lot('bienvenue', 4, 30)];
    expect(computeExpirations(lots, new Map(), 4, day(31))).toEqual([]);
  });

  it('est idempotent : un lot déjà expiré ne l’est pas une seconde fois', () => {
    const lots = [lot('a', 10, 30)];
    expect(computeExpirations(lots, new Map([['a', 6]]), 4, day(31))).toEqual(
      [],
    );
  });

  it('ne rend jamais le solde négatif quand on consomme après l’expiration d’un lot antérieur', () => {
    // A (10, échu à J30) et B (10, échéance J60). 5 crédits consommés avant J30 → A en expire 5.
    // Puis l'utilisateur dépense les 10 crédits restants (solde = 10, tous dans B). Consommation nette = 15.
    const lots = [lot('A', 10, 30), lot('B', 10, 60)];
    const expired = new Map([['A', 5]]);
    // À J61, B est entièrement consommé : rien à expirer (sinon on écrirait −5 sur un solde de 0).
    expect(computeExpirations(lots, expired, 15, day(61))).toEqual([]);
  });

  it('expire le reste de B quand la consommation après l’expiration de A est partielle', () => {
    const lots = [lot('A', 10, 30), lot('B', 10, 60)];
    const expired = new Map([['A', 5]]);
    // Consommation nette 8 = 5 (dans A, figés) + 3 dans B → il reste 7 dans B.
    expect(computeExpirations(lots, expired, 8, day(61))).toEqual([
      { lotId: 'B', amount: 7 },
    ]);
  });

  it('un remboursement (consommation nette plus faible) restitue du reste au lot', () => {
    const lots = [lot('a', 10, 30)];
    // 10 réservés puis remboursés : consommation nette 0 → les 10 crédits expirent bien.
    expect(computeExpirations(lots, new Map(), 0, day(31))).toEqual([
      { lotId: 'a', amount: 10 },
    ]);
  });

  it('ignore une consommation négative (jamais de création de crédits)', () => {
    expect(
      computeExpirations([lot('a', 10, 30)], new Map(), -50, day(31)),
    ).toEqual([{ lotId: 'a', amount: 10 }]);
  });
});
