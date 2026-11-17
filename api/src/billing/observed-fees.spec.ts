import { FEE_DEVIATION_ALERT_POINTS, observedFees } from './observed-fees';

/**
 * Le net reçu est la seule valeur qui compte pour la plateforme : le prix affiché, lui, comprend des frais
 * qu'on ne garde pas. Ces tests fixent ce que l'on enregistre, et quand on alerte.
 */
describe('observedFees', () => {
  it('calcule le net reçu et les deux pourcentages', () => {
    // Palier MTN observé : 5,7 %. Sur 5 000 F affichés, 285 F de frais → 4 715 F nets.
    const r = observedFees({
      displayedAmount: 5000,
      expectedNet: 4715,
      observedFee: 285,
    });
    expect(r.netReceived).toBe(4715);
    expect(r.observedFeePercent).toBe('5.7000');
    expect(r.expectedFeePercent).toBe('5.7000');
    expect(r.deviationPoints).toBe(0);
    expect(r.alert).toBe(false);
  });

  it('alerte quand les frais observés dépassent les frais attendus de plus de 0,5 point', () => {
    const r = observedFees({
      displayedAmount: 5000,
      expectedNet: 4715, // 5,7 % attendus
      observedFee: 350, // 7,0 % observés
    });
    expect(r.deviationPoints).toBeCloseTo(1.3, 4);
    expect(r.alert).toBe(true);
  });

  it('n’alerte pas pour un écart inférieur au seuil', () => {
    const r = observedFees({
      displayedAmount: 10_000,
      expectedNet: 9430, // 5,7 %
      observedFee: 590, // 5,9 %
    });
    expect(r.deviationPoints).toBeCloseTo(0.2, 4);
    expect(r.alert).toBe(false);
  });

  it('n’alerte jamais quand le fournisseur est MOINS cher que prévu', () => {
    const r = observedFees({
      displayedAmount: 5000,
      expectedNet: 4715,
      observedFee: 100,
    });
    expect(r.deviationPoints! < 0).toBe(true);
    expect(r.alert).toBe(false);
  });

  it('ne devine rien quand le fournisseur ne donne pas ses frais', () => {
    const r = observedFees({
      displayedAmount: 5000,
      expectedNet: 4715,
      observedFee: null,
    });
    expect(r.netReceived).toBe(4715);
    expect(r.observedFeePercent).toBeNull();
    expect(r.deviationPoints).toBeNull();
    expect(r.alert).toBe(false);
  });

  it('reste muet quand ni l’attendu ni l’observé ne sont connus', () => {
    const r = observedFees({
      displayedAmount: 5000,
      expectedNet: null,
      observedFee: null,
    });
    expect(r.netReceived).toBeNull();
    expect(r.expectedFeePercent).toBeNull();
    expect(r.alert).toBe(false);
  });

  it('le seuil d’alerte est bien un demi-point', () => {
    expect(FEE_DEVIATION_ALERT_POINTS).toBe(0.5);
  });
});
