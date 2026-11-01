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

  it('valide la configuration SasPay (facultative tant que le fournisseur n’est pas branché)', () => {
    const env = validateEnv(valid);
    expect(env.SASPAY_API_BASE_URL).toBe('https://api.saspay.me/api/v1');
    expect(env.SASPAY_TIMEOUT_MS).toBe(15000);
    expect(env.SASPAY_API_KEY).toBeUndefined();
    // Variables laissées vides dans .env : équivalent à absentes.
    const empty = validateEnv({
      ...valid,
      SASPAY_API_KEY: '',
      SASPAY_WEBHOOK_SECRET: '',
    });
    expect(empty.SASPAY_API_KEY).toBeUndefined();
    expect(empty.SASPAY_WEBHOOK_SECRET).toBeUndefined();
    const ok = validateEnv({
      ...valid,
      SASPAY_API_KEY: 'sk_' + 'live_abcdef0123456789',
      SASPAY_WEBHOOK_SECRET: 'w'.repeat(16),
    });
    expect(ok.SASPAY_API_KEY).toBe('sk_' + 'live_abcdef0123456789');
  });

  it('refuse une clé SasPay mal formée, un secret trop court et une URL non HTTPS', () => {
    expect(() =>
      validateEnv({ ...valid, SASPAY_API_KEY: 'pk_live_abc' }),
    ).toThrow(/SASPAY_API_KEY/);
    expect(() =>
      validateEnv({ ...valid, SASPAY_WEBHOOK_SECRET: 'court' }),
    ).toThrow(/SASPAY_WEBHOOK_SECRET/);
    expect(() =>
      validateEnv({ ...valid, SASPAY_API_BASE_URL: 'http://api.saspay.me' }),
    ).toThrow(/HTTPS/);
    expect(() => validateEnv({ ...valid, SASPAY_TIMEOUT_MS: '10' })).toThrow(
      /SASPAY_TIMEOUT_MS/,
    );
  });

  it('exige les variables SMTP quand EMAIL_PROVIDER=smtp', () => {
    expect(() => validateEnv({ ...valid, EMAIL_PROVIDER: 'smtp' })).toThrow(
      /SMTP_HOST/,
    );
    const ok = validateEnv({
      ...valid,
      EMAIL_PROVIDER: 'smtp',
      SMTP_HOST: 'smtp.example.test',
      SMTP_USER: 'u',
      SMTP_PASSWORD: 'p',
    });
    expect(ok.SMTP_PORT).toBe(587);
    expect(ok.SMTP_SECURE).toBe('false');
  });

  it('refuse le port 25 en production', () => {
    expect(() =>
      validateEnv({
        ...valid,
        NODE_ENV: 'production',
        EMAIL_PROVIDER: 'smtp',
        SMTP_HOST: 'h',
        SMTP_USER: 'u',
        SMTP_PASSWORD: 'p',
        SMTP_PORT: '25',
      }),
    ).toThrow(/port 25/);
  });

  it('valeurs par défaut des codes à usage unique', () => {
    const env = validateEnv(valid);
    expect([
      env.EMAIL_OTP_LENGTH,
      env.EMAIL_OTP_TTL_MINUTES,
      env.EMAIL_OTP_MAX_ATTEMPTS,
      env.EMAIL_OTP_RESEND_COOLDOWN_SECONDS,
      env.EMAIL_OTP_MAX_SENDS_PER_HOUR,
    ]).toEqual([6, 10, 5, 60, 5]);
  });

  it('refuse un secret d’installation trop court', () => {
    expect(() => validateEnv({ ...valid, SETUP_SECRET: 'court' })).toThrow(
      /SETUP_SECRET/,
    );
  });

  it('exige les identifiants Higgsfield quand GENERATION_PROVIDER=higgsfield', () => {
    expect(() =>
      validateEnv({ ...valid, GENERATION_PROVIDER: 'higgsfield' }),
    ).toThrow(/HF_API_KEY_ID/);
    const ok = validateEnv({
      ...valid,
      GENERATION_PROVIDER: 'higgsfield',
      HF_API_KEY_ID: 'id',
      HF_API_KEY_SECRET: 's',
    });
    expect(ok.HF_API_URL).toBe('https://api.higgsfield.ai');
  });

  it('exige les variables R2 quand STORAGE_DRIVER=r2', () => {
    expect(() => validateEnv({ ...valid, STORAGE_DRIVER: 'r2' })).toThrow(
      /R2_ACCOUNT_ID/,
    );
    expect(
      validateEnv({
        ...valid,
        STORAGE_DRIVER: 'r2',
        R2_ACCOUNT_ID: 'a',
        R2_ACCESS_KEY_ID: 'k',
        R2_SECRET_ACCESS_KEY: 's',
        R2_BUCKET_NAME: 'b',
      }).STORAGE_DRIVER,
    ).toBe('r2');
  });

  it('refuse un pilote de stockage ou de génération inconnu', () => {
    expect(() => validateEnv({ ...valid, STORAGE_DRIVER: 's3' })).toThrow(
      /STORAGE_DRIVER/,
    );
    expect(() =>
      validateEnv({ ...valid, GENERATION_PROVIDER: 'autre' }),
    ).toThrow(/GENERATION_PROVIDER/);
  });
});
