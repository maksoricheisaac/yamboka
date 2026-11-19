import type { DailyPoint } from "@yamboka/shared";
import { formatNumber } from "@/lib/format";

/** Jour « 14 nov. » (le point porte déjà une date calendaire de Brazzaville : aucune conversion de fuseau). */
const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });

/**
 * Histogramme journalier léger (aucune bibliothèque). La série couvre TOUS les jours de la période, zéros
 * compris : la largeur d'une barre vaut donc un jour, et l'axe se lit du premier au dernier jour choisi.
 * Les jours à zéro gardent un trait de base, pour qu'un creux se distingue d'une absence de données.
 */
export function Bars({ title, data, unit, unitOne }: { title: string; data: DailyPoint[]; unit: string; unitOne?: string }) {
  /** Accord du nom d’unité : « 1 inscription », « 7 inscriptions ». */
  const u = (n: number) => (n > 1 ? unit : (unitOne ?? unit));
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((n, d) => n + d.value, 0);
  const first = data[0];
  const last = data[data.length - 1];

  return (
    <figure className="space-y-2">
      <figcaption className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold">{title}</span>
        <span className="tabular-nums text-muted-foreground">
          {formatNumber(total)} {u(total)}
        </span>
      </figcaption>
      {data.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Aucune donnée sur la période.</p>
      ) : (
        <>
          <div
            role="img"
            aria-label={`${title} : ${formatNumber(total)} ${u(total)} sur ${data.length} jour${data.length > 1 ? "s" : ""}`}
            className="flex h-24 items-end gap-px border-b"
          >
            {data.map((d) => (
              <div
                key={d.day}
                title={`${dayLabel(d.day)} : ${formatNumber(d.value)} ${u(d.value)}`}
                className="flex h-full min-w-0.5 flex-1 items-end"
              >
                <div
                  className={`w-full rounded-t ${d.value > 0 ? "bg-primary/70" : "bg-border"}`}
                  style={{ height: d.value > 0 ? `${Math.max(6, (d.value / max) * 100)}%` : "2px" }}
                />
              </div>
            ))}
          </div>
          <div className="flex items-baseline justify-between text-xs text-muted-foreground">
            <span>{dayLabel(first.day)}</span>
            <span className="tabular-nums">
              max {formatNumber(max)} {u(max)}
            </span>
            <span>{dayLabel(last.day)}</span>
          </div>
          <table className="sr-only">
            <caption>{title}</caption>
            <tbody>
              {data.map((d) => (
                <tr key={d.day}>
                  <th scope="row">{d.day}</th>
                  <td>{d.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </figure>
  );
}
