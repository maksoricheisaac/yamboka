import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { PricingView } from '@yamboka/shared';
import { Public } from '../common/decorators';
import { PaymentOffersService } from './payment-offers.service';

@ApiTags('catalog')
@Controller('catalog')
export class PricingController {
  constructor(private readonly offers: PaymentOffersService) {}

  @Public()
  @Get('pricing')
  @ApiOperation({
    summary:
      'Tarification publique : crédits par seconde de vidéo, pays ouverts, moyens de paiement, packs et prix du crédit. Source unique du site et de l’espace client.',
  })
  pricing(): Promise<PricingView> {
    return this.offers.pricing();
  }
}
