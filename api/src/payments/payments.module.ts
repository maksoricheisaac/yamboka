import { Module } from '@nestjs/common';
import { MockPaymentProvider } from './mock-payment.provider';
import { PaymentProviders } from './payment-providers.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { WebhooksController } from './webhooks.controller';

@Module({
  controllers: [PaymentsController, WebhooksController],
  providers: [MockPaymentProvider, PaymentProviders, PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
