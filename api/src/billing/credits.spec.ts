import { BadRequestException } from '@nestjs/common';
import {
  ModelPrice,
  RateSettings,
  creditsPerSecond,
  quoteVideoCredits,
  videoEquivalent,
} from './credits';

const rates: RateSettings = { fcfaPerUsd: 600, fcfaPerCredit: 2.5 };

const model: ModelPrice = {
  code: 'TEST_MODEL',
  active: true,
  usdPerSecond: 0.1, // 0,1 × 600 ÷ 2,5 = 24 crédits/s
  usdPerSecondWithAudio: 0.15, // 36 crédits/s
  minSeconds: 3,
  maxSeconds: 15,
};

const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return ((e as BadRequestException).getResponse() as { code: string }).code;
  }
  return undefined;
};

describe('creditsPerSecond', () => {
  it('prix × taux ÷ 2,5, exact quand le résultat est entier', () => {
    expect(creditsPerSecond(0.1, rates)).toBe(24);
  });

  it('arrondit au supérieur : 0,05 $/s × 575 ÷ 2,5 = 11,5 → 12', () => {
    expect(
      creditsPerSecond(0.05, { fcfaPerUsd: 575, fcfaPerCredit: 2.5 }),
    ).toBe(12);
  });

  it('pas de crédit en trop à cause des flottants : 0,14 × 625 ÷ 2,5 = 35 exactement', () => {
    // Le piège : en flottants, Math.ceil(0.14 * 625 / 2.5) donne 36.
    expect(Math.ceil((0.14 * 625) / 2.5)).toBe(36);
    expect(
      creditsPerSecond(0.14, { fcfaPerUsd: 625, fcfaPerCredit: 2.5 }),
    ).toBe(35);
  });

  it('un dixième de crédit de trop fait passer au supérieur', () => {
    expect(creditsPerSecond('0.10001', rates)).toBe(25);
  });

  it('accepte les chaînes décimales de la base (Decimal)', () => {
    expect(
      creditsPerSecond('0.31800', { fcfaPerUsd: '575', fcfaPerCredit: '2.5' }),
    ).toBe(74);
  });

  it('le taux FCFA/$ modifie le résultat', () => {
    expect(creditsPerSecond(0.1, { fcfaPerUsd: 650, fcfaPerCredit: 2.5 })).toBe(
      26,
    );
  });

  it('refuse un prix, un taux ou un coût de crédit nul', () => {
    expect(() => creditsPerSecond(0, rates)).toThrow(RangeError);
    expect(() =>
      creditsPerSecond(0.1, { fcfaPerUsd: 0, fcfaPerCredit: 2.5 }),
    ).toThrow(RangeError);
    expect(() =>
      creditsPerSecond(0.1, { fcfaPerUsd: 600, fcfaPerCredit: 0 }),
    ).toThrow(RangeError);
  });
});

describe('quoteVideoCredits', () => {
  it('10 s = 10 × crédits par seconde', () => {
    expect(quoteVideoCredits(model, 10, rates)).toEqual({
      credits: 240,
      creditsPerSecond: 24,
      billableSeconds: 10,
    });
  });

  it('arrondit la durée à la seconde supérieure, avec tolérance sur le bruit de mesure', () => {
    expect(quoteVideoCredits(model, 9.2, rates).billableSeconds).toBe(10);
    expect(quoteVideoCredits(model, 10.0000001, rates).billableSeconds).toBe(
      10,
    );
  });

  it('audio natif : le prix du modèle change', () => {
    const q = quoteVideoCredits(model, 10, rates, { audio: true });
    expect(q.creditsPerSecond).toBe(36);
    expect(q.credits).toBe(360);
  });

  it('audio demandé sur un modèle sans option audio → refus clair', () => {
    expect(
      codeOf(() =>
        quoteVideoCredits(
          { ...model, usdPerSecondWithAudio: null },
          10,
          rates,
          {
            audio: true,
          },
        ),
      ),
    ).toBe('AUDIO_UNAVAILABLE');
  });

  it('sans option audio demandée, un modèle sans audio fonctionne', () => {
    expect(
      quoteVideoCredits({ ...model, usdPerSecondWithAudio: null }, 5, rates)
        .credits,
    ).toBe(120);
  });

  it('refuse durée hors bornes, durée absente et modèle inactif', () => {
    expect(codeOf(() => quoteVideoCredits(model, 2.9, rates))).toBe(
      'DURATION_TOO_SHORT',
    );
    expect(codeOf(() => quoteVideoCredits(model, 15.5, rates))).toBe(
      'DURATION_TOO_LONG',
    );
    expect(codeOf(() => quoteVideoCredits(model, Number.NaN, rates))).toBe(
      'DURATION_REQUIRED',
    );
    expect(
      codeOf(() => quoteVideoCredits({ ...model, active: false }, 10, rates)),
    ).toBe('PRODUCT_UNAVAILABLE');
  });

  it('un changement de taux se répercute sur le coût sans toucher aux packs', () => {
    const cheaper = quoteVideoCredits(model, 10, {
      fcfaPerUsd: 500,
      fcfaPerCredit: 2.5,
    });
    expect(cheaper.credits).toBe(200);
  });
});

describe('videoEquivalent (« ≈ N vidéos de 10 s »)', () => {
  it.each([
    [1250, 100, 12],
    [2600, 100, 26],
    [6800, 100, 68],
    [99, 100, 0],
  ])('%i crédits à %i par vidéo → %i', (credits, perVideo, expected) => {
    expect(videoEquivalent(credits, perVideo)).toBe(expected);
  });

  it('coût nul → 0 plutôt qu’une division par zéro', () => {
    expect(videoEquivalent(1000, 0)).toBe(0);
  });
});
