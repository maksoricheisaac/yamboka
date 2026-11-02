"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import type { CreationPage } from "@yamboka/shared";
import { Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { CreationCard } from "./creation-card";

type Filter = "all" | "ready" | "running" | "failed";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Toutes" },
  { value: "ready", label: "Prêtes" },
  { value: "running", label: "En cours" },
  { value: "failed", label: "Échecs" },
];

const EMPTY: Record<Filter, string> = {
  all: "Vous n’avez pas encore de création.",
  ready: "Aucune création prête pour le moment.",
  running: "Aucune création en cours.",
  failed: "Aucun échec : tout s’est bien passé.",
};

/**
 * Galerie des créations : filtre par statut, chargement par pages (« Voir plus ») et actualisation automatique
 * tant qu'une création est en cours. `compact` : les dernières créations seulement, sans filtre (tableau de bord).
 */
export function CreationsGallery({ compact = false }: { compact?: boolean }) {
  const [filter, setFilter] = useState<Filter>("all");
  const limit = compact ? 4 : 12;

  const query = useInfiniteQuery({
    queryKey: ["creations", compact ? "latest" : filter],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (!compact && filter !== "all") params.set("status", filter);
      if (pageParam) params.set("cursor", pageParam);
      return apiGet<CreationPage>(`/creations?${params}`);
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval: (q) => {
      const running = q.state.data?.pages.some((p) => p.items.some((i) => i.status === "PENDING" || i.status === "PROCESSING"));
      return running ? 4000 : false;
    },
  });

  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="space-y-5">
      {!compact && (
        <div role="group" aria-label="Filtrer les créations" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "h-10 shrink-0 rounded-full border px-4 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/60",
                filter === f.value ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {query.isPending && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-busy="true" aria-label="Chargement des créations">
          {Array.from({ length: compact ? 4 : 8 }, (_, i) => (
            <Skeleton key={i} className="aspect-[4/5] rounded-2xl" />
          ))}
        </div>
      )}

      {query.isError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription className="flex flex-wrap items-center gap-3">
            Impossible de charger vos créations.
            <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
              Réessayer
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {query.isSuccess && items.length === 0 && (
        <div className="grid place-items-center gap-3 rounded-3xl border border-dashed bg-card/60 px-6 py-14 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="size-6" aria-hidden />
          </span>
          <p className="font-medium">{EMPTY[compact ? "all" : filter]}</p>
          {(compact || filter === "all") && (
            <Button asChild>
              <Link href="/app/creer">Créer ma première création</Link>
            </Button>
          )}
        </div>
      )}

      {items.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {items.map((c, i) => (
            <li key={c.id}>
              <CreationCard creation={c} priority={i < 4} />
            </li>
          ))}
        </ul>
      )}

      {!compact && query.hasNextPage && (
        <div className="flex justify-center">
          <Button variant="outline" size="lg" onClick={() => void query.fetchNextPage()} disabled={query.isFetchingNextPage}>
            {query.isFetchingNextPage ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Voir plus
          </Button>
        </div>
      )}
    </div>
  );
}
