import { AlertTriangle, Info, OctagonAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { AdminStats } from "@yamboka/shared";
import { Bars } from "@/components/admin/bars";
import { PageHeader } from "@/components/admin/ui";
import { PeriodPicker } from "@/components/admin/period-picker";
import { requireUser } from "@/lib/auth";
import { formatFcfa, formatNumber } from "@/lib/format";
import { isIsoDate, presetRange } from "@/lib/period";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Tableau de bord — Administration" };

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="space-y-1 rounded-3xl bg-card p-5 shadow-card">
      <dt className="text-label">{label}</dt>
      <dd className="font-heading text-2xl font-bold tracking-tight tabular-nums">{value}</dd>
      {hint && <dd className="text-xs text-muted-foreground">{hint}</dd>}
    </div>
  );
}

export default async function AdminHomePage({ searchParams }: PageProps<"/admin">) {
  await requireUser({ role: "ADMIN" });
  const sp = await searchParams;
  // Période dans l'URL (?from=&to=, jours de Brazzaville). Par défaut ou si invalide : 30 derniers jours.
  const requested = isIsoDate(sp.from) && isIsoDate(sp.to) && sp.from <= sp.to ? { from: sp.from, to: sp.to } : presetRange("30d");
  const s = await serverGet<AdminStats>(`/admin/stats?from=${requested.from}&to=${requested.to}`);
  const gen = s.generations;
  const noGenerations = gen.pending + gen.processing + gen.completed + gen.failed === 0;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Tableau de bord"
      />
      <PeriodPicker from={requested.from} to={requested.to} />

      {s.alerts.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <span aria-hidden className="size-2 rounded-full bg-success" /> Tout est en ordre : paiements, marges et fournisseurs sont dans les seuils.
        </p>
      ) : (
        <section aria-label="Alertes opérationnelles">
          <ul className="space-y-2">
            {s.alerts.map((a) => {
              const Icon = a.level === "critical" ? OctagonAlert : a.level === "warning" ? AlertTriangle : Info;
              return (
                <li key={a.key} className={`flex items-start gap-3 rounded-2xl p-4 text-sm shadow-card ${a.level === "critical" ? "bg-destructive/8 text-destructive" : a.level === "warning" ? "bg-warning/10 text-warning" : "bg-card"}`}>
                  <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span className="flex-1 text-foreground">{a.message}</span>
                  {a.href && (
                    <Link href={a.href} className="shrink-0 font-medium text-primary underline underline-offset-4">
                      Voir
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="activite" className="space-y-4">
        <h2 id="activite" className="text-heading">Activité</h2>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Inscrits sur la période" value={formatNumber(s.users.newInPeriod)} hint={`${formatNumber(s.users.activeInPeriod)} actifs · ${formatNumber(s.users.total)} comptes au total (cumul)`} />
          <Kpi label="Chiffre d’affaires" value={formatFcfa(s.payments.revenueFcfa)} hint={`${formatNumber(s.payments.successCount)} paiement(s) réussi(s)`} />
          <Kpi label="Volume de paiements" value={formatFcfa(s.payments.volumeFcfa)} hint={`${s.payments.pendingCount} en attente · ${s.payments.failedCount} échoué(s)`} />
          <Kpi label="Crédits" value={`${formatNumber(s.credits.sold)} vendus`} hint={`${formatNumber(s.credits.consumed)} consommés`} />
        </dl>
        <div className="grid gap-6 pt-2 md:grid-cols-2">
          <Bars title="Chiffre d’affaires par jour" data={s.series.revenue} unit="FCFA" />
          <Bars title="Inscriptions par jour" data={s.series.signups} unit="inscrits" />
        </div>
      </section>

      <section aria-labelledby="generations" className="space-y-3">
        <h2 id="generations" className="text-heading">Générations</h2>
        {noGenerations ? (
          <p className="text-sm text-muted-foreground">Aucune génération sur la période.</p>
        ) : (
          <dl className="grid grid-cols-2 divide-x divide-y overflow-hidden rounded-3xl bg-card shadow-card sm:grid-cols-4 sm:divide-y-0">
            {[
              ["En attente", gen.pending],
              ["En cours", gen.processing],
              ["Réussies", gen.completed],
              ["Échouées", gen.failed],
            ].map(([label, value]) => (
              <div key={label} className="space-y-1 p-5">
                <dt className="text-label">{label}</dt>
                <dd className="text-title tabular-nums">{formatNumber(Number(value))}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className="text-sm text-muted-foreground">
          {s.providerBalance.known ? (
            <>
              Solde fournisseur estimé : <strong className="text-foreground">{formatNumber(s.providerBalance.estimatedBalanceUsd)} $</strong> ({formatNumber(s.providerBalance.topUpsUsd)} $ rechargés, {formatNumber(s.providerBalance.estimatedConsumedUsd)} $ consommés).
            </>
          ) : (
            <>
              Solde fournisseur non calculable : aucune recharge saisie. <Link href="/admin/finances" className="font-medium text-primary underline underline-offset-4">Saisir une recharge</Link>.
            </>
          )}
        </p>
      </section>
    </div>
  );
}
