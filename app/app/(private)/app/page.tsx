import { ArrowDownLeft, ArrowUpRight, CheckCircle2, Circle, Clapperboard, Coins, Minus, Plus, Sparkles, TrendingDown } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ActivitySummary, LedgerPage } from "@yamboka/shared";
import { VerifyEmailBanner } from "@/components/auth/resend-verification";
import { LEDGER_LABELS } from "@/components/credits/labels";
import { CreationsGallery } from "@/components/creations/creations-gallery";
import { NotificationsCard, type NotificationItem } from "@/components/creations/notifications-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Tableau de bord" };

function StepIcon({ done }: { done: boolean }) {
  return done ? (
    <CheckCircle2 className="size-5 shrink-0 text-success" aria-label="Fait" />
  ) : (
    <Circle className="size-5 shrink-0 text-muted-foreground/60" aria-label="À faire" />
  );
}

function Stat({ icon: Icon, label, value, hint }: { icon: typeof Clapperboard; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="size-4" aria-hidden /> {label}
      </p>
      <p className="mt-1 font-heading text-2xl font-bold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * Tableau de bord : une synthèse de l'activité du compte (solde, chiffres du mois, dernières créations et
 * transactions). On n'y crée rien : la création vit dans « Créer », l'unique espace de génération.
 */
export default async function DashboardPage() {
  const user = await requireUser();
  const [summary, ledger, notifications] = await Promise.all([
    serverGet<ActivitySummary>("/credits/summary"),
    serverGet<LedgerPage>("/credits/ledger?pageSize=5"),
    serverGet<{ unread: number; items: NotificationItem[] }>("/notifications"),
  ]);
  const steps = [
    { label: user.emailVerified ? "Adresse e-mail confirmée" : "Confirmer mon adresse e-mail", done: user.emailVerified, href: "/verifier-email", cta: "Confirmer" },
    { label: "Acheter des crédits", done: user.credits > 0, href: "/app/credits", cta: "Acheter" },
    { label: "Ajouter mon numéro de téléphone (facultatif)", done: !!user.phone, href: "/app/parametres?onglet=profil", cta: "Ajouter" },
  ];
  const onboarding = steps.some((s) => !s.done);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {!user.emailVerified && <VerifyEmailBanner email={user.email} />}

      <section aria-labelledby="balance-title" className="rounded-3xl border bg-card p-5 sm:p-6">
        <h1 id="balance-title" className="text-lg font-semibold text-muted-foreground">Bonjour {user.firstName}</h1>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div>
            <p className="flex items-baseline gap-2 font-heading text-4xl font-bold tabular-nums sm:text-5xl">
              <Coins className="size-7 self-center text-primary" aria-hidden />
              {formatNumber(user.credits)}
              <span className="text-lg font-semibold text-muted-foreground">{user.credits > 1 ? "crédits" : "crédit"}</span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">≈ {formatMoney(user.credits * user.creditValueFcfa, "XAF")} de création</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="lg" className="h-11">
              <Link href="/app/creer">
                <Sparkles aria-hidden /> Créer une vidéo
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-11">
              <Link href="/app/credits">
                <Plus aria-hidden /> Recharger
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section aria-label="Activité du compte" className="grid grid-cols-3 gap-3">
        <Stat icon={Clapperboard} label="Créations" value={formatNumber(summary.generationsTotal)} hint="au total" />
        <Stat icon={Sparkles} label="Ce mois-ci" value={formatNumber(summary.generations30d)} hint="30 derniers jours" />
        <Stat icon={TrendingDown} label="Dépensés" value={formatNumber(summary.creditsSpent30d)} hint="crédits, 30 jours" />
      </section>

      <section aria-labelledby="latest-title" className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <h2 id="latest-title" className="text-2xl font-bold">Mes dernières créations</h2>
          <Link href="/app/creations" className="text-sm font-medium text-primary underline-offset-4 hover:underline">Tout voir</Link>
        </div>
        <CreationsGallery compact />
      </section>

      <section aria-labelledby="tx-title" className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <h2 id="tx-title" className="text-2xl font-bold">Dernières transactions</h2>
          <Link href="/app/historique" className="text-sm font-medium text-primary underline-offset-4 hover:underline">Tout l’historique</Link>
        </div>
        {ledger.items.length === 0 ? (
          <div className="space-y-3 rounded-2xl border bg-card p-6 text-center">
            <p className="text-muted-foreground">Aucune transaction pour le moment.</p>
            <Button asChild variant="outline">
              <Link href="/app/credits">Acheter des crédits</Link>
            </Button>
          </div>
        ) : (
          <ul className="divide-y rounded-2xl border bg-card">
            {ledger.items.map((e) => {
              const added = e.amount > 0;
              const spent = e.amount < 0;
              return (
                <li key={e.id} className="flex items-center gap-3 px-4 py-3">
                  <span aria-hidden className={`grid size-8 shrink-0 place-items-center rounded-full ${added ? "bg-success/15 text-success" : spent ? "bg-destructive/12 text-destructive" : "bg-muted text-muted-foreground"}`}>
                    {added ? <ArrowDownLeft className="size-4" /> : spent ? <ArrowUpRight className="size-4" /> : <Minus className="size-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{LEDGER_LABELS[e.type]}</span>
                    <span className="block text-xs text-muted-foreground">{formatDateTime(e.createdAt)}</span>
                  </span>
                  <span className={`shrink-0 font-semibold tabular-nums ${added ? "text-success" : spent ? "text-destructive" : "text-muted-foreground"}`}>
                    {e.amount === 0 ? "—" : `${added ? "+" : "−"}${formatNumber(Math.abs(e.amount))}`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
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
