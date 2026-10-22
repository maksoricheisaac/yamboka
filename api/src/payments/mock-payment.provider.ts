import { Injectable } from '@nestjs/common';
import type { SimulationOutcome } from '@yamboka/shared';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  InitiatePaymentRequest,
  InitiatePaymentResult,
  PaymentProvider,
  PaymentStatusResult,
  ProviderInvalidResponseError,
  ProviderStatus,
  ProviderUnavailableError,
} from './payment-provider';

/** Numéro qui simule un fournisseur indisponible dès l'initiation (parcours d'erreur). */
export const MOCK_UNAVAILABLE_PHONE = '242099999999';

/**
 * Faux fournisseur de paiement (PAYMENT_PROVIDER=mock) : simule MTN / Airtel sans aucun transfert d'argent.
 * Son état « côté opérateur » est stocké en base (comme le serait celui d'un vrai fournisseur) pour survivre
 * à un redémarrage. Scénarios : succès, échec, annulation, callback sans changement d'état (falsifié),
 * fournisseur en erreur, réponse invalide ; les callbacks dupliqués sont gérés par PaymentsService.simulate.
 */
@Injectable()
export class MockPaymentProvider extends PaymentProvider {
  readonly name = 'mock';

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async initiate(
    request: InitiatePaymentRequest,
  ): Promise<InitiatePaymentResult> {
    if (request.phone === MOCK_UNAVAILABLE_PHONE) {
      throw new ProviderUnavailableError('Fournisseur simulé indisponible');
    }
    const reference = `MOCK-${randomUUID()}`;
    await this.prisma.mockPaymentTransaction.create({
      data: {
        reference,
        amount: request.amount,
        currency: request.currency,
        phone: request.phone,
        operator: request.operator,
      },
    });
    return { reference, status: 'pending' };
  }

  async getStatus(reference: string): Promise<PaymentStatusResult> {
    const txn = await this.prisma.mockPaymentTransaction.findUnique({
      where: { reference },
    });
    if (!txn)
      throw new ProviderInvalidResponseError(
        'Transaction inconnue du fournisseur simulé',
      );
    if (txn.failureMode === 'provider_error') {
      throw new ProviderUnavailableError('Fournisseur simulé en erreur');
    }
    if (txn.failureMode === 'invalid_response') {
      throw new ProviderInvalidResponseError('Réponse simulée invalide');
    }
    return {
      status: txn.status as ProviderStatus,
      amount: txn.amount,
      currency: txn.currency,
    };
  }

  /** Change l'état côté opérateur, comme le ferait le client en confirmant (ou non) sur son téléphone. */
  async simulate(reference: string, outcome: SimulationOutcome): Promise<void> {
    const data =
      outcome === 'success'
        ? { status: 'success', failureMode: null }
        : outcome === 'failed'
          ? { status: 'failed', failureMode: null }
          : outcome === 'cancelled'
            ? { status: 'cancelled', failureMode: null }
            : outcome === 'provider_error' || outcome === 'invalid_response'
              ? { failureMode: outcome }
              : {}; // forged_callback : l'état réel ne change pas
    if (Object.keys(data).length === 0) return;
    await this.prisma.mockPaymentTransaction.updateMany({
      // Un paiement déjà conclu ne peut plus changer d'issue.
      where: {
        reference,
        ...(outcome === 'provider_error' || outcome === 'invalid_response'
          ? {}
          : { status: 'pending' }),
      },
      data,
    });
  }
}
