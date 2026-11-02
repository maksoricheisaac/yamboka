import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { MockPaymentProvider } from './mock-payment.provider';
import { PaymentProviders } from './payment-providers.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { SaspayPaymentProvider } from './saspay/saspay.provider';
import { WebhooksController } from './webhooks.controller';

@Module({
  controllers: [PaymentsController, WebhooksController],
  providers: [
    MockPaymentProvider,
    {
      provide: SaspayPaymentProvider,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new SaspayPaymentProvider(config),
    },
    PaymentProviders,
    PaymentsService,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
