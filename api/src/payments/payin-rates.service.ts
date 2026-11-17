import { Injectable } from '@nestjs/common';
import type { FeeTier } from '../billing/fees';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentProviders } from './payment-providers.service';

/**
 * Tarif d'encaissement applicable à un (pays, réseau). Extrait de PaymentsService parce que la tarification
 * dérivée en a besoin pour chiffrer le net réellement reçu, et qu'un module de paiement complet importé par
 * la tarification — qui est elle-même lue par les offres de paiement — ferait un cycle de modules.
 *
 * Source : surcharge administrateur active si elle existe, sinon la grille du compte chez le fournisseur
 * (GET /pricing/my-rates/, qui fait foi). null quand le fournisseur ne facture rien (simulé).
 */
@Injectable()
export class PayinRatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: PaymentProviders,
  ) {}

  async resolve(
    countryIso: string,
    network: string,
  ): Promise<{ tiers: FeeTier[]; source: 'override' | 'provider' } | null> {
    const override = await this.prisma.feeRateOverride.findFirst({
      where: { country: countryIso, network, active: true },
    });
    if (override) {
      return {
        source: 'override',
        tiers: [
          {
            minAmount: 0,
            maxAmount: null,
            percent: override.percent.toString(),
            fixed: override.fixed.toString(),
            floorAmount: override.floorAmount?.toString() ?? null,
            capAmount: override.capAmount?.toString() ?? null,
            feeChargeMode: 'ADD_ON',
          },
        ],
      };
    }
    const provider = this.providers.forCountry();
    if (!provider.chargesFees) return null;
    const tiers = await provider.getPayinTiers(countryIso, network);
    return tiers ? { source: 'provider', tiers } : null;
  }
}
