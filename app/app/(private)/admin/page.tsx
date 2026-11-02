import { AlertTriangle, Info, OctagonAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { AdminStats } from "@yamboka/shared";
import { Bars } from "@/components/admin/bars";
import { PageHeader } from "@/components/admin/ui";
import { PeriodPicker } from "@/components/admin/period-picker";
import { requireUser } from "@/lib/auth";
import { formatFcfa, formatNumber } from "@/lib/format";
import { formatDay, isIsoDate, presetRange } from "@/lib/period";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Tableau de bord — Administration" };

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="space-y-0.5 border-l-2 border-primary/40 pl-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="font-heading text-2xl font-bold">{value}</dd>
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
        description={`Activité du ${formatDay(requested.from)} au ${formatDay(requested.to)}. Les chiffres viennent directement de la base de données.`}
      />
      <PeriodPicker from={requested.from} to={requested.to} />

      <section aria-labelledby="alertes" className="space-y-3">
        <h2 id="alertes" className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Alertes opérationnelles</h2>
        {s.alerts.length === 0 ? (
          <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">Aucune alerte : paiements, marges et fournisseurs sont dans les seuils.</p>
        ) : (
          <ul className="space-y-2">
            {s.alerts.map((a) => {
              const Icon = a.level === "critical" ? OctagonAlert : a.level === "warning" ? AlertTriangle : Info;
              return (
                <li key={a.key} className={`flex items-start gap-3 rounded-xl border p-3 text-sm ${a.level === "critical" ? "border-destructive/50 bg-destructive/5" : a.level === "warning" ? "border-accent bg-accent/15" : "bg-card"}`}>
                  <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span className="flex-1">{a.message}</span>
                  {a.href && (
                    <Link href={a.href} className="shrink-0 font-medium text-primary underline underline-offset-4">
                      Voir
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="activite" className="space-y-4">
        <h2 id="activite" className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Activité</h2>
        <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
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
        <h2 id="generations" className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Générations</h2>
        {noGenerations ? (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            Aucune génération sur la période.
          </p>
        ) : (
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-4">
            <Kpi label="En attente" value={formatNumber(gen.pending)} />
            <Kpi label="En cours" value={formatNumber(gen.processing)} />
            <Kpi label="Réussies" value={formatNumber(gen.completed)} />
            <Kpi label="Échouées" value={formatNumber(gen.failed)} />
          </dl>
        )}
      </section>

      <section aria-labelledby="fournisseur" className="space-y-3">
        <h2 id="fournisseur" className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Solde fournisseur Higgsfield (estimation)</h2>
        {s.providerBalance.known ? (
          <>
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-3">
              <Kpi label="Recharges saisies" value={`${formatNumber(s.providerBalance.topUpsUsd)} $`} />
              <Kpi label="Coût estimé consommé" value={`${formatNumber(s.providerBalance.estimatedConsumedUsd)} $`} />
              <Kpi label="Solde estimé" value={`${formatNumber(s.providerBalance.estimatedBalanceUsd)} $`} />
            </dl>
            <p className="text-xs text-muted-foreground">Estimation : recharges saisies moins le coût fournisseur des générations non échouées. Ce n’est pas le solde réel du compte Higgsfield.</p>
          </>
        ) : (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            Non calculable : aucune recharge n’a été saisie. <Link href="/admin/finances" className="font-medium text-primary underline underline-offset-4">Saisir une recharge</Link>.
          </p>
        )}
      </section>
    </div>
  );
}
