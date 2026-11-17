import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { ProviderLedgerService } from './provider-ledger.service';

/**
 * Comptabilité du solde prépayé du fournisseur de génération (dollars). Séparée des crédits client : les deux
 * journaux se répondent (un crédit vendu engage des dollars) mais ne se mélangent jamais.
 */
@Module({
  imports: [SettingsModule],
  providers: [ProviderLedgerService],
  exports: [ProviderLedgerService],
})
export class ProviderBalanceModule {}
