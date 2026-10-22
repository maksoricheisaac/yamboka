"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import type { LedgerPage } from "@yamboka/shared";
import { Button } from "@/components/ui/button";
import { apiGet } from "@/lib/api-client";
import { formatDateTime, formatNumber } from "@/lib/format";
import { LEDGER_LABELS } from "./labels";

/** Historique complet des mouvements de crédits (UF-61), du plus récent au plus ancien. */
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
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full min-w-[28rem] text-left text-sm">
          <caption className="sr-only">Historique des mouvements de crédits</caption>
          <thead className="border-b bg-muted/60">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">Date</th>
              <th scope="col" className="px-4 py-3 font-semibold">Mouvement</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Crédits</th>
            </tr>
          </thead>
          <tbody>
            {items.map((e) => (
              <tr key={e.id} className="border-b last:border-0">
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDateTime(e.createdAt)}</td>
                <td className="px-4 py-3">
                  {LEDGER_LABELS[e.type]}
                  {e.expiresAt && (
                    <span className="block text-xs text-muted-foreground">
                      Valables jusqu’au {new Date(e.expiresAt).toLocaleDateString("fr-FR", { timeZone: "Africa/Brazzaville" })}
                    </span>
                  )}
                </td>
                <td
                  className={`whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums ${
                    e.amount > 0 ? "text-success" : e.amount < 0 ? "text-destructive" : "text-muted-foreground"
                  }`}
                >
                  {e.amount === 0 ? "—" : `${e.amount > 0 ? "+" : "−"}${formatNumber(Math.abs(e.amount))}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {query.hasNextPage && (
        <Button variant="outline" onClick={() => void query.fetchNextPage()} disabled={query.isFetchingNextPage}>
          {query.isFetchingNextPage ? "Chargement…" : "Voir plus"}
        </Button>
      )}
    </div>
  );
}
