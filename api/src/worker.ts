import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { areProcessorsEnabled, isQueueEnabled } from './queue/queue.module';

/**
 * Point d'entrée d'un futur conteneur worker (NON déployé aujourd'hui : l'API porte ses propres processeurs).
 * Même image que l'API, commande `node dist/worker`, sans écoute HTTP ni domaine public. Il charge le même
 * AppModule : mêmes processeurs, mêmes services, même base. Prérequis, pour ne pas créer de trou ni de doublon :
 *   - worker : RUN_PROCESSORS=true (défaut) ;  api : RUN_PROCESSORS=false, déployés ensemble.
 * Refuse de démarrer sans consommateur possible plutôt que de tourner à vide.
 */
async function bootstrap(): Promise<void> {
  if (!isQueueEnabled() || !areProcessorsEnabled()) {
    throw new Error(
      'Worker inutile : la file doit être active (QUEUE_ENABLED≠false) et RUN_PROCESSORS≠false.',
    );
  }
  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
}
void bootstrap();
