/** Drapeau d'un pays à partir de son code ISO (lettres indicatrices régionales) ; 🌍 pour la zone « International » (XX). */
export function flagOf(iso: string): string {
  if (!/^[A-Z]{2}$/.test(iso) || iso === "XX") return "🌍";
  return String.fromCodePoint(...[...iso].map((c) => 0x1f1a5 + c.charCodeAt(0)));
}
