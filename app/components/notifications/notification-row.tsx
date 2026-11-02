"use client";

import type { NotificationKind, NotificationView } from "@yamboka/shared";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { Bell, CheckCircle2, CircleAlert, Coins, CreditCard, RotateCcw, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS: Record<NotificationKind, { icon: LucideIcon; tone: string }> = {
  GENERATION_READY: { icon: CheckCircle2, tone: "bg-success/15 text-success" },
  GENERATION_FAILED: { icon: CircleAlert, tone: "bg-destructive/12 text-destructive" },
  CREDITS_REFUNDED: { icon: RotateCcw, tone: "bg-accent/35 text-accent-foreground" },
  PAYMENT_SUCCESS: { icon: Coins, tone: "bg-success/15 text-success" },
  PAYMENT_FAILED: { icon: CreditCard, tone: "bg-destructive/12 text-destructive" },
  DELETION_REMINDER: { icon: Bell, tone: "bg-muted text-muted-foreground" },
  MODERATION: { icon: CircleAlert, tone: "bg-accent/35 text-accent-foreground" },
  SYSTEM: { icon: Bell, tone: "bg-muted text-muted-foreground" },
};

export function ago(iso: string): string {
  return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: fr });
}

/** Contenu d'une notification (icône, titre, texte, ancienneté, point « non lue »), sans comportement : le parent fournit le lien. */
export function NotificationContent({ n }: { n: NotificationView }) {
  const { icon: Icon, tone } = ICONS[n.type] ?? ICONS.SYSTEM;
  return (
    <span className="flex items-start gap-3">
      <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-full", tone)}>
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block text-sm leading-snug", n.read ? "font-medium" : "font-bold")}>{n.title}</span>
        <span className="block text-sm leading-snug text-muted-foreground">{n.body}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{ago(n.createdAt)}</span>
      </span>
      {!n.read && <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" aria-label="Non lue" />}
    </span>
  );
}
