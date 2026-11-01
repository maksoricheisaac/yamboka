import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/min';
import { z } from 'zod';

/**
 * Numéros de téléphone : un seul format de stockage et d'échange, le E.164 (« +242066063133 »).
 * L'affichage (« +242 06 606 31 33 ») est une affaire d'interface ; voir `formatPhoneDisplay`.
 *
 * Compatibilité : les numéros enregistrés avant l'ouverture à l'international sont au format « 242XXXXXXXXX »
 * (sans « + »). Ils restent acceptés en entrée et sont convertis en E.164.
 */

/** Ancien format congolais, sans « + » : 242 suivi de 9 chiffres. */
const LEGACY_CONGO = /^242\d{9}$/;

/** Pays par défaut des formulaires : celui de la clientèle actuelle (République du Congo). */
export const DEFAULT_PHONE_COUNTRY: CountryCode = 'CG';

/**
 * Normalise un numéro en E.164. Retourne `null` s'il n'est pas valide pour son pays.
 * - « +… » : le pays est déduit de l'indicatif.
 * - sans « + » : `country` (s'il est fourni) donne le plan de numérotation ; sinon seul l'ancien format congolais passe.
 */
export function normalizePhone(input: string, country?: CountryCode): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const compact = raw.replace(/[\s().-]/g, '');
  if (LEGACY_CONGO.test(compact)) return normalizePhone(`+${compact}`);
  const parsed = raw.startsWith('+') || raw.startsWith('00')
    ? parsePhoneNumberFromString(raw.startsWith('00') ? `+${raw.slice(2)}` : raw)
    : country
      ? parsePhoneNumberFromString(raw, country)
      : undefined;
  return parsed?.isValid() ? parsed.number : null;
}

/** Pays d'un numéro E.164 (ou de l'ancien format). */
export function phoneCountry(value: string): CountryCode | undefined {
  const e164 = LEGACY_CONGO.test(value) ? `+${value}` : value;
  return parsePhoneNumberFromString(e164)?.country;
}

/** Regroupement du national congolais en 2-3-2-2 (« 06 606 31 33 »), plus lisible que le découpage par défaut. */
function groupCongo(national: string): string {
  const m = /^(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(national);
  return m ? `${m[1]} ${m[2]} ${m[3]} ${m[4]}` : national;
}

/** Présentation d'un numéro : « +242 06 606 31 33 ». Un numéro illisible est renvoyé tel quel. */
export function formatPhoneDisplay(value: string): string {
  const e164 = LEGACY_CONGO.test(value) ? `+${value}` : value;
  const parsed = parsePhoneNumberFromString(e164);
  if (!parsed) return value;
  if (parsed.country === 'CG') return `+242 ${groupCongo(parsed.nationalNumber)}`;
  return parsed.formatInternational();
}

const INVALID = 'Numéro invalide pour ce pays. Vérifiez l’indicatif et le numéro.';

/**
 * Numéro de téléphone international. Entrée : E.164 ou ancien format congolais ; sortie : E.164.
 * La validation suit le plan de numérotation du pays (pas un simple nombre de chiffres).
 */
export const phoneSchema = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const n = normalizePhone(v);
    if (!n) ctx.issues.push({ code: 'custom', message: INVALID, input: v });
    return n ?? v;
  });

/**
 * Numéro mobile money : l'achat de crédits passe par MTN et Airtel Money au Congo, donc un numéro congolais (+242).
 */
export const mobileMoneyPhoneSchema = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const n = normalizePhone(v);
    if (!n) ctx.issues.push({ code: 'custom', message: INVALID, input: v });
    else if (!n.startsWith('+242'))
      ctx.issues.push({ code: 'custom', message: 'Le paiement mobile money nécessite un numéro congolais (+242).', input: v });
    return n ?? v;
  });

export type { CountryCode };
