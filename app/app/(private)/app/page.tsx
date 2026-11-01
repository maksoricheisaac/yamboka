import { ArrowRight, CheckCircle2, Circle, Coins } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { CreationKind, StyleView } from "@yamboka/shared";
import { VerifyEmailBanner } from "@/components/auth/resend-verification";
import { CreationsGallery } from "@/components/creations/creations-gallery";
import { NotificationsCard, type NotificationItem } from "@/components/creations/notifications-card";
import { CreditReel } from "@/components/studio/credit-reel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { KINDS, KIND_ORDER, credits } from "@/lib/creations";
import { formatFcfa } from "@/lib/format";
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
  const [{ styles }, notifications] = await Promise.all([
    serverGet<{ styles: StyleView[] }>("/creations/styles"),
    serverGet<{ unread: number; items: NotificationItem[] }>("/notifications"),
  ]);
  const from = (k: CreationKind) => {
    const costs = styles.filter((s) => s.kind === k).map((s) => s.credits);
    return costs.length ? Math.min(...costs) : null;
  };
  const steps = [
    { label: user.emailVerified ? "Adresse e-mail confirmée" : "Confirmer mon adresse e-mail", done: user.emailVerified, href: "/verifier-email", cta: "Confirmer" },
    { label: "Acheter des crédits", done: user.credits > 0, href: "/app/credits", cta: "Acheter" },
    { label: "Ajouter mon numéro de téléphone (facultatif)", done: !!user.phone, href: "/app/profil", cta: "Ajouter" },
  ];
  const onboarding = steps.some((s) => !s.done);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Bonjour {user.firstName}</h1>
        <p className="mt-1 text-muted-foreground">Que voulez-vous créer aujourd’hui ?</p>
      </div>

      {!user.emailVerified && <VerifyEmailBanner email={user.email} />}

      <section aria-labelledby="create-title" className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="space-y-3">
          <h2 id="create-title" className="sr-only">Créer</h2>
          <ul className="grid gap-3 sm:grid-cols-3">
            {KIND_ORDER.map((k, i) => {
              const Icon = KINDS[k].icon;
              const price = from(k);
              return (
                <li key={k}>
                  <Link
                    href={`/app/creer?type=${k}`}
                    className={`group relative flex h-full min-h-36 flex-col justify-between gap-6 overflow-hidden rounded-3xl border p-5 shadow-soft outline-none transition-[transform,box-shadow] hover:-translate-y-0.5 focus-visible:ring-3 focus-visible:ring-ring/70 motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${i === 0 ? "bg-primary text-primary-foreground" : "bg-card"}`}
                  >
                    <span className={`grid size-11 place-items-center rounded-2xl ${i === 0 ? "bg-primary-foreground/15" : "bg-primary/10 text-primary"}`}>
                      <Icon className="size-6" aria-hidden />
                    </span>
                    <span>
                      <span className="block font-heading text-xl font-bold leading-tight">{KINDS[k].label}</span>
                      <span className={`mt-1 block text-sm ${i === 0 ? "text-primary-foreground/85" : "text-muted-foreground"}`}>{KINDS[k].hint}</span>
                      <span className="mt-3 flex items-center justify-between text-sm font-semibold">
                        <span>{price === null ? "Bientôt" : `Dès ${credits(price)}`}</span>
                        <ArrowRight className="size-4 transition-transform group-hover:translate-x-1 motion-reduce:transition-none" aria-hidden />
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        <Card className="lg:row-span-1">
          <CardHeader className="pb-0">
            <CardDescription className="flex items-center gap-2">
              <Coins className="size-4" aria-hidden /> Votre solde
            </CardDescription>
            <CardTitle className="sr-only">{user.credits} crédits</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-center text-sm text-muted-foreground">
            <CreditReel credits={user.credits} className="w-32 sm:w-36" />
            <p>≈ {formatFcfa(user.credits * user.creditValueFcfa)}</p>
            <Button asChild className="w-full">
              <Link href="/app/credits">Recharger</Link>
            </Button>
          </CardContent>
        </Card>
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
