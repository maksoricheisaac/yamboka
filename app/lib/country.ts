import { DEFAULT_PAYMENT_COUNTRY, phoneCountry, type PaymentCountryView } from "@yamboka/shared";

/** Cookie du pays choisi par l'utilisateur (préférence d'affichage : prix, moyens de paiement). Aucun secret. */
export const COUNTRY_COOKIE = "yb_country";

/** En-têtes posés par les CDN / reverse proxies courants avec le pays déduit de l'adresse IP. */
export const GEO_HEADERS = ["x-vercel-ip-country", "cf-ipcountry", "cloudfront-viewer-country", "x-country-code"] as const;

export type CountrySource = "choice" | "ip" | "phone" | "default";

/**
 * Pays proposé par défaut pour payer, dans l'ordre de fiabilité :
 * 1. le choix explicite de l'utilisateur ; 2. le pays de l'adresse IP, UNIQUEMENT si l'infrastructure le fournit
 * (jamais deviné) ; 3. le pays de son numéro de téléphone ; 4. le pays historique (Congo-Brazzaville).
 * Un pays qui n'est pas ouvert à la vente n'est jamais retenu.
 */
export function pickCountry(
  countries: PaymentCountryView[],
  hints: { choice?: string | null; ip?: string | null; phone?: string | null },
): { iso: string; source: CountrySource } {
  const open = new Set(countries.map((c) => c.iso));
  const choice = hints.choice?.toUpperCase();
  if (choice && open.has(choice)) return { iso: choice, source: "choice" };
  const ip = hints.ip?.toUpperCase();
  if (ip && open.has(ip)) return { iso: ip, source: "ip" };
  const phone = hints.phone ? phoneCountry(hints.phone) : undefined;
  if (phone && open.has(phone)) return { iso: phone, source: "phone" };
  if (open.has(DEFAULT_PAYMENT_COUNTRY)) return { iso: DEFAULT_PAYMENT_COUNTRY, source: "default" };
  return { iso: countries[0]?.iso ?? DEFAULT_PAYMENT_COUNTRY, source: "default" };
}
