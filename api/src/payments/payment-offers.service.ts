import { Injectable } from '@nestjs/common';
import type {
  CustomPurchaseRules,
  PaymentCountryView,
  PricingView,
} from '@yamboka/shared';
import {
  RESOLUTION_LABELS,
  VIDEO_DURATION,
  VIDEO_RESOLUTIONS,
} from '@yamboka/shared';
import { customBounds } from '../billing/custom-purchase';
import { loadVideoRates, toPackView } from '../catalog/pack-view';
import type { CreditPack } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { CountryCatalogService } from './catalog/country-catalog.service';
import { PAYMENT_LIMITS, type CountryConfig } from './payment-countries';

/**
 * Devises vendues au même prix que leur devise de référence : le franc CFA d'Afrique de l'Ouest (XOF) est à
 * parité fixe avec celui d'Afrique centrale (XAF). Aucun taux de change n'est inventé : pour toute autre devise,
 * il faut des packs et un prix du crédit propres, saisis par l'administrateur.
 */
const PRICE_LIST_CURRENCY: Readonly<Record<string, string>> = { XOF: 'XAF' };
const CFA_CURRENCIES = ['XAF', 'XOF'];

export function priceListCurrency(currency: string): string {
  return PRICE_LIST_CURRENCY[currency] ?? currency;
}

export function isCfa(currency: string): boolean {
  return CFA_CURRENCIES.includes(currency);
}

/**
 * Offre d'achat de crédits par pays : moyens de paiement, packs et prix du crédit. Source unique, lue par la page
 * Crédits, la page Tarifs publique et la création d'un paiement (qui revérifie TOUT : rien ne vient du navigateur).
 */
@Injectable()
export class PaymentOffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly catalog: CountryCatalogService,
  ) {}

  /** Pays ouverts à l'achat (statut ACTIVE en base, avec au moins un moyen ACTIVE utilisable). */
  async enabledCountries(): Promise<CountryConfig[]> {
    return this.catalog.openCountries();
  }

  /** Prix d'un crédit dans la devise du pays, ou null si la devise n'est pas ouverte à la vente. */
  async unitPrice(currency: string): Promise<number | null> {
    if (isCfa(currency)) return this.settings.get('creditValueFcfa');
    const row = await this.prisma.currencySetting.findUnique({
      where: { currency },
    });
    return row?.active && row.creditValue > 0 ? row.creditValue : null;
  }

  /** Bornes d'un paiement dans une devise : table par défaut (franc CFA), sinon bornes saisies dans l'administration. */
  async limitsFor(
    currency: string,
  ): Promise<{ min: number; max: number } | null> {
    const fixed = PAYMENT_LIMITS[currency];
    if (fixed) return fixed;
    const row = await this.prisma.currencySetting.findUnique({
      where: { currency },
    });
    return row?.active && row.minAmount && row.maxAmount
      ? { min: row.minAmount, max: row.maxAmount }
      : null;
  }

  /** Règles de l'achat à la quantité pour un pays, ou null s'il n'est pas disponible. */
  async customRules(
    country: CountryConfig,
  ): Promise<CustomPurchaseRules | null> {
    const limits = await this.limitsFor(country.currency);
    const unit = await this.unitPrice(country.currency);
    if (!limits || !unit || unit <= 0) return null;
    const { minCredits, maxCredits } = customBounds(unit, limits);
    if (maxCredits < minCredits) return null;
    return { unitPrice: unit, minCredits, maxCredits };
  }

  /**
   * Une devise est vendable si l'on peut y facturer sans inventer de taux de change : au moins un pack actif dans
   * sa liste de prix, ou un achat libre complet (prix du crédit + bornes). Sinon le pays reste fermé à l'achat.
   */
  async isSellable(currency: string): Promise<boolean> {
    const packs = await this.prisma.creditPack.count({
      where: { active: true, currency: priceListCurrency(currency) },
    });
    if (packs > 0) return true;
    const [limits, unit] = await Promise.all([
      this.limitsFor(currency),
      this.unitPrice(currency),
    ]);
    return !!limits && !!unit && unit > 0;
  }

  /**
   * Pack achetable dans ce pays : actif et vendu dans la devise du pays (ou celle de sa liste de prix).
   * Un pack n'est pas rattaché à un seul pays : la devise fait foi.
   */
  async findPack(
    country: CountryConfig,
    packId: string,
  ): Promise<CreditPack | null> {
    return this.prisma.creditPack.findFirst({
      where: {
        id: packId,
        active: true,
        currency: priceListCurrency(country.currency),
      },
    });
  }

  async countries(): Promise<PaymentCountryView[]> {
    const [enabled, rates, soon] = await Promise.all([
      this.enabledCountries(),
      loadVideoRates(this.prisma),
      this.catalog.comingSoon(),
    ]);
    const out: PaymentCountryView[] = [];
    for (const c of enabled) {
      const methods = [
        ...c.networks.map((n) => ({
          code: n.code,
          name: n.name,
          status: 'ACTIVE' as const,
        })),
        ...(soon.methodsByCountry.get(c.iso) ?? []).map((m) => ({
          ...m,
          status: 'COMING_SOON' as const,
        })),
      ];
      if (c.networks.length === 0) continue;
      const priceCurrency = priceListCurrency(c.currency);
      const packs = await this.packsFor(c, priceCurrency);
      const custom = await this.customRules(c);
      if (packs.length === 0 && !custom) continue;
      out.push({
        iso: c.iso,
        name: c.name,
        currency: c.currency,
        dialCode: `+${c.dial}`,
        methods,
        packs: packs.map((p) => toPackView(p, rates, c.currency)),
        custom,
      });
    }
    return out;
  }

  /** Packs d'un pays : les siens s'il en a, sinon ceux de la première configuration de pays qui vend dans la même devise. */
  private async packsFor(
    country: CountryConfig,
    priceCurrency: string,
  ): Promise<CreditPack[]> {
    const all = await this.prisma.creditPack.findMany({
      where: { active: true, currency: priceCurrency },
      orderBy: { sortOrder: 'asc' },
    });
    const own = all.filter((p) => p.country === country.iso);
    if (own.length > 0) return own;
    // Sinon, la liste de prix de la première série de packs vendue dans cette devise.
    const first = all[0];
    return first ? all.filter((p) => p.country === first.country) : [];
  }

  /** Tarification publique complète. */
  async pricing(): Promise<PricingView> {
    const [rates, countries, soon] = await Promise.all([
      loadVideoRates(this.prisma),
      this.countries(),
      this.catalog.comingSoon(),
    ]);
    return {
      rates,
      duration: { ...VIDEO_DURATION },
      resolutions: VIDEO_RESOLUTIONS.map((id) => ({
        id,
        label: RESOLUTION_LABELS[id],
        creditsPerSecond: rates[id],
      })),
      countries,
      upcomingCountries: soon.countries,
    };
  }
}
