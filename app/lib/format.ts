import { formatPhoneDisplay } from "@yamboka/shared";
const nf = new Intl.NumberFormat("fr-FR");

/** Montant en FCFA, avec espace insécable entre les milliers (« 2 500 FCFA »). */
export function formatFcfa(value: number): string {
  return `${nf.format(value)} FCFA`;
}

export function formatNumber(value: number): string {
  return nf.format(value);
}

const dateTime = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Brazzaville",
});

export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso));
}

/** Présentation d'un numéro (E.164 ou ancien format congolais) : « +242 06 606 31 33 ». */
export function formatPhone(phone: string): string {
  return formatPhoneDisplay(phone);
}

/** Francs CFA (XAF et XOF sont à parité) : affichés « FCFA », comme partout dans l'application. */
const CFA = new Set(["XAF", "XOF"]);

/** Montant dans la devise du paiement : « 2 500 FCFA », « 1 200 GHS ». Ne suppose jamais que la devise est le FCFA. */
export function formatMoney(value: number, currency: string): string {
  return CFA.has(currency) ? formatFcfa(value) : `${nf.format(value)} ${currency}`;
}

/** Prix d'un crédit : jusqu'à 2 décimales utiles (« 4 FCFA », « 3,68 FCFA »). */
export function formatUnitPrice(value: number, currency: string): string {
  const text = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value);
  return CFA.has(currency) ? `${text} FCFA` : `${text} ${currency}`;
}

const dateOnly = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Brazzaville" });
export function formatDate(iso: string): string {
  return dateOnly.format(new Date(iso));
}
