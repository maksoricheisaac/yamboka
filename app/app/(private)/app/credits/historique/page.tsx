import { Coins } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { LedgerFilter, PaymentView } from "@yamboka/shared";
import { LedgerList } from "@/components/credits/ledger-list";
import { PurchasesList } from "@/components/credits/purchases-list";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { formatNumber } from "@/lib/format";
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

export default async function HistoryPage({ searchParams }: PageProps<"/app/credits/historique">) {
  const user = await requireUser();
  const sp = await searchParams;
  const current = FILTERS.find((f) => f.param === sp.filtre) ?? FILTERS[0];
  // Les achats se lisent dans la liste des paiements (états en attente et échecs compris) ; le reste dans le registre.
  const payments = current.filter === "purchases" ? (await serverGet<{ payments: PaymentView[] }>("/payments")).payments : null;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Historique</h1>
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
                href={f.param === "tout" ? "/app/credits/historique" : `/app/credits/historique?filtre=${f.param}`}
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
        {payments ? <PurchasesList payments={payments} /> : <LedgerList filter={current.filter} />}
        {current.filter === "all" && (
          <p className="mt-3 text-xs text-muted-foreground">Les achats en attente ou échoués ne touchent pas vos crédits : retrouvez-les dans « Achats ».</p>
        )}
      </section>
    </div>
  );
}
