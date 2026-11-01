import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { PaymentsModule } from '../payments/payments.module';
import { AdminController } from './admin.controller';
import { AdminOfferService } from './admin-offer.service';
import { AdminOpsService } from './admin-ops.service';
import { AdminUsersService } from './admin-users.service';
import { PublicSiteService } from './public-site.service';

@Module({
  imports: [CatalogModule, PaymentsModule],
  controllers: [AdminController],
  providers: [
    AdminUsersService,
    AdminOfferService,
    AdminOpsService,
    PublicSiteService,
  ],
})
export class AdminModule {}
