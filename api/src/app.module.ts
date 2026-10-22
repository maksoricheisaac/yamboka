import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AdminModule } from './admin/admin.module';
import { AuthCoreModule } from './auth/auth-core.module';
import { AuthModule } from './auth/auth.module';
import { AuthGuard, OriginGuard, RolesGuard } from './auth/guards';
import { Env, validateEnv } from './config/env';
import { CreditsModule } from './credits/credits.module';
import { DevModule } from './dev/dev.module';
import { EmailModule } from './email/email.module';
import { HealthModule } from './health/health.module';
import { LegalModule } from './legal/legal.module';
import { PrismaModule } from './prisma/prisma.module';
import { SettingsModule } from './settings/settings.module';
import { UsersModule } from './users/users.module';

/** Désactive la limitation de débit en test, sauf si un test l'active explicitement (THROTTLE_TESTS=1). */
const skipThrottle = () =>
  process.env.NODE_ENV === 'test' && process.env.THROTTLE_TESTS !== '1';

const emailTracker = (req: Record<string, any>): Promise<string> => {
  const body = req.body as { email?: unknown } | undefined;
  const email =
    typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  return Promise.resolve(`${String(req.ip)}|${email}`);
};

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL', { infer: true }),
          // Aucune donnée sensible dans les journaux.
          redact: [
            'req.headers.cookie',
            'req.headers.authorization',
            'res.headers["set-cookie"]',
          ],
        },
      }),
    }),
    // « global » : par IP. « auth » : par couple IP + e-mail ; limites serrées posées sur les routes sensibles.
    ThrottlerModule.forRoot({
      skipIf: skipThrottle,
      errorMessage: 'Trop de tentatives. Réessayez dans quelques instants.',
      throttlers: [
        { name: 'global', ttl: 60_000, limit: 300 },
        { name: 'auth', ttl: 60_000, limit: 1000, getTracker: emailTracker },
      ],
    }),
    PrismaModule,
    SettingsModule,
    CreditsModule,
    LegalModule,
    EmailModule,
    AuthCoreModule,
    UsersModule,
    AuthModule,
    AdminModule,
    HealthModule,
    ...(process.env.NODE_ENV === 'production' ? [] : [DevModule]),
  ],
  providers: [
    // Ordre d'exécution : limitation de débit, CSRF, authentification, rôles.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
