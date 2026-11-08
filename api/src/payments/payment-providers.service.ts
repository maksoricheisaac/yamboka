import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { MockPaymentProvider } from './mock-payment.provider';
import { PaymentProvider } from './payment-provider';
import { SaspayPaymentProvider } from './saspay/saspay.provider';

/**
 * Résout le fournisseur de paiement selon le pays (cahier des charges §6.4) : ouvrir un nouveau pays revient à
 * ajouter une implémentation ici, sans toucher au registre de crédits ni aux générations.
 * Tout pays de la configuration est servi par le fournisseur choisi dans PAYMENT_PROVIDER : `mock` (simulé) ou `saspay` (paiements réels).
 */
@Injectable()
export class PaymentProviders {
  constructor(
    private readonly mock: MockPaymentProvider,
    private readonly saspay: SaspayPaymentProvider,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Le pays a déjà été validé (ouvert dans le catalogue) par l’appelant : le fournisseur ne dépend que de PAYMENT_PROVIDER. */
  forCountry(): PaymentProvider {
    return this.config.get('PAYMENT_PROVIDER', { infer: true }) === 'saspay'
      ? this.saspay
      : this.mock;
  }

  /**
   * Fournisseur par son nom stocké (Payment.gateway), pour vérifier un paiement existant : indépendant de
   * PAYMENT_PROVIDER, car un paiement déjà créé doit toujours être vérifié chez celui qui l'a reçu.
   */
  byName(name: string): PaymentProvider {
    if (name === this.mock.name) return this.mock;
    if (name === this.saspay.name) return this.saspay;
    throw new ServiceUnavailableException({
      code: 'PROVIDER_UNKNOWN',
      message: 'Fournisseur de paiement inconnu.',
    });
  }
}
