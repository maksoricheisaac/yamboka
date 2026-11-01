import { SpendableLot, allocateFifo, spendableTotal } from './fifo';

const now = new Date('2026-10-29T12:00:00Z');
const day = 86_400_000;
const lot = (
  id: string,
  remaining: number,
  expiresInDays: number,
  createdOffsetDays = 0,
): SpendableLot => ({
  id,
  remaining,
  expiresAt: new Date(now.getTime() + expiresInDays * day),
  createdAt: new Date(now.getTime() + createdOffsetDays * day),
});

describe('allocateFifo', () => {
  it('dépense d’abord le lot qui expire le plus tôt, quel que soit l’ordre de la liste', () => {
    const lots = [lot('late', 100, 300), lot('soon', 30, 10)];
    expect(allocateFifo(lots, 50, now)).toEqual({
      takes: [
        { lotId: 'soon', amount: 30 },
        { lotId: 'late', amount: 20 },
      ],
      shortfall: 0,
    });
  });

  it('à échéance égale, le lot créé en premier part en premier', () => {
    const lots = [lot('b', 10, 30, -1), lot('a', 10, 30, -5)];
    expect(allocateFifo(lots, 4, now).takes).toEqual([
      { lotId: 'a', amount: 4 },
    ]);
  });

  it('ne touche jamais un lot échu ni un lot vide', () => {
    const lots = [
      lot('expired', 50, -1),
      lot('empty', 0, 5),
      lot('ok', 20, 60),
    ];
    expect(allocateFifo(lots, 20, now)).toEqual({
      takes: [{ lotId: 'ok', amount: 20 }],
      shortfall: 0,
    });
  });

  it('un lot qui expire exactement maintenant est déjà échu', () => {
    expect(allocateFifo([lot('edge', 10, 0)], 5, now).takes).toEqual([]);
  });

  it('signale ce qui manque quand les lots ne suffisent pas', () => {
    const r = allocateFifo([lot('a', 10, 5), lot('b', 5, 9)], 20, now);
    expect(r.shortfall).toBe(5);
    expect(r.takes).toEqual([
      { lotId: 'a', amount: 10 },
      { lotId: 'b', amount: 5 },
    ]);
  });

  it('une demande nulle ne prélève rien', () => {
    expect(allocateFifo([lot('a', 10, 5)], 0, now)).toEqual({
      takes: [],
      shortfall: 0,
    });
  });

  it('ne modifie pas la liste reçue', () => {
    const lots = [lot('late', 100, 300), lot('soon', 30, 10)];
    allocateFifo(lots, 50, now);
    expect(lots.map((l) => l.id)).toEqual(['late', 'soon']);
    expect(lots[1].remaining).toBe(30);
  });
});

describe('spendableTotal', () => {
  it('additionne seulement les lots non échus', () => {
    expect(
      spendableTotal(
        [lot('a', 10, 5), lot('expired', 99, -2), lot('b', 5, 1)],
        now,
      ),
    ).toBe(15);
  });
});
