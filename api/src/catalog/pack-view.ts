import type { CreditRates, PackView } from '@yamboka/shared';
import { VIDEO_RESOLUTIONS, packEquivalents } from '@yamboka/shared';
import { WAN_MODEL } from '../generation/models';
import type { CreditPack } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { packTotalCredits } from './pricing';

/** Tarifs par résolution, lus en base (produits vidéo actifs) : jamais en dur. Source unique de l'affichage ET de la facturation. */
export async function loadVideoRates(
  prisma: PrismaService,
): Promise<CreditRates> {
  const products = await prisma.generationProduct.findMany({
    where: { active: true },
  });
  const rates = {} as CreditRates;
  for (const r of VIDEO_RESOLUTIONS) {
    rates[r] =
      products.find(
        (p) =>
          p.resolution === r &&
          p.billingUnit === 'SECOND' &&
          p.providerModel === WAN_MODEL,
      )?.creditsPerUnit ?? 0;
  }
  return rates;
}

/** Vue publique d'un pack. `currency` remplace celle du pack quand le pays paie dans une devise à parité (XOF pour XAF). */
export function toPackView(
  p: CreditPack,
  rates: CreditRates,
  currency: string = p.currency,
): PackView {
  const total = packTotalCredits({
    price: p.price,
    baseCredits: p.credits,
    bonusPercent: p.bonusPercent,
  });
  return {
    id: p.id,
    name: p.name,
    currency,
    priceFcfa: p.price,
    baseCredits: p.credits,
    bonusPercent: p.bonusPercent,
    totalCredits: total,
    featured: p.featured,
    equivalent: packEquivalents(total, rates),
  };
}
