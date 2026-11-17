import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { PaymentsModule } from '../payments/payments.module';
import { PricingModule } from '../pricing/pricing.module';
import { ProviderBalanceModule } from '../provider-balance/provider-balance.module';
import { AdminController } from './admin.controller';
import { AdminCountriesController } from './admin-countries.controller';
import { AdminCountriesService } from './admin-countries.service';
import { AdminOfferService } from './admin-offer.service';
import { AdminOpsService } from './admin-ops.service';
import { AdminSimulatorService } from './admin-simulator.service';
import { AdminUsersService } from './admin-users.service';
import { PublicSiteService } from './public-site.service';

@Module({
  imports: [
    CatalogModule,
    PaymentsModule,
    PricingModule,
    ProviderBalanceModule,
  ],
  controllers: [AdminController, AdminCountriesController],
  providers: [
    AdminUsersService,
    AdminOfferService,
    AdminOpsService,
    AdminSimulatorService,
    AdminCountriesService,
    PublicSiteService,
  ],
})
export class AdminModule {}
