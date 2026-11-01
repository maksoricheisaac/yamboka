import Link from "next/link";
import { DateRangePicker } from "@/components/admin/date-range-picker";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
        {description && <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Carte d'indicateur : valeur en grand, libellé et précision (ex. période) dessous. */
export function StatCard({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Rangée de trois cartes d'indicateurs en tête de page. */
export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-3">{children}</div>;
}

/** Tableau défilant horizontalement (le conteneur est `relative` : indispensable pour les textes `sr-only`). */
export function DataTable({ caption, children, minWidth = "44rem" }: { caption: string; children: ReactNode; minWidth?: string }) {
  return (
    <div className="relative overflow-x-auto rounded-2xl border bg-card">
      <table className="w-full text-left text-sm [&_tbody_tr:hover]:bg-muted/40 [&_tbody_tr:last-child_td]:border-b-0" style={{ minWidth }}>
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export function Th({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return (
    <th scope="col" className={`border-b bg-muted px-4 py-3 font-semibold ${className}`}>
      {children}
    </th>
  );
}

export function Td({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <td className={`border-b px-4 py-3 align-top ${className}`}>{children}</td>;
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
  ok: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100",
  warn: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
  bad: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100",
  info: "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100",
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

type Params = Record<string, string | undefined>;

export function withParams(path: string, params: Params, overrides: Params = {}): string {
  const merged = { ...params, ...overrides };
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v) qs.set(k, v);
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

export function Pager({ page, total, pageSize, path, params }: { page: number; total: number; pageSize: number; path: string; params: Params }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return <p className="text-sm text-muted-foreground">{total} résultat{total > 1 ? "s" : ""}</p>;
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <p className="text-muted-foreground">
        Page {page} sur {pages} · {total} résultats
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Button asChild variant="outline">
            <Link href={withParams(path, params, { page: String(page - 1) })}>Précédent</Link>
          </Button>
        ) : null}
        {page < pages ? (
          <Button asChild variant="outline">
            <Link href={withParams(path, params, { page: String(page + 1) })}>Suivant</Link>
          </Button>
        ) : null}
      </div>
    </nav>
  );
}

/** Filtres en méthode GET : fonctionnent sans JavaScript et se partagent par URL. */
export function FilterBar({ children, reset }: { children: ReactNode; reset: string }) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-3 rounded-2xl border bg-card p-3">
      {children}
      <Button type="submit">Filtrer</Button>
      <Button asChild variant="secondary" size="sm" className="rounded-full px-3 py-1 text-xs">
        <Link href={reset}>R éinitialiser</Link>
      </Button>
    </form>
  );
}

export function FilterField({ label, name, defaultValue, type = "text", placeholder, children }: { label: string; name: string; defaultValue?: string; type?: string; placeholder?: string; children?: ReactNode }) {
  return (
    <label className="flex min-w-36 flex-col gap-1 text-xs font-medium text-muted-foreground">
      {label}
      {children ?? (
        <input name={name} type={type} defaultValue={defaultValue} placeholder={placeholder} className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground" />
      )}
    </label>
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

export function FilterSelect({ label, name, value, options, all = "Tous" }: { label: string; name: string; value?: string; options: { value: string; label: string }[]; all?: string }) {
  return (
    <FilterField label={label} name={name}>
      <select name={name} defaultValue={value ?? ""} className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground">
        <option value="">{all}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </FilterField>
  );
}

/** Convertit les searchParams (valeurs éventuellement multiples) en simples chaînes. */
export function flat(sp: Record<string, string | string[] | undefined>): Params {
  return Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
}

export function listQuery(params: Params, extra: string[] = []): string {
  const qs = new URLSearchParams();
  for (const key of ["q", "status", "page", "from", "to", ...extra]) if (params[key]) qs.set(key, params[key]!);
  const s = qs.toString();
  return s ? `?${s}` : "";
}
