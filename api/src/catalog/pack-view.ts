import type { CreditRates, PackView } from '@yamboka/shared';
import { packEquivalents } from '@yamboka/shared';
import type { CreditPack } from '../generated/prisma/client';
import { packTotalCredits } from './pricing';

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
