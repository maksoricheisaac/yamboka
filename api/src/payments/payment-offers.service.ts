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
import {
  PAYMENT_COUNTRIES,
  PAYMENT_LIMITS,
  findCountry,
  offeredNetworks,
  type CountryConfig,
} from './payment-countries';

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
  ) {}

  /** Pays ouverts à l'achat, dans l'ordre des réglages. */
  async enabledCountries(): Promise<CountryConfig[]> {
    const raw = await this.settings.get('paymentEnabledCountries');
    const isos = raw
      .split(',')
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean);
    const out: CountryConfig[] = [];
    for (const iso of isos) {
      const c = findCountry(iso);
      if (c && !out.includes(c)) out.push(c);
    }
    return out;
  }

  /** Prix d'un crédit dans la devise du pays, ou null si la devise n'est pas ouverte à la vente. */
  async unitPrice(currency: string): Promise<number | null> {
    if (isCfa(currency)) return this.settings.get('creditValueFcfa');
    const row = await this.prisma.currencySetting.findUnique({
      where: { currency },
    });
    return row?.active && row.creditValue > 0 ? row.creditValue : null;
  }

  /** Règles de l'achat à la quantité pour un pays, ou null s'il n'est pas disponible. */
  async customRules(
    country: CountryConfig,
  ): Promise<CustomPurchaseRules | null> {
    const limits = PAYMENT_LIMITS[country.currency];
    const unit = await this.unitPrice(country.currency);
    if (!limits || !unit || unit <= 0) return null;
    const { minCredits, maxCredits } = customBounds(unit, limits);
    if (maxCredits < minCredits) return null;
    return { unitPrice: unit, minCredits, maxCredits };
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
    const [enabled, rates] = await Promise.all([
      this.enabledCountries(),
      loadVideoRates(this.prisma),
    ]);
    const out: PaymentCountryView[] = [];
    for (const c of enabled) {
      const methods = offeredNetworks(c).map((n) => ({
        code: n.code,
        name: n.name,
      }));
      if (methods.length === 0) continue;
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
    for (const c of PAYMENT_COUNTRIES) {
      const group = all.filter((p) => p.country === c.iso);
      if (group.length > 0) return group;
    }
    return [];
  }

  /** Tarification publique complète. */
  async pricing(): Promise<PricingView> {
    const [rates, countries] = await Promise.all([
      loadVideoRates(this.prisma),
      this.countries(),
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
    };
  }
}
