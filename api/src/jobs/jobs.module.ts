import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import {
  Injectable,
  Logger,
  Module,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { CreditsService } from '../credits/credits.service';
import { PaymentsModule } from '../payments/payments.module';
import { PaymentsService } from '../payments/payments.service';
import { QUEUE_CREDITS, QUEUE_PAYMENTS } from '../queue/job-queue';

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

/** Planifie les tâches récurrentes (idempotent : relancer l'API ne les duplique pas). */
@Injectable()
export class JobScheduler implements OnApplicationBootstrap {
  constructor(
    @InjectQueue(QUEUE_PAYMENTS) private readonly payments: Queue,
    @InjectQueue(QUEUE_CREDITS) private readonly credits: Queue,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // Rattrapage des paiements dont le callback aurait été perdu : toutes les 2 minutes.
    await this.payments.upsertJobScheduler(
      'reconcile-payments',
      { every: 120_000 },
      { name: 'reconcile-payments' },
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
  imports: [PaymentsModule],
  providers: [PaymentsProcessor, CreditsProcessor, JobScheduler],
})
export class JobsModule {}
