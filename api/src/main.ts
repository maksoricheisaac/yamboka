import type { Server } from 'node:http';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { configureApp, setupSwagger } from './configure-app';
import type { Env } from './config/env';

/**
 * Les proxys devant l'API (relais /api/* de Next, reverse proxy de déploiement) réutilisent des connexions
 * keep-alive. Node ferme les siennes après 5 s d'inactivité : si un proxy en réutilise une à cet instant précis,
 * il reçoit ECONNRESET et l'utilisateur voit une erreur 500 aléatoire, surtout sous charge. On garde donc les
 * connexions ouvertes plus longtemps que n'importe quel proxy, pour que ce soit toujours lui qui ferme en premier.
 */
export const KEEP_ALIVE_TIMEOUT_MS = 65_000;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  configureApp(app);
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  if (config.get('NODE_ENV', { infer: true }) !== 'production')
    setupSwagger(app);

  const server = app.getHttpServer() as Server;
  server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS;
  // Doit rester supérieur à keepAliveTimeout (consigne de Node).
  server.headersTimeout = KEEP_ALIVE_TIMEOUT_MS + 1_000;

  await app.listen(config.get('PORT', { infer: true }));
}
void bootstrap();
