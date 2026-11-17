import { Module } from '@nestjs/common';
import { PayinRatesModule } from './payin-rates.module';
import { CountryCatalogService } from './catalog/country-catalog.service';
import { PaymentOffersService } from './payment-offers.service';
import { PaymentsController } from './payments.controller';
import { PricingController } from './pricing.controller';
import { PaymentsService } from './payments.service';
import { WebhooksController } from './webhooks.controller';

@Module({
  imports: [PayinRatesModule],
  controllers: [PaymentsController, PricingController, WebhooksController],
  providers: [CountryCatalogService, PaymentOffersService, PaymentsService],
  exports: [PaymentsService, PaymentOffersService, CountryCatalogService],
})
export class PaymentsModule {}
