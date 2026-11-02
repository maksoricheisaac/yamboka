/**
 * Arithmétique décimale exacte pour l'argent. Les montants et taux transitent en chaînes ou en nombres de peu
 * de décimales ; on les convertit en entiers BigInt à échelle fixe pour ne jamais arrondir par accident.
 */

/** Convertit « 2.5 », 2.5 ou « 50.00 » en entier à `decimals` décimales (2.5, 4 → 25000n). Refuse l'imprécis. */
export function toScaled(value: string | number, decimals: number): bigint {
  const text =
    typeof value === 'number'
      ? value.toFixed(Math.min(decimals + 4, 12))
      : value.trim();
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match)
    throw new RangeError(`Valeur décimale invalide : ${String(value)}`);
  const [, sign, int, frac = ''] = match;
  // Les décimales au-delà de l'échelle doivent être nulles (sinon on perdrait de la précision sans le dire).
  if (/[1-9]/.test(frac.slice(decimals))) {
    throw new RangeError(
      `Trop de décimales pour l'échelle ${decimals} : ${String(value)}`,
    );
  }
  const scaled = BigInt(int + frac.slice(0, decimals).padEnd(decimals, '0'));
  return sign === '-' ? -scaled : scaled;
}

/** Division entière arrondie à l'entier supérieur (nombres positifs). */
export function ceilDiv(a: bigint, b: bigint): bigint {
  if (b <= 0n) throw new RangeError('Diviseur invalide');
  return a >= 0n ? (a + b - 1n) / b : a / b;
}
