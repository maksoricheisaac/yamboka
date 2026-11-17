import { Module } from '@nestjs/common';
import { PricingService } from './pricing.service';

/**
 * Paramètres et tarifs versionnés. Aucune dépendance : c'est une couche de lecture et d'écriture de versions,
 * que les autres modules (création, administration) interrogent à la date qui les concerne.
 */
@Module({ providers: [PricingService], exports: [PricingService] })
export class PricingModule {}
