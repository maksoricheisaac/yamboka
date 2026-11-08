import { Injectable } from '@nestjs/common';
import type {
  CountryPaymentMethod,
  PaymentMethod,
  Country,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { CountryConfig, NetworkConfig } from '../payment-countries';
import { LIMITATION_LABELS, type Limitation } from './catalog-data';

export type AssocWithMethod = CountryPaymentMethod & { method: PaymentMethod };
export type CountryWithMethods = Country & { methods: AssocWithMethod[] };

/**
 * Pourquoi un moyen ne peut pas être activé, ou null s'il est activable. Source unique de la règle « un moyen
 * non configuré ou non supporté par SasPay ne peut pas être activé pour de vrais paiements ».
 * Le fournisseur simulé (dev, tests) accepte tout moyen ayant un code réseau : seule l'absence de code bloque.
 */
export function activationBlocker(
  assoc: Pick<CountryPaymentMethod, 'saspayNetwork' | 'limitation'>,
): string | null {
  if (assoc.limitation)
    return (
      LIMITATION_LABELS[assoc.limitation as Limitation] ??
      'Non utilisable pour le moment.'
    );
  if (!assoc.saspayNetwork) return LIMITATION_LABELS.NOT_IN_SASPAY;
  return null;
}

/**
 * Lecture du catalogue pays / moyens de paiement en base. Toutes les décisions « ce pays / ce moyen peut-il encaisser »
 * passent ici, côté serveur : l'interface ne fait qu'afficher ce que le serveur déclare.
 */
@Injectable()
export class CountryCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  /** Pays ACTIVE avec leurs moyens ACTIVE et utilisables, dans l'ordre du catalogue. Un pays sans moyen n'est pas renvoyé. */
  async openCountries(): Promise<CountryConfig[]> {
    const rows = await this.prisma.country.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [{ sortOrder: 'asc' }, { iso: 'asc' }],
      include: {
        methods: {
          where: { status: 'ACTIVE' },
          include: { method: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    return rows.map(toConfig).filter((c) => c.networks.length > 0);
  }

  /** Pays ouvert (ACTIVE) ou null : un pays désactivé ou « bientôt » ne peut jamais encaisser. */
  async openCountry(iso: string): Promise<CountryConfig | null> {
    const row = await this.prisma.country.findFirst({
      where: { iso, status: 'ACTIVE' },
      include: {
        methods: {
          where: { status: 'ACTIVE' },
          include: { method: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    return row ? toConfig(row) : null;
  }

  /**
   * Pays « Bientôt disponible » et, pour chaque pays ouvert, ses moyens « Bientôt disponible » (affichés, jamais
   * sélectionnables). Les statuts DISABLED ne sont jamais exposés.
   */
  async comingSoon(): Promise<{
    countries: { iso: string; name: string }[];
    methodsByCountry: Map<string, { code: string; name: string }[]>;
  }> {
    const [countries, soonAssocs] = await Promise.all([
      this.prisma.country.findMany({
        where: { status: 'COMING_SOON' },
        orderBy: [{ sortOrder: 'asc' }, { iso: 'asc' }],
        select: { iso: true, name: true },
      }),
      this.prisma.countryPaymentMethod.findMany({
        where: { status: 'COMING_SOON', country: { status: 'ACTIVE' } },
        orderBy: { sortOrder: 'asc' },
        include: { method: true },
      }),
    ]);
    const methodsByCountry = new Map<
      string,
      { code: string; name: string }[]
    >();
    for (const a of soonAssocs) {
      const list = methodsByCountry.get(a.countryIso) ?? [];
      list.push({ code: a.saspayNetwork ?? a.methodCode, name: a.method.name });
      methodsByCountry.set(a.countryIso, list);
    }
    return { countries, methodsByCountry };
  }

  /** Un moyen ouvert dans ce pays, retrouvé par son code réseau, ou undefined. */
  findNetwork(country: CountryConfig, code: string): NetworkConfig | undefined {
    return country.networks.find((n) => n.code === code);
  }

  /** Indicatif (sans « + ») et nom d'un pays, tous statuts confondus (validation du téléphone, historique). */
  async dialCodeOf(iso: string): Promise<string | null> {
    const c = await this.prisma.country.findUnique({
      where: { iso },
      select: { dialCode: true },
    });
    return c?.dialCode ?? null;
  }
}

function toConfig(row: CountryWithMethods): CountryConfig {
  return {
    iso: row.iso,
    name: row.name,
    currency: row.currency,
    dial: row.dialCode,
    networks: row.methods
      // Garde-fou : même si une ligne ACTIVE se glissait en base, un moyen non activable n'est jamais offert.
      .filter((m) => activationBlocker(m) === null)
      .map((m) => ({
        code: m.saspayNetwork as string,
        name: m.method.name,
        methodCode: m.methodCode,
      })),
  };
}
