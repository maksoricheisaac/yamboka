import { z } from 'zod';

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
  API_URL: z.string().url().default('http://localhost:4000'),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  /** Domaine du cookie de session (ex. .yamboka.com) ; vide en local. */
  COOKIE_DOMAIN: z.string().optional(),
  /** Nombre de proxys de confiance devant l'API (pour l'adresse IP réelle). */
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().url().optional(),
  EMAIL_FROM: z.string().default('Yamboka <no-reply@yamboka.local>'),
  // Phase 1 : fournisseurs simulés uniquement.
  PAYMENT_PROVIDER: z.enum(['mock']).default('mock'),
  GENERATION_PROVIDER: z.enum(['mock']).default('mock'),
  EMAIL_PROVIDER: z.enum(['console']).default('console'),
  STORAGE_DRIVER: z.enum(['local']).default('local'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Configuration invalide :\n${issues}`);
  }
  return parsed.data;
}
