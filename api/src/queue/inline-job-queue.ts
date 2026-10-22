import { Injectable } from '@nestjs/common';
import { JobQueue } from './job-queue';

/** Sans Redis (tests) : pas de file ; PaymentsService vérifie directement. */
@Injectable()
export class InlineJobQueue extends JobQueue {
  readonly enabled = false;

  enqueueVerifyPayment(): Promise<void> {
    return Promise.resolve();
  }
}
