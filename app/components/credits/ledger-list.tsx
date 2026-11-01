"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import type { LedgerPage } from "@yamboka/shared";
import { ArrowDownLeft, ArrowUpRight, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiGet } from "@/lib/api-client";
import { formatDateTime, formatNumber } from "@/lib/format";
import { LEDGER_LABELS } from "./labels";

/** Historique des mouvements du registre de crédits (UF-61), du plus récent au plus ancien : ajouts en vert, consommations en rouge. */
export function LedgerList() {
  const query = useInfiniteQuery({
    queryKey: ["ledger"],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => apiGet<LedgerPage>(`/credits/ledger?limit=10${pageParam ? `&cursor=${pageParam}` : ""}`),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  if (query.isPending) {
    return (
      <p role="status" className="text-muted-foreground">
        Chargement de l’historique…
      </p>
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
    return <p className="rounded-xl border bg-card p-6 text-center text-muted-foreground">Aucun mouvement pour le moment.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border bg-card">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Historique des mouvements de crédits</caption>
          <thead className="border-b bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th scope="col" className="hidden px-4 py-2.5 font-semibold sm:table-cell">Date</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Mouvement</th>
              <th scope="col" className="px-4 py-2.5 text-right font-semibold">Crédits</th>
            </tr>
          </thead>
          <tbody>
            {items.map((e) => {
              const added = e.amount > 0;
              const spent = e.amount < 0;
              return (
                <tr key={e.id} className="border-b last:border-0">
                  <td className="hidden whitespace-nowrap px-4 py-3 text-muted-foreground sm:table-cell">{formatDateTime(e.createdAt)}</td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2.5">
                      <span aria-hidden className={`grid size-7 shrink-0 place-items-center rounded-full ${added ? "bg-success/15 text-success" : spent ? "bg-destructive/12 text-destructive" : "bg-muted text-muted-foreground"}`}>
                        {added ? <ArrowDownLeft className="size-3.5" /> : spent ? <ArrowUpRight className="size-3.5" /> : <Minus className="size-3.5" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-medium">{LEDGER_LABELS[e.type]}</span>
                        {e.note && e.note !== LEDGER_LABELS[e.type] && <span className="block truncate text-xs text-muted-foreground">{e.note}</span>}
                        <span className="block text-xs text-muted-foreground sm:hidden">{formatDateTime(e.createdAt)}</span>
                        {e.expiresAt && (
                          <span className="block text-xs text-muted-foreground">
                            Valables jusqu’au {new Date(e.expiresAt).toLocaleDateString("fr-FR", { timeZone: "Africa/Brazzaville" })}
                          </span>
                        )}
                      </span>
                    </span>
                  </td>
                  <td className={`whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums ${added ? "text-success" : spent ? "text-destructive" : "text-muted-foreground"}`}>
                    {e.amount === 0 ? "—" : `${added ? "+" : "−"}${formatNumber(Math.abs(e.amount))}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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
