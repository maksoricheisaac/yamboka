import type { Metadata } from "next";
import Link from "next/link";
import { NotificationsList } from "@/components/notifications/notifications-list";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  await requireUser();
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-3xl font-bold">Notifications</h1>
        <p className="mt-1 text-muted-foreground">Créations prêtes, paiements, remboursements. Réglez les e-mails dans les <Link href="/app/parametres" className="font-medium text-primary underline underline-offset-4">paramètres</Link>.</p>
      </div>
      <NotificationsList />
    </div>
  );
}
