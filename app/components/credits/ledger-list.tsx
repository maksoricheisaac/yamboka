"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import type { LedgerFilter, LedgerPage } from "@yamboka/shared";
import { ArrowDownLeft, ArrowUpRight, Minus, Receipt } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet } from "@/lib/api-client";
import { formatDateTime, formatNumber } from "@/lib/format";
import { LEDGER_LABELS } from "./labels";

export const EMPTY_LEDGER: Record<LedgerFilter, string> = {
  all: "Aucun mouvement pour le moment. Vos achats et vos créations apparaîtront ici.",
  purchases: "Aucun achat de crédits pour le moment.",
  generations: "Aucune création n’a encore utilisé de crédits.",
  refunds: "Aucun remboursement : les crédits d’une création échouée vous sont restitués ici.",
  bonuses: "Aucun bonus ni ajustement pour le moment.",
};

/**
 * Mouvements du registre de crédits (UF-61), du plus récent au plus ancien : ajouts en vert, consommations en rouge.
 * Une liste de cartes (et non un tableau) : lisible sur un téléphone de 360 px comme sur un grand écran.
 */
export function LedgerList({ filter = "all" }: { filter?: LedgerFilter }) {
  const query = useInfiniteQuery({
    queryKey: ["ledger", filter],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => apiGet<LedgerPage>(`/credits/ledger?limit=10&filter=${filter}${pageParam ? `&cursor=${pageParam}` : ""}`),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  if (query.isPending) {
    return (
      <div role="status" aria-label="Chargement de l’historique" className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-2xl" />
        ))}
      </div>
    );
  }
  if (query.isError) {
    return (
      <div role="alert" className="space-y-3 rounded-xl border border-destructive/40 p-4">
        <p className="font-medium text-destructive">Impossible de charger l’historique.</p>
        <Button variant="outline" onClick={() => void query.refetch()}>
          Réessayer
        </Button>
      </div>
    );
  }

  const items = query.data.pages.flatMap((p) => p.items);
  if (items.length === 0) {
    return <p className="rounded-2xl border bg-card p-6 text-center text-muted-foreground">{EMPTY_LEDGER[filter]}</p>;
  }

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {items.map((e) => {
          const added = e.amount > 0;
          const spent = e.amount < 0;
          const link = e.paymentId
            ? { href: `/app/credits/recu/${e.paymentId}`, text: "Voir le reçu" }
            : e.generationId
              ? { href: `/app/creations/${e.generationId}`, text: "Voir la création" }
              : null;
          return (
            <li key={e.id} className="flex items-center gap-3 rounded-2xl border bg-card px-3.5 py-3">
              <span aria-hidden className={`grid size-9 shrink-0 place-items-center rounded-full ${added ? "bg-success/15 text-success" : spent ? "bg-destructive/12 text-destructive" : "bg-muted text-muted-foreground"}`}>
                {e.type === "PURCHASE" ? <Receipt className="size-4" /> : added ? <ArrowDownLeft className="size-4" /> : spent ? <ArrowUpRight className="size-4" /> : <Minus className="size-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{LEDGER_LABELS[e.type]}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(e.createdAt)}
                  {e.expiresAt && <> · valables jusqu’au {new Date(e.expiresAt).toLocaleDateString("fr-FR", { timeZone: "Africa/Brazzaville" })}</>}
                </p>
                {e.note && e.note !== LEDGER_LABELS[e.type] && <p className="truncate text-xs text-muted-foreground">{e.note}</p>}
                {link && (
                  <Link href={link.href} className="text-xs font-medium text-primary underline-offset-4 hover:underline">
                    {link.text}
                  </Link>
                )}
              </div>
              <p className={`shrink-0 text-right font-semibold tabular-nums ${added ? "text-success" : spent ? "text-destructive" : "text-muted-foreground"}`}>
                {e.amount === 0 ? "—" : `${added ? "+" : "−"}${formatNumber(Math.abs(e.amount))}`}
                <span className="block text-xs font-normal text-muted-foreground">crédits</span>
              </p>
            </li>
          );
        })}
      </ul>
      {query.hasNextPage && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => void query.fetchNextPage()} disabled={query.isFetchingNextPage}>
            {query.isFetchingNextPage ? "Chargement…" : "Voir plus"}
          </Button>
        </div>
      )}
    </div>
  );
}
