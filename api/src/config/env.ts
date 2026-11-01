import { z } from 'zod';

/** Une variable laissée vide dans .env (« SASPAY_API_KEY= ») équivaut à une variable absente. */
const emptyToUndefined = (v: unknown) =>
  typeof v === 'string' && v.trim() === '' ? undefined : v;

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6380'),
  /** Force la file de tâches (true) ou l'exécution directe (false). Par défaut : active sauf en test. */
  QUEUE_ENABLED: z.enum(['true', 'false']).optional(),
  SESSION_SECRET: z
    .string()
    .min(32, 'SESSION_SECRET doit contenir au moins 32 caractères'),
  APP_URL: z.string().url().default('http://localhost:3001'),
  WEB_URL: z.string().url().default('http://localhost:3000'),
  /** Secret partagé avec le site public pour rafraîchir ses offres sans attendre l'expiration du cache. Facultatif. */
  REVALIDATE_SECRET: z
    .string()
    .min(16, 'REVALIDATE_SECRET doit contenir au moins 16 caractères')
    .optional(),
  API_URL: z.string().url().default('http://localhost:4000'),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  /** Domaine du cookie de session (ex. .yamboka.com) ; vide en local. */
  COOKIE_DOMAIN: z.string().optional(),
  /** Nombre de proxys de confiance devant l'API (pour l'adresse IP réelle). */
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().url().optional(),
  // ───── E-mails : `console` (développement, rien n'est envoyé) ou `smtp` (envoi réel) ─────
  EMAIL_PROVIDER: z.enum(['console', 'smtp']).default('console'),
  EMAIL_FROM: z.string().default('Yamboka <no-reply@yamboka.local>'),
  EMAIL_REPLY_TO: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  /** true : TLS implicite (port 465). false : STARTTLS (port 587), exigé hors développement. */
  SMTP_SECURE: z.enum(['true', 'false']).default('false'),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  // ───── Codes à usage unique (OTP) ─────
  EMAIL_OTP_LENGTH: z.coerce.number().int().min(4).max(10).default(6),
  EMAIL_OTP_TTL_MINUTES: z.coerce.number().int().min(1).max(60).default(10),
  EMAIL_OTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
  EMAIL_OTP_RESEND_COOLDOWN_SECONDS: z.coerce
    .number()
    .int()
    .min(0)
    .max(3600)
    .default(60),
  EMAIL_OTP_MAX_SENDS_PER_HOUR: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(5),
  /** Secret d'installation : protège le Setup Wizard tant que la plateforme n'est pas initialisée. */
  SETUP_SECRET: z
    .string()
    .min(24, 'SETUP_SECRET doit contenir au moins 24 caractères')
    .optional(),
  PAYMENT_PROVIDER: z.enum(['mock']).default('mock'),
  // ───── SasPay : paiements RÉELS (aucun bac à sable sur ce compte). Clés uniquement côté serveur. ─────
  SASPAY_API_BASE_URL: z
    .string()
    .url()
    .startsWith('https://', 'SASPAY_API_BASE_URL doit être en HTTPS')
    .default('https://api.saspay.me/api/v1'),
  /** Clé secrète `sk_live_…` (ou `sk_test_…`) de scope PAYIN. Jamais exposée au navigateur ni écrite dans les logs. */
  SASPAY_API_KEY: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .regex(
        /^sk_(live|test)_\S+$/,
        'SASPAY_API_KEY doit ressembler à sk_live_… ou sk_test_…',
      )
      .optional(),
  ),
  /** `signing_secret` du webhook, affiché une seule fois dans le tableau de bord SasPay. */
  SASPAY_WEBHOOK_SECRET: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .min(16, 'SASPAY_WEBHOOK_SECRET doit contenir au moins 16 caractères')
      .optional(),
  ),
  SASPAY_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(60000)
    .default(15000),
  /** mock : génération simulée. higgsfield : appels réels (payants) à l'API Higgsfield. */
  GENERATION_PROVIDER: z.enum(['mock', 'higgsfield']).default('mock'),
  /** Durée d'une génération simulée (mock), en secondes : 0 en test, quelques secondes en développement. */
  MOCK_GENERATION_SECONDS: z.coerce.number().min(0).default(0),
  HF_API_KEY_ID: z.string().optional(),
  HF_API_KEY_SECRET: z.string().optional(),
  HF_API_URL: z.string().url().default('https://api.higgsfield.ai'),
  /** local : fichiers sur le disque (développement). r2 : Cloudflare R2 (compatible S3). */
  STORAGE_DRIVER: z.enum(['local', 'r2']).default('local'),
  LOCAL_STORAGE_DIR: z.string().default('./storage'),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
});

export type Env = z.infer<typeof envSchema>;

const smtpSchema = envSchema.superRefine((env, ctx) => {
  const require = (
    when: boolean,
    condition: string,
    keys: readonly (keyof typeof env)[],
  ) => {
    if (!when) return;
    for (const key of keys) {
      if (!env[key]) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} est requis quand ${condition}`,
        });
      }
    }
  };
  require(env.GENERATION_PROVIDER ===
    'higgsfield', 'GENERATION_PROVIDER=higgsfield', [
    'HF_API_KEY_ID',
    'HF_API_KEY_SECRET',
  ]);
  require(env.STORAGE_DRIVER === 'r2', 'STORAGE_DRIVER=r2', [
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET_NAME',
  ]);
  require(env.EMAIL_PROVIDER === 'smtp', 'EMAIL_PROVIDER=smtp', [
    'SMTP_HOST',
    'SMTP_USER',
    'SMTP_PASSWORD',
  ]);
  if (env.EMAIL_PROVIDER !== 'smtp') return;
  if (
    env.NODE_ENV === 'production' &&
    env.SMTP_SECURE === 'false' &&
    env.SMTP_PORT === 25
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['SMTP_PORT'],
      message:
        'Le port 25 (sans chiffrement) est refusé en production : utilisez 587 (STARTTLS) ou 465 (SMTP_SECURE=true)',
    });
  }
});

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = smtpSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Configuration invalide :\n${issues}`);
  }
  return parsed.data;
}
