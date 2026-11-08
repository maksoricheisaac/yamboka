import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { PaymentsModule } from '../payments/payments.module';
import { AdminController } from './admin.controller';
import { AdminCountriesController } from './admin-countries.controller';
import { AdminCountriesService } from './admin-countries.service';
import { AdminOfferService } from './admin-offer.service';
import { AdminOpsService } from './admin-ops.service';
import { AdminUsersService } from './admin-users.service';
import { PublicSiteService } from './public-site.service';

@Module({
  imports: [CatalogModule, PaymentsModule],
  controllers: [AdminController, AdminCountriesController],
  providers: [
    AdminUsersService,
    AdminOfferService,
    AdminOpsService,
    AdminCountriesService,
    PublicSiteService,
  ],
})
export class AdminModule {}
