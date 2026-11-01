import { ProviderInvalidResponseError } from '../payment-provider';
import {
  formatAmount,
  mapSaspayStatus,
  parseOptionalWholeAmount,
  parseWholeAmount,
} from './saspay.mapper';

describe('saspay.mapper', () => {
  it('transforme les statuts documentés', () => {
    expect(mapSaspayStatus('PENDING')).toBe('pending');
    expect(mapSaspayStatus('SUCCESS')).toBe('success');
    expect(mapSaspayStatus('FAILED')).toBe('failed');
    expect(mapSaspayStatus('CANCELLED')).toBe('cancelled');
  });

  it.each(['success', 'REFUNDED', '', null, undefined, 42])(
    'un statut inconnu (%p) n’est jamais interprété',
    (value) => {
      expect(() => mapSaspayStatus(value)).toThrow(
        ProviderInvalidResponseError,
      );
    },
  );

  it('convertit les montants décimaux en entiers sans flottant', () => {
    expect(parseWholeAmount('9500.00', 'x')).toBe(9500);
    expect(parseWholeAmount('9500', 'x')).toBe(9500);
    expect(parseWholeAmount(0, 'x')).toBe(0);
    expect(parseWholeAmount('0.00', 'x')).toBe(0);
  });

  it.each(['9500.01', '-1.00', 'abc', '', null, undefined, {}])(
    'refuse le montant %p',
    (value) => {
      expect(() => parseWholeAmount(value, 'x')).toThrow(
        ProviderInvalidResponseError,
      );
    },
  );

  it('les montants facultatifs absents donnent null', () => {
    expect(parseOptionalWholeAmount(undefined, 'x')).toBeNull();
    expect(parseOptionalWholeAmount(null, 'x')).toBeNull();
    expect(parseOptionalWholeAmount('542.00', 'x')).toBe(542);
    expect(() => parseOptionalWholeAmount('5.5', 'x')).toThrow(
      ProviderInvalidResponseError,
    );
  });

  it('formate le montant envoyé en chaîne décimale et refuse l’invalide', () => {
    expect(formatAmount(9500)).toBe('9500.00');
    for (const bad of [0, -5, 12.5, Number.NaN]) {
      expect(() => formatAmount(bad)).toThrow(RangeError);
    }
  });
});
