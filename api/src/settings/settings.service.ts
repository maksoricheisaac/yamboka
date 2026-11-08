import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Valeurs par défaut identiques au seed ; les valeurs en base (modifiables dans l'admin) priment. */
export const SETTING_DEFAULTS = {
  purchasedCreditsExpiryMonths: 12,
  maintenanceMode: false,
  usdToXafRate: 620,
  fxFeePercent: 0,
  openpayCommissionPercent: 5,
  regenOverheadPercent: 0,
  minMarginPercent: 15,
  /** Perte du circuit de retrait et de change (SasPay → MTN, carte → dollars), en % de l'argent reçu. */
  circuitLossPercent: 9,
  /** Coût fournisseur d'un crédit, en FCFA : 1 crédit = 2,5 FCFA de coût Higgsfield. Le taux FCFA/$ est usdToXafRate. */
  hfCostFcfaPerCredit: 2.5,
  firstPurchaseBonusEnabled: true,
  /** Bonus de premier achat par défaut (%), remplacé par CreditPack.firstPurchaseBonusPercent quand il est défini. */
  firstPurchaseBonusDefaultPercent: 20,
  /**
   * Prix d'un crédit en FCFA (XAF et XOF, à parité) : sert à afficher « ≈ 1 760 FCFA » ET à facturer l'achat de crédits
   * à la quantité. À tenir aligné sur le pack d'entrée (prix ÷ crédits) : 10 avec le Starter du seed (5 000 ÷ 500).
   */
  creditValueFcfa: 10,
  /** Pays ouverts à l'achat de crédits (codes ISO séparés par des virgules, parmi ceux de payment-countries.ts). */
  paymentEnabledCountries: 'CG,CM',
  /** Garde-fou de génération : au-delà de ce coût (crédits) OU de cette part du solde (%), une confirmation est demandée. */
  generationConfirmCredits: 100,
  generationConfirmBalancePercent: 50,
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
