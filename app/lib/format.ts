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
