import { Global, Module } from '@nestjs/common';
import { PayinRatesModule } from '../payments/payin-rates.module';
import { ProviderBalanceModule } from '../provider-balance/provider-balance.module';
import { SettingsModule } from '../settings/settings.module';
import { CreditPricingService } from './credit-pricing.service';
import { PricingModule } from './pricing.module';
import { VideoRatesService } from './video-rates.service';

/**
 * Tarification dérivée : le calcul qui transforme un coût fournisseur en crédits facturés. Séparé de
 * PricingModule (lecture et écriture des versions) parce qu'il a besoin des packs, des moyens de paiement
 * ouverts et du journal du solde fournisseur.
 *
 * Global : la tarification dérivée est lue par le parcours client, la page publique des tarifs et
 * l'administration. Elle n'importe que le socle des tarifs d'encaissement (PayinRatesModule), jamais
 * PaymentsModule : celui-ci lit les tarifs dérivés, et les deux s'importeraient mutuellement.
 */
@Global()
@Module({
  imports: [
    PricingModule,
    PayinRatesModule,
    ProviderBalanceModule,
    SettingsModule,
  ],
  providers: [CreditPricingService, VideoRatesService],
  exports: [CreditPricingService, VideoRatesService, PricingModule],
})
export class CreditPricingModule {}
