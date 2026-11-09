import { ArrowDownLeft, ArrowUpRight, CheckCircle2, Circle, Minus, Plus, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ActivitySummary, LedgerPage } from "@yamboka/shared";
import { VerifyEmailBanner } from "@/components/auth/resend-verification";
import { LEDGER_LABELS } from "@/components/credits/labels";
import { CreationsGallery } from "@/components/creations/creations-gallery";
import { NotificationsCard, type NotificationItem } from "@/components/creations/notifications-card";
import { Button } from "@/components/ui/button";
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

function rise(n: number) {
  return { animationDelay: `${n * 70}ms` };
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

  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      {!user.emailVerified && <VerifyEmailBanner email={user.email} />}

      <section
        aria-labelledby="balance-title"
        style={rise(0)}
        className="animate-rise relative overflow-hidden rounded-[2rem] bg-linear-to-br from-primary/12 via-card to-card p-6 shadow-card sm:p-8"
      >
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-accent/25 blur-3xl" />
        <h1 id="balance-title" className="text-label relative">Bonjour {user.firstName}</h1>
        <div className="relative mt-3 flex flex-wrap items-end justify-between gap-x-8 gap-y-6">
          <div>
            <p className="text-display flex items-baseline gap-3 tabular-nums">
              {formatNumber(user.credits)}
              <span className="text-heading text-muted-foreground">{user.credits > 1 ? "crédits" : "crédit"}</span>
            </p>
            <p className="mt-2 text-sm text-muted-foreground">≈ {formatMoney(user.credits * user.creditValueFcfa, "XAF")} de création</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="lg" className="h-12 rounded-full px-6 shadow-float">
              <Link href="/app/creer">
                <Sparkles aria-hidden /> Créer une vidéo
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 rounded-full bg-card/60 px-5 backdrop-blur">
              <Link href="/app/credits">
                <Plus aria-hidden /> Recharger
              </Link>
            </Button>
          </div>
        </div>
        <p className="text-label relative mt-6 tabular-nums">
          {formatNumber(summary.generationsTotal)} {summary.generationsTotal > 1 ? "créations" : "création"} · {formatNumber(summary.generations30d)} ce mois-ci · {formatNumber(summary.creditsSpent30d)} crédits dépensés sur 30 jours
        </p>
      </section>

      {onboarding && (
        <section aria-labelledby="start-title" style={rise(1)} className="animate-rise rounded-3xl bg-card p-5 shadow-card sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 id="start-title" className="text-heading">Pour démarrer</h2>
            <p className="text-label tabular-nums">{doneCount} / {steps.length}</p>
          </div>
          <div aria-hidden className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
          </div>
          <ol className="mt-3 space-y-0.5">
            {steps.map((s) => (
              <li key={s.label}>
                {!s.done ? (
                  <Link href={s.href} className="group flex min-h-11 items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-muted active:bg-muted/70">
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
        </section>
      )}

      <section aria-labelledby="latest-title" style={rise(2)} className="animate-rise space-y-4">
        <div className="flex items-end justify-between gap-3">
          <h2 id="latest-title" className="text-title">Mes dernières créations</h2>
          <Link href="/app/creations" className="text-sm font-medium text-primary underline-offset-4 hover:underline">Tout voir</Link>
        </div>
        <CreationsGallery compact />
      </section>

      <div style={rise(3)} className="animate-rise grid gap-8 lg:grid-cols-5">
        <section aria-labelledby="tx-title" className="space-y-4 lg:col-span-3">
          <div className="flex items-end justify-between gap-3">
            <h2 id="tx-title" className="text-heading">Dernières transactions</h2>
            <Link href="/app/historique" className="text-sm font-medium text-primary underline-offset-4 hover:underline">Tout l’historique</Link>
          </div>
          {ledger.items.length === 0 ? (
            <div className="space-y-3 rounded-3xl bg-card p-6 text-center shadow-card">
              <p className="text-muted-foreground">Aucune transaction pour le moment.</p>
              <Button asChild variant="outline" className="rounded-full">
                <Link href="/app/credits">Acheter des crédits</Link>
              </Button>
            </div>
          ) : (
            <ul className="divide-y overflow-hidden rounded-3xl bg-card shadow-card">
              {ledger.items.map((e) => {
                const added = e.amount > 0;
                const spent = e.amount < 0;
                return (
                  <li key={e.id} className="flex items-center gap-3 px-4 py-3.5">
                    <span aria-hidden className={`grid size-9 shrink-0 place-items-center rounded-full ${added ? "bg-success/15 text-success" : spent ? "bg-destructive/12 text-destructive" : "bg-muted text-muted-foreground"}`}>
                      {added ? <ArrowDownLeft className="size-4" /> : spent ? <ArrowUpRight className="size-4" /> : <Minus className="size-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{LEDGER_LABELS[e.type]}</span>
                      <span className="text-label block">{formatDateTime(e.createdAt)}</span>
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
        <div className="lg:col-span-2">
          <NotificationsCard items={notifications.items} unread={notifications.unread} />
        </div>
      </div>
    </div>
  );
}
