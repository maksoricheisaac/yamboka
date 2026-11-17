import { Module } from '@nestjs/common';
import { CreditPricingModule } from '../pricing/credit-pricing.module';
import { PricingModule } from '../pricing/pricing.module';
import { ProviderBalanceModule } from '../provider-balance/provider-balance.module';
import { CreationsController } from './creations.controller';
import { CreationsService } from './creations.service';

@Module({
  imports: [PricingModule, CreditPricingModule, ProviderBalanceModule],
  controllers: [CreationsController],
  providers: [CreationsService],
  exports: [CreationsService],
})
export class CreationsModule {}
