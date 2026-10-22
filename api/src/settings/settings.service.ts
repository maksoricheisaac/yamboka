import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Valeurs par défaut identiques au seed ; les valeurs en base (modifiables dans l'admin) priment. */
export const SETTING_DEFAULTS = {
  welcomeCredits: 4,
  welcomeExpiryDays: 30,
  purchasedCreditsExpiryMonths: 12,
  maintenanceMode: false,
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
    return row.value as (typeof SETTING_DEFAULTS)[K];
  }
}
