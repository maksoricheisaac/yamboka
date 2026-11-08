import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AdminCountryDetail,
  AdminCountryRow,
  AdminMethodRow,
  CatalogStatus,
  CountryListQuery,
  CurrencyPricingInput,
  MethodListQuery,
  Page,
} from '@yamboka/shared';
import { buildPage, clampPage } from '@yamboka/shared';
import { AuditService } from '../audit/audit.service';
import type { Prisma } from '../generated/prisma/client';
import {
  activationBlocker,
  type CountryWithMethods,
} from '../payments/catalog/country-catalog.service';
import {
  isCfa,
  PaymentOffersService,
} from '../payments/payment-offers.service';
import { PrismaService } from '../prisma/prisma.service';

/** Administration du catalogue international : statuts des pays et des moyens, prix du crédit par devise. */
@Injectable()
export class AdminCountriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly offers: PaymentOffersService,
  ) {}

  // ───────────── Lecture ─────────────

  async listCountries(q: CountryListQuery): Promise<Page<AdminCountryRow>> {
    const where: Prisma.CountryWhereInput = {};
    if (q.status) where.status = q.status;
    if (q.q) {
      where.OR = [
        { name: { contains: q.q, mode: 'insensitive' } },
        { iso: { equals: q.q.toUpperCase() } },
        { currency: { equals: q.q.toUpperCase() } },
      ];
    }
    const total = await this.prisma.country.count({ where });
    const page = clampPage(q.page, total, q.pageSize);
    const rows = await this.prisma.country.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { iso: 'asc' }],
      skip: (page - 1) * q.pageSize,
      take: q.pageSize,
      include: {
        methods: {
          select: { status: true, saspayNetwork: true, limitation: true },
        },
      },
    });
    const sellable = await this.sellableByCurrency(rows.map((r) => r.currency));
    return buildPage(
      rows.map((r) => ({
        iso: r.iso,
        name: r.name,
        currency: r.currency,
        dialCode: r.dialCode ? `+${r.dialCode}` : '',
        status: r.status,
        feeNote: r.indicativeFeeNote,
        methodCount: r.methods.length,
        activeMethodCount: r.methods.filter((m) => m.status === 'ACTIVE')
          .length,
        sellable: sellable.get(r.currency) ?? false,
      })),
      total,
      page,
      q.pageSize,
    );
  }

  async getCountry(iso: string): Promise<AdminCountryDetail> {
    const row = await this.prisma.country.findUnique({
      where: { iso: iso.toUpperCase() },
      include: {
        methods: { include: { method: true }, orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!row) throw notFound('Pays introuvable.');
    return this.toDetail(row);
  }

  async listMethods(q: MethodListQuery): Promise<Page<AdminMethodRow>> {
    const where: Prisma.PaymentMethodWhereInput = {};
    if (q.type) where.type = q.type;
    if (q.q)
      where.OR = [
        { name: { contains: q.q, mode: 'insensitive' } },
        { code: { contains: q.q, mode: 'insensitive' } },
      ];
    const total = await this.prisma.paymentMethod.count({ where });
    const page = clampPage(q.page, total, q.pageSize);
    const rows = await this.prisma.paymentMethod.findMany({
      where,
      orderBy: [{ name: 'asc' }, { code: 'asc' }],
      skip: (page - 1) * q.pageSize,
      take: q.pageSize,
      select: {
        code: true,
        name: true,
        type: true,
        countries: { select: { status: true } },
      },
    });
    return buildPage(
      rows.map((r) => ({
        code: r.code,
        name: r.name,
        type: r.type,
        countries: r.countries.length,
        activeCountries: r.countries.filter((c) => c.status === 'ACTIVE')
          .length,
      })),
      total,
      page,
      q.pageSize,
    );
  }

  // ───────────── Écriture ─────────────

  async setCountryStatus(
    adminId: string,
    iso: string,
    status: CatalogStatus,
    reason: string,
    ip?: string,
  ): Promise<void> {
    const country = await this.prisma.country.findUnique({
      where: { iso: iso.toUpperCase() },
    });
    if (!country) throw notFound('Pays introuvable.');
    if (country.status === status) return;
    if (
      status === 'ACTIVE' &&
      !(await this.offers.isSellable(country.currency))
    )
      throw new BadRequestException({
        code: 'CURRENCY_NOT_CONFIGURED',
        message: `La devise ${country.currency} n’a ni prix du crédit avec bornes, ni pack : configurez la tarification avant d’ouvrir ce pays.`,
      });
    await this.prisma.$transaction(async (tx) => {
      await tx.country.update({
        where: { iso: country.iso },
        data: { status },
      });
      await this.audit.log(
        {
          actorId: adminId,
          action: 'country.status',
          entityType: 'Country',
          entityId: country.iso,
          before: { status: country.status },
          after: { status },
          reason,
          ip,
        },
        tx,
      );
    });
  }

  async setMethodStatus(
    adminId: string,
    iso: string,
    methodCode: string,
    status: CatalogStatus,
    reason: string,
    ip?: string,
  ): Promise<void> {
    const assoc = await this.prisma.countryPaymentMethod.findUnique({
      where: {
        countryIso_methodCode: {
          countryIso: iso.toUpperCase(),
          methodCode,
        },
      },
    });
    if (!assoc) throw notFound('Moyen de paiement introuvable pour ce pays.');
    if (assoc.status === status) return;
    // Un moyen non supporté ou non configuré ne s'active jamais (« bientôt » et « désactivé » restent permis).
    const blocker = activationBlocker(assoc);
    if (status === 'ACTIVE' && blocker)
      throw new BadRequestException({
        code: 'PAYMENT_METHOD_NOT_ACTIVATABLE',
        message: blocker,
      });
    await this.prisma.$transaction(async (tx) => {
      await tx.countryPaymentMethod.update({
        where: { id: assoc.id },
        data: { status },
      });
      await this.audit.log(
        {
          actorId: adminId,
          action: 'country_method.status',
          entityType: 'CountryPaymentMethod',
          entityId: assoc.id,
          before: { status: assoc.status },
          after: { status, country: assoc.countryIso, method: methodCode },
          reason,
          ip,
        },
        tx,
      );
    });
  }

  /** Prix du crédit et bornes d'achat libre d'une devise (hors franc CFA, dont le prix est un réglage global). */
  async setCurrencyPricing(
    adminId: string,
    iso: string,
    input: CurrencyPricingInput,
    ip?: string,
  ): Promise<void> {
    const country = await this.prisma.country.findUnique({
      where: { iso: iso.toUpperCase() },
    });
    if (!country) throw notFound('Pays introuvable.');
    if (isCfa(country.currency))
      throw new BadRequestException({
        code: 'CFA_PRICING_IN_SETTINGS',
        message:
          'Le franc CFA se règle dans Paramètres (prix du crédit) : XAF et XOF sont à parité.',
      });
    const before = await this.prisma.currencySetting.findUnique({
      where: { currency: country.currency },
    });
    const data = {
      creditValue: input.creditValue,
      minAmount: input.minAmount,
      maxAmount: input.maxAmount,
      active: input.active,
    };
    await this.prisma.$transaction(async (tx) => {
      await tx.currencySetting.upsert({
        where: { currency: country.currency },
        update: data,
        create: { currency: country.currency, ...data },
      });
      await this.audit.log(
        {
          actorId: adminId,
          action: 'currency.pricing',
          entityType: 'CurrencySetting',
          entityId: country.currency,
          before: before
            ? {
                creditValue: before.creditValue,
                minAmount: before.minAmount,
                maxAmount: before.maxAmount,
                active: before.active,
              }
            : undefined,
          after: data,
          reason: input.reason,
          ip,
        },
        tx,
      );
    });
  }

  // ───────────── Interne ─────────────

  private async sellableByCurrency(
    currencies: string[],
  ): Promise<Map<string, boolean>> {
    const out = new Map<string, boolean>();
    for (const c of new Set(currencies))
      out.set(c, await this.offers.isSellable(c));
    return out;
  }

  private async toDetail(row: CountryWithMethods): Promise<AdminCountryDetail> {
    const cfa = isCfa(row.currency);
    const [setting, packs, sellable, unit] = await Promise.all([
      this.prisma.currencySetting.findUnique({
        where: { currency: row.currency },
      }),
      this.prisma.creditPack.count({
        where: {
          active: true,
          currency: row.currency === 'XOF' ? 'XAF' : row.currency,
        },
      }),
      this.offers.isSellable(row.currency),
      this.offers.unitPrice(row.currency),
    ]);
    return {
      iso: row.iso,
      name: row.name,
      currency: row.currency,
      dialCode: row.dialCode ? `+${row.dialCode}` : '',
      status: row.status,
      feeNote: row.indicativeFeeNote,
      methodCount: row.methods.length,
      activeMethodCount: row.methods.filter((m) => m.status === 'ACTIVE')
        .length,
      sellable,
      methods: row.methods.map((m) => ({
        id: m.id,
        methodCode: m.methodCode,
        name: m.method.name,
        type: m.method.type,
        status: m.status,
        saspayNetwork: m.saspayNetwork,
        feeNote: m.indicativeFeeNote,
        note: m.note,
        blocker: activationBlocker(m),
      })),
      pricing: {
        cfa,
        creditValue: cfa ? unit : (setting?.creditValue ?? null),
        minAmount: setting?.minAmount ?? null,
        maxAmount: setting?.maxAmount ?? null,
        active: cfa ? true : (setting?.active ?? false),
        packs,
      },
    };
  }
}

function notFound(message: string): NotFoundException {
  return new NotFoundException({ code: 'NOT_FOUND', message });
}
