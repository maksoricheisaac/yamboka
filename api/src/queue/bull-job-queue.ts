import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { JobQueue, QUEUE_PAYMENTS } from './job-queue';

@Injectable()
export class BullJobQueue extends JobQueue {
  readonly enabled = true;

  constructor(@InjectQueue(QUEUE_PAYMENTS) private readonly payments: Queue) {
    super();
  }

  async enqueueVerifyPayment(paymentId: string): Promise<void> {
    await this.payments.add(
      'verify-payment',
      { paymentId },
      {
        // Plusieurs callbacks pour le même paiement ne créent qu'une tâche tant qu'elle n'est pas terminée.
        jobId: `verify-${paymentId}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 24 * 3600 },
      },
    );
  }
}
