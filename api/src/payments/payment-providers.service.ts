import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { MockPaymentProvider } from './mock-payment.provider';
import { PaymentProvider } from './payment-provider';

/**
 * Résout le fournisseur de paiement selon le pays (cahier des charges §6.4) : ouvrir un nouveau pays revient à
 * ajouter une implémentation ici, sans toucher au registre de crédits ni aux générations.
 * Phase 1 : le pays CG est servi par le fournisseur simulé. OpenPay sera ajouté après réception de sa
 * documentation officielle ; rien n'en est codé aujourd'hui.
 */
@Injectable()
export class PaymentProviders {
  constructor(private readonly mock: MockPaymentProvider) {}

  forCountry(country: string): PaymentProvider {
    switch (country) {
      case 'CG':
        return this.mock;
      default:
        throw new ServiceUnavailableException({
          code: 'COUNTRY_NOT_SUPPORTED',
          message: 'Le paiement n’est pas encore disponible dans votre pays.',
        });
    }
  }

  /** Fournisseur par son nom stocké (Payment.gateway), pour vérifier un paiement existant. */
  byName(name: string): PaymentProvider {
    if (name === this.mock.name) return this.mock;
    throw new ServiceUnavailableException({
      code: 'PROVIDER_UNKNOWN',
      message: 'Fournisseur de paiement inconnu.',
    });
  }
}
