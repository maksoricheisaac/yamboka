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

/** « 242061234567 » → « +242 06 123 45 67 » pour l'affichage. */
export function formatPhone(phone: string): string {
  const m = /^(242)(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(phone);
  return m ? `+${m[1]} ${m[2]} ${m[3]} ${m[4]} ${m[5]}` : phone;
}
