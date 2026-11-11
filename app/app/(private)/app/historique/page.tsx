import { Coins } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { LedgerFilter, LedgerPage, Page, PaymentView } from "@yamboka/shared";
import { LedgerList } from "@/components/credits/ledger-list";
import { PurchasesList } from "@/components/credits/purchases-list";
import { Pager } from "@/components/pager";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { formatNumber } from "@/lib/format";
import { readPage, readPageSize, withParams } from "@/lib/pagination";
import { serverGet } from "@/lib/server-api";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Historique" };

/** Filtres de l'historique : l'adresse porte le choix (lien partageable, bouton Retour fidèle). */
const FILTERS: { param: string; filter: LedgerFilter; label: string }[] = [
  { param: "tout", filter: "all", label: "Toutes les opérations" },
  { param: "achats", filter: "purchases", label: "Achats" },
  { param: "generations", filter: "generations", label: "Générations" },
  { param: "remboursements", filter: "refunds", label: "Remboursements" },
  { param: "bonus", filter: "bonuses", label: "Bonus et ajustements" },
];

export default async function HistoryPage({ searchParams }: PageProps<"/app/historique">) {
  const user = await requireUser();
  const sp = await searchParams;
  const current = FILTERS.find((f) => f.param === sp.filtre) ?? FILTERS[0];
  const page = readPage(typeof sp.page === "string" ? sp.page : undefined);
  const pageSize = readPageSize(typeof sp.pageSize === "string" ? sp.pageSize : undefined);
  const from = typeof sp.du === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.du) ? sp.du : undefined;
  const to = typeof sp.au === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.au) ? sp.au : undefined;
  // Pagination SERVEUR : seule la page demandée est lue. Les achats se lisent dans la liste des paiements (états en
  // attente et échecs compris) ; le reste dans le registre de crédits.
  const base = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  const purchases = current.filter === "purchases";
  let payments: Page<PaymentView> | null = null;
  let ledger: LedgerPage | null = null;
  if (purchases) {
    payments = await serverGet<Page<PaymentView>>(`/payments?${base}`);
  } else {
    base.set("filter", current.filter);
    if (from) base.set("from", from);
    if (to) base.set("to", to);
    ledger = await serverGet<LedgerPage>(`/credits/ledger?${base}`);
  }
  const served = (payments ?? ledger) as Page<unknown>;
  const params = { filtre: current.param === "tout" ? undefined : current.param, du: from, au: to, pageSize: pageSize === 20 ? undefined : String(pageSize) };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-title">Historique</h1>
          <p className="mt-1 text-muted-foreground">Achats, créations, remboursements et bonus : tout ce qui a touché vos crédits.</p>
        </div>
        <div className="flex items-center gap-3">
          <p className="flex items-center gap-2 rounded-full border bg-card px-3.5 py-1.5 text-sm" aria-label="Solde actuel">
            <Coins className="size-4 text-primary" aria-hidden />
            <span className="font-bold">{formatNumber(user.credits)} crédits</span>
          </p>
          <Button asChild size="sm">
            <Link href="/app/credits">Acheter</Link>
          </Button>
        </div>
      </div>

      <nav aria-label="Filtrer l’historique">
        <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          {FILTERS.map((f) => (
            <li key={f.param} className="shrink-0">
              <Link
                href={withParams("/app/historique", { ...params, page: undefined }, { filtre: f.param === "tout" ? undefined : f.param })}
                aria-current={f.param === current.param ? "page" : undefined}
                className={cn(
                  "inline-flex h-10 items-center rounded-full border px-4 text-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/60",
                  f.param === current.param ? "border-primary bg-primary/10 font-semibold text-primary" : "bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {f.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <section aria-label={current.label}>
        {!purchases && (
          <form method="get" className="mb-3 flex flex-wrap items-end gap-3 rounded-3xl bg-card shadow-card p-3">
            {current.param !== "tout" && <input type="hidden" name="filtre" value={current.param} />}
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Du
              <input type="date" name="du" defaultValue={from} className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Au
              <input type="date" name="au" defaultValue={to} className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground" />
            </label>
            <Button type="submit" variant="outline">Filtrer</Button>
            {(from || to) && (
              <Button asChild variant="secondary">
                <Link href={withParams("/app/historique", { ...params, du: undefined, au: undefined, page: undefined })}>Réinitialiser</Link>
              </Button>
            )}
          </form>
        )}
        {payments ? <PurchasesList payments={payments.items} /> : ledger && <LedgerList page={ledger} filter={current.filter} />}
        <div className="mt-4">
          <Pager page={served.page} total={served.total} pageSize={served.pageSize} path="/app/historique" params={{ ...params, pageSize: params.pageSize }} />
        </div>
        {current.filter === "all" && (
          <p className="mt-3 text-xs text-muted-foreground">Les achats en attente ou échoués ne touchent pas vos crédits : retrouvez-les dans « Achats ».</p>
        )}
      </section>
    </div>
  );
}
