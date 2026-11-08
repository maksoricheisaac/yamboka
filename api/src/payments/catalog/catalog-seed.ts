import type { Prisma, PrismaClient } from '../../generated/prisma/client';
import {
  CARD_FEE_PERCENT,
  COUNTRIES,
  LEGACY_OPEN_COUNTRIES,
  METHODS,
} from './catalog-data';

type Db = PrismaClient | Prisma.TransactionClient;

export interface CatalogSeedResult {
  countries: number;
  methods: number;
  associations: number;
  /** Lignes créées par CET appel (0 à la deuxième exécution). */
  created: { countries: number; associations: number };
}

/**
 * Charge le catalogue international. IDEMPOTENT : une ligne déjà présente n'est jamais recréée et son STATUT
 * (choisi par l'administrateur) n'est jamais modifié ; seules les informations techniques sont rafraîchies.
 *
 * Statut d'une ligne NOUVELLE : DISABLED, sauf pour les pays ouverts avant le catalogue (ancien réglage
 * `paymentEnabledCountries`, lu s'il existe) et leurs moyens activables, qui restent ACTIVE : aucune régression
 * pour les clients actuels. Aucun autre pays n'est ouvert automatiquement.
 */
export async function seedCountryCatalog(db: Db): Promise<CatalogSeedResult> {
  const legacy = await db.setting.findUnique({
    where: { key: 'paymentEnabledCountries' },
  });
  const openCountries = new Set(
    (typeof legacy?.value === 'string'
      ? legacy.value.split(',').map((c) => c.trim().toUpperCase())
      : [...LEGACY_OPEN_COUNTRIES]
    ).filter(Boolean),
  );

  for (const m of METHODS) {
    await db.paymentMethod.upsert({
      where: { code: m.code },
      update: { name: m.name, type: m.type },
      create: m,
    });
  }

  const created = { countries: 0, associations: 0 };
  let associations = 0;
  for (const [index, c] of COUNTRIES.entries()) {
    const isOpen = openCountries.has(c.iso);
    const technical = {
      name: c.name,
      dialCode: c.dialCode,
      currency: c.currency,
      indicativeFeePercent: c.feePercent,
      indicativeFeeNote: c.feeNote,
      sortOrder: index,
    };
    const existing = await db.country.findUnique({ where: { iso: c.iso } });
    if (existing) {
      await db.country.update({ where: { iso: c.iso }, data: technical });
    } else {
      await db.country.create({
        data: {
          iso: c.iso,
          ...technical,
          status: isOpen ? 'ACTIVE' : 'DISABLED',
        },
      });
      created.countries += 1;
    }

    for (const [
      i,
      [methodCode, network, limitation, note],
    ] of c.methods.entries()) {
      associations += 1;
      const method = METHODS.find((m) => m.code === methodCode);
      const isCard = method?.type === 'CARD';
      const technicalAssoc = {
        saspayNetwork: network,
        limitation,
        note: note ?? null,
        indicativeFeePercent: isCard ? CARD_FEE_PERCENT : null,
        indicativeFeeNote: isCard ? '5 %' : null,
        sortOrder: i,
      };
      const found = await db.countryPaymentMethod.findUnique({
        where: { countryIso_methodCode: { countryIso: c.iso, methodCode } },
      });
      if (found) {
        await db.countryPaymentMethod.update({
          where: { id: found.id },
          data: technicalAssoc,
        });
      } else {
        await db.countryPaymentMethod.create({
          data: {
            countryIso: c.iso,
            methodCode,
            ...technicalAssoc,
            status: isOpen && network && !limitation ? 'ACTIVE' : 'DISABLED',
          },
        });
        created.associations += 1;
      }
    }
  }

  await backfillPaymentSnapshots(db);
  return {
    countries: COUNTRIES.length,
    methods: METHODS.length,
    associations,
    created,
  };
}

/**
 * Renseigne l'instantané (pays, moyen) des paiements créés avant le catalogue. Ne touche QUE les lignes où il manque :
 * un instantané déjà pris n'est jamais réécrit, et aucun montant, statut ni fournisseur n'est modifié.
 */
async function backfillPaymentSnapshots(db: Db): Promise<void> {
  await db.$executeRaw`
    UPDATE "Payment" p
    SET "methodCode" = cpm."methodCode",
        "methodName" = pm."name",
        "countryName" = c."name"
    FROM "CountryPaymentMethod" cpm
    JOIN "PaymentMethod" pm ON pm."code" = cpm."methodCode"
    JOIN "Country" c ON c."iso" = cpm."countryIso"
    WHERE p."methodCode" IS NULL
      AND p."network" IS NOT NULL
      AND cpm."saspayNetwork" = p."network"
      AND cpm."countryIso" = p."country"`;
  await db.$executeRaw`
    UPDATE "Payment" p
    SET "methodCode" = CASE p."operator"::text WHEN 'MTN' THEN 'MTN_MOMO' ELSE 'AIRTEL_MONEY' END,
        "methodName" = CASE p."operator"::text WHEN 'MTN' THEN 'MTN MoMo' ELSE 'Airtel Money' END
    WHERE p."methodCode" IS NULL AND p."network" IS NULL AND p."operator"::text IN ('MTN', 'AIRTEL')`;
  await db.$executeRaw`
    UPDATE "Payment" p SET "countryName" = c."name"
    FROM "Country" c WHERE c."iso" = p."country" AND p."countryName" IS NULL`;
}
