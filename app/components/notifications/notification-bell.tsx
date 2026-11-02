"use client";

import type { NotificationPage, NotificationView } from "@yamboka/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { apiGet, apiPost } from "@/lib/api-client";
import { NotificationContent } from "./notification-row";

const POLL_MS = 45_000;

/**
 * Cloche de la barre du haut : compteur de non lues, aperçu des notifications récentes, marquage comme lue.
 * Vit hors du fournisseur de requêtes de la page : elle interroge l'API elle-même (à l'affichage, à l'ouverture,
 * puis toutes les 45 s tant que l'onglet est visible).
 */
export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["bell"],
    queryFn: () => apiGet<NotificationPage>("/notifications?limit=6"),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
  });
  const data = query.data ?? null;
  const error = query.isError;
  const load = () => void query.refetch();
  const setData = (update: (d: NotificationPage | undefined) => NotificationPage | undefined) =>
    queryClient.setQueryData<NotificationPage>(["bell"], update);

  const unread = data?.unread ?? 0;

  async function openNotification(n: NotificationView) {
    setOpen(false);
    if (!n.read) {
      try {
        await apiPost(`/notifications/${n.id}/read`);
        setData((d) => (d ? { ...d, unread: Math.max(0, d.unread - 1), items: d.items.map((i) => (i.id === n.id ? { ...i, read: true } : i)) } : d));
      } catch {
        /* le marquage échoue sans empêcher d'ouvrir la page */
      }
    }
    if (n.link) router.push(n.link);
  }

  async function markAll() {
    try {
      await apiPost("/notifications/read");
      setData((d) => (d ? { ...d, unread: 0, items: d.items.map((i) => ({ ...i, read: true })) } : d));
    } catch {
      load();
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) load(); // données fraîches à chaque ouverture
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={unread > 0 ? `Notifications : ${unread} non lue${unread > 1 ? "s" : ""}` : "Notifications"}
          className="relative grid size-10 shrink-0 place-items-center rounded-full outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/60 data-[state=open]:bg-muted"
        >
          <Bell className="size-5" aria-hidden />
          {unread > 0 && (
            <span aria-hidden className="absolute right-0.5 top-0.5 grid min-w-4.5 place-items-center rounded-full bg-accent px-1 text-[0.65rem] font-bold leading-4.5 text-accent-foreground ring-2 ring-background">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-1.5rem))] p-0">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <p className="font-heading text-sm font-bold">Notifications</p>
          {unread > 0 && (
            <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => void markAll()}>
              Tout marquer comme lu
            </Button>
          )}
        </div>
        <div className="max-h-[22rem] overflow-y-auto">
          {!data && !error && <p role="status" className="p-4 text-sm text-muted-foreground">Chargement…</p>}
          {error && !data && (
            <div role="alert" className="space-y-2 p-4 text-sm">
              <p className="font-medium text-destructive">Impossible de charger les notifications.</p>
              <Button size="sm" variant="outline" onClick={load}>Réessayer</Button>
            </div>
          )}
          {data && data.items.length === 0 && (
            <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <BellOff className="size-4" aria-hidden /> Aucune notification pour le moment.
            </p>
          )}
          {data && data.items.length > 0 && (
            <ul className="divide-y">
              {data.items.map((n) => (
                <li key={n.id}>
                  <button type="button" onClick={() => void openNotification(n)} className="block w-full px-3 py-3 text-left outline-none hover:bg-muted focus-visible:bg-muted">
                    <NotificationContent n={n} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-t p-1.5">
          <Button asChild variant="ghost" size="sm" className="w-full">
            <Link href="/app/notifications" onClick={() => setOpen(false)}>Voir toutes les notifications</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
