import { Module } from '@nestjs/common';
import { PricingModule } from '../pricing/pricing.module';
import { ProviderBalanceModule } from '../provider-balance/provider-balance.module';
import { CreationsController } from './creations.controller';
import { CreationsService } from './creations.service';

@Module({
  imports: [PricingModule, ProviderBalanceModule],
  controllers: [CreationsController],
  providers: [CreationsService],
  exports: [CreationsService],
})
export class CreationsModule {}
