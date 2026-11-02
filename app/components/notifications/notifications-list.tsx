"use client";

import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import type { NotificationPage, NotificationView } from "@yamboka/shared";
import { BellOff, Check, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet, apiPost } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { NotificationContent } from "./notification-row";

/** Page complète des notifications : pagination progressive, marquage individuel ou global. */
export function NotificationsList() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const query = useInfiniteQuery({
    queryKey: ["notifications"],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => apiGet<NotificationPage>(`/notifications?limit=15${pageParam ? `&cursor=${pageParam}` : ""}`),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const unread = query.data?.pages[0]?.unread ?? 0;

  async function markRead(n: NotificationView) {
    setError(null);
    try {
      await apiPost(`/notifications/${n.id}/read`);
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      router.refresh();
    } catch {
      setError("Impossible de marquer la notification comme lue. Réessayez.");
    }
  }

  async function markAll() {
    setError(null);
    try {
      await apiPost("/notifications/read");
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      router.refresh();
    } catch {
      setError("Impossible de tout marquer comme lu. Réessayez.");
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {query.isPending && (
        <div className="space-y-2" aria-busy="true" aria-label="Chargement des notifications">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      )}

      {query.isError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription className="flex flex-wrap items-center gap-3">
            Impossible de charger vos notifications.
            <Button size="sm" variant="outline" onClick={() => void query.refetch()}>Réessayer</Button>
          </AlertDescription>
        </Alert>
      )}

      {query.isSuccess && items.length === 0 && (
        <p className="flex items-center justify-center gap-2 rounded-2xl border border-dashed bg-card/60 p-10 text-muted-foreground">
          <BellOff className="size-4" aria-hidden /> Aucune notification pour le moment.
        </p>
      )}

      {items.length > 0 && (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground" role="status">{unread > 0 ? `${unread} non lue${unread > 1 ? "s" : ""}` : "Tout est lu"}</p>
            {unread > 0 && <Button size="sm" variant="outline" onClick={() => void markAll()}><Check aria-hidden /> Tout marquer comme lu</Button>}
          </div>
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
            {items.map((n) => (
              <li key={n.id} className={cn("flex items-start gap-2 pr-2", !n.read && "bg-primary/5")}>
                {n.link ? (
                  <Link href={n.link} onClick={() => !n.read && void markRead(n)} className="min-w-0 flex-1 px-4 py-3 outline-none hover:bg-muted/60 focus-visible:bg-muted">
                    <NotificationContent n={n} />
                  </Link>
                ) : (
                  <div className="min-w-0 flex-1 px-4 py-3"><NotificationContent n={n} /></div>
                )}
                {!n.read && (
                  <Button size="sm" variant="ghost" className="mt-2 h-8 shrink-0 px-2 text-xs" onClick={() => void markRead(n)} aria-label={`Marquer comme lue : ${n.title}`}>
                    Marquer comme lue
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {query.hasNextPage && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => void query.fetchNextPage()} disabled={query.isFetchingNextPage}>
            {query.isFetchingNextPage && <Loader2 className="animate-spin" aria-hidden />} Voir plus
          </Button>
        </div>
      )}
    </div>
  );
}
