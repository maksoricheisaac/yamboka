import { Download } from "lucide-react";
import type { Metadata } from "next";
import type { CalibrationRow, FinanceSummary, PayoutRow, ProviderBalanceRow, TopUpRow } from "@yamboka/shared";
import { ActionDialog } from "@/components/admin/action-dialog";
import { CalibrationsTable, PayoutsTable, TopUpsTable } from "@/components/admin/finance-tables";
import { Empty, FilterBar, FilterDateRange, PageHeader, Pill, flat } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { formatFcfa, formatNumber } from "@/lib/format";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Synthèse financière — Administration" };

export default async function FinancesPage({ searchParams }: PageProps<"/admin/finances">) {
  await requireUser({ role: "ADMIN" });
  const sp = flat(await searchParams);
  const qs = new URLSearchParams();
  if (sp.from) qs.set("from", sp.from);
  if (sp.to) qs.set("to", sp.to);
  const query = qs.toString() ? `?${qs.toString()}` : "";
  const [s, topUps, payouts, calibrations, balance] = await Promise.all([
    serverGet<FinanceSummary>(`/admin/finance/summary${query}`),
    serverGet<TopUpRow[]>("/admin/finance/topups"),
    serverGet<PayoutRow[]>("/admin/finance/payouts"),
    serverGet<CalibrationRow[]>("/admin/finance/calibrations"),
    serverGet<ProviderBalanceRow>("/admin/finance/provider-balance"),
  ]);

  const rows: [string, string][] = [
    ["Encaissé (paiements réussis)", `${formatFcfa(s.collectedFcfa)} · ${s.paymentsCount} paiement(s)`],
    ["Crédits vendus", formatNumber(s.creditsSold)],
    ["Crédits consommés (net)", formatNumber(s.creditsConsumed)],
    ["Recharges Higgsfield", `${formatNumber(s.topUpsUsd)} $ · ${formatFcfa(s.topUpsXaf)}`],
    ["Retraits SasPay", `${formatFcfa(s.payoutsXaf)} · commission ${formatFcfa(s.payoutCommissionXaf)}`],
    [
      "Crédits offerts (bonus)",
      s.bonusCreditsGranted > 0
        ? `${formatNumber(s.bonusCreditsGranted)} crédits · coût ${formatFcfa(s.bonusCostFcfa)} (${s.bonusCostPercentOfCollected} % de l’encaissé)`
        : "Aucun sur la période",
    ],
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Synthèse financière"
        actions={
          <Button asChild variant="outline">
            <a href={`/api/admin/finance/export.csv${query}`}><Download aria-hidden /> Exporter les paiements (CSV)</a>
          </Button>
        }
      />
      <FilterBar reset="/admin/finances">
        <FilterDateRange from={sp.from ?? s.from} to={sp.to ?? s.to} />
      </FilterBar>

      <dl className="divide-y rounded-3xl bg-card shadow-card">
        {rows.map(([k, v]) => (
          <div key={k} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
            <dt className="text-sm text-muted-foreground">{k}</dt>
            <dd className="font-heading text-lg font-bold">{v}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="solde-fournisseur" className="space-y-3">
        <h2 id="solde-fournisseur" className="text-xl font-bold">Solde du fournisseur</h2>
        <dl className="divide-y rounded-3xl bg-card shadow-card">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
            <dt className="text-sm text-muted-foreground">Solde estimé (journal)</dt>
            <dd className="font-heading text-lg font-bold">{balance.balanceUsd} $</dd>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
            <dt className="text-sm text-muted-foreground">Dont engagé par des créations en cours</dt>
            <dd className="font-heading text-lg font-bold">{balance.reservedUsd} $</dd>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
            <dt className="text-sm text-muted-foreground">Taux sortant retenu pour tarifer</dt>
            <dd className="flex items-center gap-2 font-heading text-lg font-bold">
              {balance.pricingRate} F/$
              {balance.measured ? null : <Pill tone="warn">Non mesuré</Pill>}
            </dd>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
            <dt className="text-sm text-muted-foreground">Dernier relevé en console</dt>
            <dd className="font-heading text-lg font-bold">
              {balance.lastCalibrationAt
                ? `${balance.lastCalibrationAt.slice(0, 10)} · écart ${balance.lastCalibrationDeltaUsd} $`
                : "Jamais relevé"}
            </dd>
          </div>
        </dl>
        {balance.measured ? null : (
          <p className="text-sm text-muted-foreground">
            Aucune recharge mesurée : le taux affiché est provisoire (taux carte alourdi de la perte de circuit
            estimée). Saisissez une recharge réelle avec les FCFA nets retirés et les dollars reçus pour le
            remplacer par une mesure.
          </p>
        )}
      </section>

      <section aria-labelledby="releves" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="releves" className="text-xl font-bold">Relevés du solde (calibrage)</h2>
          <ActionDialog
            trigger="Saisir un relevé"
            triggerVariant="default"
            title="Solde lu dans la console du fournisseur"
            withReason={false}
            endpoint="/admin/finance/calibrations"
            fields={[
              { name: "readUsd", label: "Solde lu (USD)", type: "text", hint: "Tel qu'affiché dans Billing, par exemple 18.40." },
              { name: "readAt", label: "Date de la lecture", type: "date" },
              { name: "note", label: "Note (facultatif)", type: "text" },
            ]}
            submitLabel="Enregistrer"
          />
        </div>
        {calibrations.length === 0 ? <Empty title="Aucun relevé saisi" /> : (
          <CalibrationsTable calibrations={calibrations} />
        )}
      </section>

      <section aria-labelledby="recharges" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="recharges" className="text-xl font-bold">Recharges du fournisseur</h2>
          <ActionDialog
            trigger="Saisir une recharge"
            triggerVariant="default"
            title="Recharge Higgsfield"
            withReason={false}
            endpoint="/admin/finance/topups"
            fields={[
              { name: "receivedUsd", label: "Dollars reçus chez le fournisseur", type: "text", hint: "Lu dans sa console, par exemple 20.50." },
              { name: "netWithdrawnXaf", label: "FCFA nets retirés de SasPay", type: "number", hint: "Ce qui est RÉELLEMENT sorti du portefeuille, frais de retrait déduits." },
              { name: "cardAmountXaf", label: "FCFA débités de la carte", type: "number" },
              { name: "occurredAt", label: "Date de la recharge", type: "date" },
              { name: "note", label: "Note (facultatif)", type: "text", hint: "Le taux sortant (r_out) est calculé et figé à l'enregistrement." },
            ]}
            submitLabel="Enregistrer"
          />
        </div>
        {topUps.length === 0 ? <Empty title="Aucune recharge saisie" /> : (
          <TopUpsTable topUps={topUps} />
        )}
      </section>

      <section aria-labelledby="retraits" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="retraits" className="text-xl font-bold">Retraits SasPay</h2>
          <ActionDialog
            trigger="Saisir un retrait"
            triggerVariant="default"
            title="Retrait SasPay"
            withReason={false}
            endpoint="/admin/finance/payouts"
            fields={[
              { name: "amountXaf", label: "Montant retiré (FCFA)", type: "number" },
              { name: "commissionXaf", label: "Commission (FCFA)", type: "number", defaultValue: 0 },
              { name: "date", label: "Date", type: "date" },
              { name: "note", label: "Note (facultatif)", type: "text" },
            ]}
            submitLabel="Enregistrer"
          />
        </div>
        {payouts.length === 0 ? <Empty title="Aucun retrait saisi" /> : (
          <PayoutsTable payouts={payouts} />
        )}
      </section>
    </div>
  );
}
