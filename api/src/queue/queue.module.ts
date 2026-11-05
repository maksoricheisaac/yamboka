import { BullModule } from '@nestjs/bullmq';
import { DynamicModule, Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { BullJobQueue } from './bull-job-queue';
import { InlineJobQueue } from './inline-job-queue';
import {
  JobQueue,
  QUEUE_CREDITS,
  QUEUE_GENERATIONS,
  QUEUE_PAYMENTS,
} from './job-queue';
import { redisConnection } from './redis-connection';

/** La file est active sauf en test, où l'on évite de dépendre de Redis (QUEUE_ENABLED=true pour la forcer). */
export function isQueueEnabled(): boolean {
  const flag = process.env.QUEUE_ENABLED;
  if (flag !== undefined) return flag === 'true';
  return process.env.NODE_ENV !== 'test';
}

/**
 * Cette instance exécute-t-elle les tâches (processeurs + planificateur) ? Oui par défaut : l'API actuelle les porte.
 * RUN_PROCESSORS=false : l'instance reste PRODUCTRICE (elle met en file) sans consommer ; à réserver au jour où un
 * conteneur worker (RUN_PROCESSORS=true, `node dist/worker`) tourne à côté. Sans consommateur, rien n'est exécuté.
 * Deux instances à true ne dupliquent pas les tâches : BullMQ n'en remet chacune qu'à un seul consommateur.
 */
export function areProcessorsEnabled(): boolean {
  return process.env.RUN_PROCESSORS !== 'false';
}

@Global()
@Module({})
export class QueueModule {
  static register(): DynamicModule {
    if (!isQueueEnabled()) {
      return {
        module: QueueModule,
        providers: [{ provide: JobQueue, useClass: InlineJobQueue }],
        exports: [JobQueue],
      };
    }
    return {
      module: QueueModule,
      imports: [
        BullModule.forRootAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (config: ConfigService<Env, true>) => ({
            connection: redisConnection(
              config.get('REDIS_URL', { infer: true }),
            ),
          }),
        }),
        BullModule.registerQueue(
          { name: QUEUE_PAYMENTS },
          { name: QUEUE_CREDITS },
          { name: QUEUE_GENERATIONS },
        ),
      ],
      providers: [{ provide: JobQueue, useClass: BullJobQueue }],
      exports: [JobQueue, BullModule],
    };
  }
}
