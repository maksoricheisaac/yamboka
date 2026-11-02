import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import {
  Injectable,
  Logger,
  Module,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { CreationsModule } from '../creations/creations.module';
import { CreationsService } from '../creations/creations.service';
import { CreditsService } from '../credits/credits.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsModule } from '../payments/payments.module';
import { PaymentsService } from '../payments/payments.service';
import {
  QUEUE_CREDITS,
  QUEUE_GENERATIONS,
  QUEUE_PAYMENTS,
} from '../queue/job-queue';

@Processor(QUEUE_PAYMENTS)
export class PaymentsProcessor extends WorkerHost {
  constructor(private readonly payments: PaymentsService) {
    super();
  }

  async process(job: Job<{ paymentId?: string }>): Promise<void> {
    if (job.name === 'verify-payment' && job.data.paymentId) {
      await this.payments.verify(job.data.paymentId);
    } else if (job.name === 'reconcile-payments') {
      await this.payments.reconcile();
    }
  }
}

@Processor(QUEUE_CREDITS)
export class CreditsProcessor extends WorkerHost {
  private readonly logger = new Logger(CreditsProcessor.name);

  constructor(private readonly credits: CreditsService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === 'expire-credits') {
      const written = await this.credits.runExpiry();
      this.logger.log(`Expiration des crédits : ${written} mouvement(s)`);
    }
  }
}

@Processor(QUEUE_GENERATIONS)
export class GenerationsProcessor extends WorkerHost {
  constructor(
    private readonly creations: CreationsService,
    private readonly notifications: NotificationsService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === 'advance-generations') await this.creations.advanceAll();
    else if (job.name === 'flush-notification-emails')
      await this.notifications.flushPendingEmails();
  }
}

/** Planifie les tâches récurrentes (idempotent : relancer l'API ne les duplique pas). */
@Injectable()
export class JobScheduler implements OnApplicationBootstrap {
  constructor(
    @InjectQueue(QUEUE_PAYMENTS) private readonly payments: Queue,
    @InjectQueue(QUEUE_CREDITS) private readonly credits: Queue,
    @InjectQueue(QUEUE_GENERATIONS) private readonly generations: Queue,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // Rattrapage des paiements dont le callback aurait été perdu : toutes les 2 minutes.
    await this.payments.upsertJobScheduler(
      'reconcile-payments',
      { every: 120_000 },
      { name: 'reconcile-payments' },
    );
    // Suivi des créations en cours (finalisation ou remboursement) : toutes les 10 secondes.
    await this.generations.upsertJobScheduler(
      'advance-generations',
      { every: 10_000 },
      { name: 'advance-generations', opts: { removeOnComplete: true, removeOnFail: { age: 3600 } } },
    );
    // Reprise des e-mails de notification qui n'ont pas pu partir : chaque minute.
    await this.generations.upsertJobScheduler(
      'flush-notification-emails',
      { every: 60_000 },
      {
        name: 'flush-notification-emails',
        opts: { removeOnComplete: true, removeOnFail: { age: 3600 } },
      },
    );
    // Expiration des crédits : chaque nuit à 3 h, heure de Brazzaville.
    await this.credits.upsertJobScheduler(
      'expire-credits',
      { pattern: '0 3 * * *', tz: 'Africa/Brazzaville' },
      { name: 'expire-credits' },
    );
  }
}

/** Chargé uniquement quand la file est active (voir QueueModule). */
@Module({
  imports: [PaymentsModule, CreationsModule],
  providers: [
    PaymentsProcessor,
    CreditsProcessor,
    GenerationsProcessor,
    JobScheduler,
  ],
})
export class JobsModule {}
