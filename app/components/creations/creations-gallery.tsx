"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { CreationPage } from "@yamboka/shared";
import { Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Pager } from "@/components/pager";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet } from "@/lib/api-client";
import { readPage, readPageSize, withParams } from "@/lib/pagination";
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
 * Galerie des créations : filtre par statut, PAGINATION SERVEUR (page, taille et filtre dans l'adresse : lien
 * partageable, bouton Retour fidèle) et actualisation automatique tant qu'une création est en cours.
 * `compact` : les dernières créations seulement, sans filtre ni pager (tableau de bord).
 */
export function CreationsGallery({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const statusParam = sp.get("statut");
  const filter: Filter = FILTERS.some((f) => f.value === statusParam) ? (statusParam as Filter) : "all";
  const page = readPage(sp.get("page") ?? undefined);
  const pageSize = compact ? 4 : readPageSize(sp.get("pageSize") ?? undefined);

  const query = useQuery({
    queryKey: ["creations", compact ? "latest" : { filter, page, pageSize }],
    queryFn: () => {
      const params = new URLSearchParams({ page: compact ? "1" : String(page), pageSize: String(pageSize) });
      if (!compact && filter !== "all") params.set("status", filter);
      return apiGet<CreationPage>(`/creations?${params}`);
    },
    // Pas de page blanche entre deux pages : l'ancienne reste affichée jusqu'à l'arrivée de la nouvelle.
    placeholderData: keepPreviousData,
    refetchInterval: (q) => {
      const running = q.state.data?.items.some((i) => i.status === "PENDING" || i.status === "PROCESSING");
      return running ? 4000 : false;
    },
  });

  const items = query.data?.items ?? [];
  const params = { statut: filter === "all" ? undefined : filter, pageSize: pageSize === 20 ? undefined : String(pageSize) };

  return (
    <div className="space-y-5">
      {!compact && (
        <div role="group" aria-label="Filtrer les créations" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          {FILTERS.map((f) => (
            <Link
              key={f.value}
              href={withParams(pathname, params, { statut: f.value === "all" ? undefined : f.value, page: undefined })}
              aria-current={filter === f.value ? "true" : undefined}
              className={cn(
                "inline-flex h-10 shrink-0 items-center rounded-full border px-4 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/60",
                filter === f.value ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
              )}
            >
              {f.label}
            </Link>
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

      {!compact && query.data && (
        <Pager page={query.data.page} total={query.data.total} pageSize={query.data.pageSize} path={pathname} params={params} />
      )}
    </div>
  );
}
