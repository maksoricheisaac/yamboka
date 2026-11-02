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
