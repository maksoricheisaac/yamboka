import type { DailyPoint } from "@yamboka/shared";
import { formatNumber } from "@/lib/format";

/** Histogramme journalier léger (aucune bibliothèque) ; l'équivalent texte est fourni aux lecteurs d'écran. */
export function Bars({ title, data, unit }: { title: string; data: DailyPoint[]; unit: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((n, d) => n + d.value, 0);
  return (
    <figure className="space-y-2">
      <figcaption className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold">{title}</span>
        <span className="text-muted-foreground">
          {formatNumber(total)} {unit}
        </span>
      </figcaption>
      {data.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Aucune donnée sur la période.</p>
      ) : (
        <>
          <div role="img" aria-label={`${title} : ${formatNumber(total)} ${unit} sur ${data.length} jours`} className="flex h-24 items-end gap-1">
            {data.map((d) => (
              <div key={d.day} title={`${d.day} : ${formatNumber(d.value)} ${unit}`} className="min-w-1 max-w-8 flex-1 rounded-t bg-primary/70" style={{ height: `${Math.max(4, (d.value / max) * 100)}%` }} />
            ))}
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
