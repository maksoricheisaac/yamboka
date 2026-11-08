import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { MockPaymentProvider } from './mock-payment.provider';
import { PaymentOffersService } from './payment-offers.service';
import { PaymentProviders } from './payment-providers.service';
import { PaymentsController } from './payments.controller';
import { PricingController } from './pricing.controller';
import { PaymentsService } from './payments.service';
import { SaspayPaymentProvider } from './saspay/saspay.provider';
import { WebhooksController } from './webhooks.controller';

@Module({
  controllers: [PaymentsController, PricingController, WebhooksController],
  providers: [
    MockPaymentProvider,
    {
      provide: SaspayPaymentProvider,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new SaspayPaymentProvider(config),
    },
    PaymentProviders,
    PaymentOffersService,
    PaymentsService,
  ],
  exports: [PaymentsService, PaymentOffersService],
})
export class PaymentsModule {}
