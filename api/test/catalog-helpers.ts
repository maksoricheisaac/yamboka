import type { PrismaService } from '../src/prisma/prisma.service';

type Status = 'ACTIVE' | 'COMING_SOON' | 'DISABLED';

/**
 * Ouvre exactement ces pays (statut ACTIVE) avec tous leurs moyens activables, et désactive le reste.
 * Équivalent de l'ancien réglage « paymentEnabledCountries », mais sur le catalogue en base.
 */
export async function openCountries(
  prisma: PrismaService,
  isos: string[],
): Promise<void> {
  await prisma.country.updateMany({
    where: { iso: { notIn: isos } },
    data: { status: 'DISABLED' },
  });
  await prisma.country.updateMany({
    where: { iso: { in: isos } },
    data: { status: 'ACTIVE' },
  });
  await prisma.countryPaymentMethod.updateMany({
    where: { countryIso: { notIn: isos } },
    data: { status: 'DISABLED' },
  });
  await prisma.countryPaymentMethod.updateMany({
    where: {
      countryIso: { in: isos },
      saspayNetwork: { not: null },
      limitation: null,
    },
    data: { status: 'ACTIVE' },
  });
}

export const setCountry = (
  prisma: PrismaService,
  iso: string,
  status: Status,
) => prisma.country.update({ where: { iso }, data: { status } });

export const setMethod = (
  prisma: PrismaService,
  iso: string,
  methodCode: string,
  status: Status,
) =>
  prisma.countryPaymentMethod.update({
    where: { countryIso_methodCode: { countryIso: iso, methodCode } },
    data: { status },
  });
