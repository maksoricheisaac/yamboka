import { CheckCircle2, Circle, Coins } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { CreationConfig, StyleView } from "@yamboka/shared";
import { VerifyEmailBanner } from "@/components/auth/resend-verification";
import { CreationsGallery } from "@/components/creations/creations-gallery";
import { NotificationsCard, type NotificationItem } from "@/components/creations/notifications-card";
import { Studio } from "@/components/creations/studio";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { formatFcfa, formatNumber } from "@/lib/format";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Tableau de bord" };

function StepIcon({ done }: { done: boolean }) {
  return done ? (
    <CheckCircle2 className="size-5 shrink-0 text-success" aria-label="Fait" />
  ) : (
    <Circle className="size-5 shrink-0 text-muted-foreground/60" aria-label="À faire" />
  );
}

export default async function DashboardPage() {
  const user = await requireUser();
  const [{ styles }, config, notifications] = await Promise.all([
    serverGet<{ styles: StyleView[] }>("/creations/styles"),
    serverGet<CreationConfig>("/creations/config"),
    serverGet<{ unread: number; items: NotificationItem[] }>("/notifications"),
  ]);
  const steps = [
    { label: user.emailVerified ? "Adresse e-mail confirmée" : "Confirmer mon adresse e-mail", done: user.emailVerified, href: "/verifier-email", cta: "Confirmer" },
    { label: "Acheter des crédits", done: user.credits > 0, href: "/app/credits", cta: "Acheter" },
    { label: "Ajouter mon numéro de téléphone (facultatif)", done: !!user.phone, href: "/app/profil", cta: "Ajouter" },
  ];
  const onboarding = steps.some((s) => !s.done);

  return (
    <div className="space-y-10">
      {!user.emailVerified && <VerifyEmailBanner email={user.email} />}

      {/* Accueil : on arrive directement sur la création, comme dans un chat. */}
      <section aria-labelledby="create-title" className="mx-auto w-full max-w-3xl space-y-6 pt-4 sm:pt-10">
        <div className="space-y-1 text-center">
          <p className="text-sm text-muted-foreground">Bonjour {user.firstName}</p>
          <h1 id="create-title" className="font-heading text-3xl font-bold sm:text-4xl">Quelle vidéo voulez-vous créer ?</h1>
        </div>
        <Studio styles={styles} config={config} balance={user.credits} emailVerified={user.emailVerified} initialStyleId={null} initialPrompt="" />
        <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Coins className="size-4" aria-hidden /> {formatNumber(user.credits)} {user.credits > 1 ? "crédits" : "crédit"} · ≈ {formatFcfa(user.credits * user.creditValueFcfa)}
          </span>
          <Link href="/app/credits" className="font-medium text-primary underline-offset-4 hover:underline">Recharger</Link>
        </p>
      </section>

      <section aria-labelledby="latest-title" className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <h2 id="latest-title" className="text-2xl font-bold">Mes dernières créations</h2>
          <Link href="/app/creations" className="text-sm font-medium text-primary underline-offset-4 hover:underline">Tout voir</Link>
        </div>
        <CreationsGallery compact />
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <NotificationsCard items={notifications.items} unread={notifications.unread} />
        {onboarding && (
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Pour démarrer</CardTitle>
              <CardDescription>Quelques étapes avant votre première création.</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="space-y-1">
                {steps.map((s) => (
                  <li key={s.label}>
                    {!s.done ? (
                      <Link href={s.href} className="group flex min-h-11 items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-muted">
                        <StepIcon done={false} />
                        <span className="flex-1">{s.label}</span>
                        <span className="text-sm font-medium text-primary group-hover:underline">{s.cta}</span>
                      </Link>
                    ) : (
                      <div className="flex min-h-11 items-center gap-3 px-2 py-1.5">
                        <StepIcon done />
                        <span className="flex-1 text-muted-foreground line-through">{s.label}</span>
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
