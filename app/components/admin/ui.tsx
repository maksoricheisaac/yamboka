import Link from "next/link";
import { DateRangePicker } from "@/components/admin/date-range-picker";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { Params } from "@/lib/pagination";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <h1 className="text-title">{title}</h1>
        {description && <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Indicateur de tête de page : valeur en gras, libellé et précision à côté. Pas de carte : l'œil lit une phrase, pas trois boîtes. */
export function StatCard({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <p className="text-sm text-muted-foreground">
      <strong className="mr-1.5 font-heading text-xl font-bold tabular-nums text-foreground">{value}</strong>
      {label}
      {hint && <span className="text-muted-foreground/80"> · {hint}</span>}
    </p>
  );
}

/** Rangée d'indicateurs en tête de page. */
export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">{children}</div>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed bg-card/50 p-8 text-center">
      <p className="font-semibold">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{children}</p>}
    </div>
  );
}

const TONES = {
  ok: "bg-success/15 text-success",
  warn: "bg-warning/15 text-warning",
  bad: "bg-destructive/12 text-destructive",
  info: "bg-info/15 text-info",
  neutral: "bg-muted text-muted-foreground",
} as const;

export function Pill({ tone = "neutral", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONES[tone]}`}>{children}</span>;
}

const PAYMENT: Record<string, [string, keyof typeof TONES]> = {
  INITIATED: ["Initié", "neutral"],
  PENDING: ["En attente", "warn"],
  SUCCESS: ["Réussi", "ok"],
  FAILED: ["Échoué", "bad"],
  CANCELLED: ["Annulé", "neutral"],
};
const USER_STATUS: Record<string, [string, keyof typeof TONES]> = {
  ACTIVE: ["Actif", "ok"],
  SUSPENDED: ["Suspendu", "warn"],
  BANNED: ["Banni", "bad"],
};
const GENERATION: Record<string, [string, keyof typeof TONES]> = {
  PENDING: ["En attente", "neutral"],
  SUBMITTED: ["Envoyée", "info"],
  PROCESSING: ["En cours", "info"],
  COMPLETED: ["Réussie", "ok"],
  FAILED: ["Échouée", "bad"],
  CANCELLED: ["Annulée", "neutral"],
};
const REPORT: Record<string, [string, keyof typeof TONES]> = {
  NEW: ["Nouveau", "warn"],
  IN_PROGRESS: ["En cours", "info"],
  RESOLVED: ["Résolu", "ok"],
  REJECTED: ["Rejeté", "neutral"],
};

export const STATUS_OPTIONS = {
  payment: Object.entries(PAYMENT).map(([value, [label]]) => ({ value, label })),
  user: Object.entries(USER_STATUS).map(([value, [label]]) => ({ value, label })),
  generation: Object.entries(GENERATION).map(([value, [label]]) => ({ value, label })),
  report: Object.entries(REPORT).map(([value, [label]]) => ({ value, label })),
};

export function StatusPill({ kind, value }: { kind: "payment" | "user" | "generation" | "report"; value: string }) {
  const map = { payment: PAYMENT, user: USER_STATUS, generation: GENERATION, report: REPORT }[kind];
  const [label, tone] = map[value] ?? [value, "neutral" as const];
  return <Pill tone={tone}>{label}</Pill>;
}

export const LEDGER_LABELS: Record<string, string> = {
  PURCHASE: "Achat",
  FIRST_PURCHASE_BONUS: "Bonus de premier achat",
  WELCOME: "Bienvenue",
  RESERVE: "Réservation",
  CAPTURE: "Consommation",
  RELEASE: "Crédits restitués",
  ADMIN_ADJUST: "Ajustement",
  EXPIRE: "Expiration",
};

export { withParams } from "@/lib/pagination";
export { Pager } from "@/components/pager";

/** Filtres en méthode GET : fonctionnent sans JavaScript et se partagent par URL. */
export function FilterBar({ children, reset }: { children: ReactNode; reset: string }) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-3 rounded-3xl bg-card shadow-card p-3">
      {children}
      <Button type="submit">Filtrer</Button>
      <Button asChild variant="secondary">
        <Link href={reset}>Réinitialiser</Link>
      </Button>
    </form>
  );
}

/** Période Du/Au en un seul calendrier ; émet les champs `from` et `to` dans le formulaire de filtre. */
export function FilterDateRange({ from, to }: { from?: string; to?: string }) {
  return (
    <div className="flex min-w-36 flex-col gap-1 text-xs font-medium text-muted-foreground">
      Période
      <DateRangePicker from={from} to={to} name={{ from: "from", to: "to" }} />
    </div>
  );
}

/** Convertit les searchParams (valeurs éventuellement multiples) en simples chaînes. */
export function flat(sp: Record<string, string | string[] | undefined>): Params {
  return Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
}

export function listQuery(params: Params, extra: string[] = []): string {
  const qs = new URLSearchParams();
  for (const key of ["q", "status", "page", "pageSize", "sort", "dir", "from", "to", ...extra]) if (params[key]) qs.set(key, params[key]!);
  const s = qs.toString();
  return s ? `?${s}` : "";
}
