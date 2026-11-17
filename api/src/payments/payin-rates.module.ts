import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { MockPaymentProvider } from './mock-payment.provider';
import { PayinRatesService } from './payin-rates.service';
import { PaymentProviders } from './payment-providers.service';
import { SaspayPaymentProvider } from './saspay/saspay.provider';

/**
 * Socle des fournisseurs de paiement et des tarifs d'encaissement. Isolé de PaymentsModule pour que la
 * tarification dérivée puisse le lire sans importer tout le module de paiement (ce qui créerait un cycle).
 */
@Module({
  providers: [
    MockPaymentProvider,
    {
      provide: SaspayPaymentProvider,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new SaspayPaymentProvider(config),
    },
    PaymentProviders,
    PayinRatesService,
  ],
  exports: [
    MockPaymentProvider,
    SaspayPaymentProvider,
    PaymentProviders,
    PayinRatesService,
  ],
})
export class PayinRatesModule {}
