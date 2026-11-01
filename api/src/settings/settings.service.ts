import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Valeurs par défaut identiques au seed ; les valeurs en base (modifiables dans l'admin) priment. */
export const SETTING_DEFAULTS = {
  purchasedCreditsExpiryMonths: 12,
  maintenanceMode: false,
  usdToXafRate: 575,
  fxFeePercent: 6,
  openpayCommissionPercent: 5,
  regenOverheadPercent: 15,
  minMarginPercent: 15,
  /** Perte du circuit de retrait et de change (SasPay → MTN, carte → dollars), en % de l'argent reçu. */
  circuitLossPercent: 9,
  /** Coût fournisseur d'un crédit, en FCFA : 1 crédit = 2,5 FCFA de coût Higgsfield. Le taux FCFA/$ est usdToXafRate. */
  hfCostFcfaPerCredit: 2.5,
  firstPurchaseBonusEnabled: true,
  /** Bonus de premier achat par défaut (%), remplacé par CreditPack.firstPurchaseBonusPercent quand il est défini. */
  firstPurchaseBonusDefaultPercent: 20,
  /** Confirmation de connexion par code e-mail : jamais, administrateurs seulement, ou tous les comptes. */
  loginOtpMode: 'off' as 'off' | 'admin' | 'all',
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get<K extends SettingKey>(
    key: K,
  ): Promise<(typeof SETTING_DEFAULTS)[K]> {
    const row = await this.prisma.setting.findUnique({ where: { key } });
    const fallback = SETTING_DEFAULTS[key];
    if (!row || typeof row.value !== typeof fallback) return fallback;
    if (
      key === 'loginOtpMode' &&
      !['off', 'admin', 'all'].includes(row.value as string)
    )
      return fallback;
    return row.value as (typeof SETTING_DEFAULTS)[K];
  }
}
