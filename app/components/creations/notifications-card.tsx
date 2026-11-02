"use client";

import { Bell, BellOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiPost } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

/** Dernières notifications (création prête, échec remboursé…). « Tout marquer comme lu » vide le compteur. */
export function NotificationsCard({ items, unread }: { items: NotificationItem[]; unread: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [cleared, setCleared] = useState(false);
  const count = cleared ? 0 : unread;

  async function markRead() {
    setBusy(true);
    try {
      await apiPost("/notifications/read");
      setCleared(true);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-xl">
          <Bell className="size-5 text-primary" aria-hidden /> Notifications
          {count > 0 && <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-accent-foreground">{count}</span>}
        </CardTitle>
        {count > 0 && (
          <Button size="sm" variant="ghost" onClick={() => void markRead()} disabled={busy}>
            Tout marquer comme lu
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <BellOff className="size-4" aria-hidden /> Rien de nouveau pour le moment.
          </p>
        ) : (
          <ul className="divide-y">
            {items.slice(0, 4).map((n) => {
              const body = (
                <>
                  <span className={`block text-sm ${n.read || cleared ? "font-medium" : "font-bold"}`}>{n.title}</span>
                  <span className="block text-sm text-muted-foreground">{n.body}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{formatDateTime(n.createdAt)}</span>
                </>
              );
              return (
                <li key={n.id}>
                  {n.link ? (
                    <Link href={n.link} className="block rounded-lg px-1 py-2.5 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/60">
                      {body}
                    </Link>
                  ) : (
                    <div className="px-1 py-2.5">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
