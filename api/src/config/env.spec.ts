import { validateEnv } from './env';

const valid = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  SESSION_SECRET: 'x'.repeat(32),
};

describe('validateEnv', () => {
  it('applique les valeurs par défaut', () => {
    const env = validateEnv(valid);
    expect(env.PORT).toBe(4000);
    expect(env.PAYMENT_PROVIDER).toBe('mock');
  });

  it('refuse un secret de session trop court', () => {
    expect(() => validateEnv({ ...valid, SESSION_SECRET: 'court' })).toThrow(
      /SESSION_SECRET/,
    );
  });

  it('refuse un fournisseur de paiement autre que mock en phase 1', () => {
    expect(() =>
      validateEnv({ ...valid, PAYMENT_PROVIDER: 'openpay' }),
    ).toThrow(/PAYMENT_PROVIDER/);
  });
});
