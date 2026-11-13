import { Download } from "lucide-react";
import type { Metadata } from "next";
import type { FinanceSummary, PayoutRow, TopUpRow } from "@yamboka/shared";
import { ActionDialog } from "@/components/admin/action-dialog";
import { PayoutsTable, TopUpsTable } from "@/components/admin/finance-tables";
import { Empty, FilterBar, FilterDateRange, PageHeader, flat } from "@/components/admin/ui";
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
  const [s, topUps, payouts] = await Promise.all([
    serverGet<FinanceSummary>(`/admin/finance/summary${query}`),
    serverGet<TopUpRow[]>("/admin/finance/topups"),
    serverGet<PayoutRow[]>("/admin/finance/payouts"),
  ]);

  const rows: [string, string][] = [
    ["Encaissé (paiements réussis)", `${formatFcfa(s.collectedFcfa)} · ${s.paymentsCount} paiement(s)`],
    ["Crédits vendus", formatNumber(s.creditsSold)],
    ["Crédits consommés (net)", formatNumber(s.creditsConsumed)],
    ["Recharges Higgsfield", `${formatNumber(s.topUpsUsd)} $ · ${formatFcfa(s.topUpsXaf)}`],
    ["Retraits SasPay", `${formatFcfa(s.payoutsXaf)} · commission ${formatFcfa(s.payoutCommissionXaf)}`],
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

      <section aria-labelledby="recharges" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="recharges" className="text-xl font-bold">Recharges Higgsfield</h2>
          <ActionDialog
            trigger="Saisir une recharge"
            triggerVariant="default"
            title="Recharge Higgsfield"
            withReason={false}
            endpoint="/admin/finance/topups"
            fields={[
              { name: "amountUsd", label: "Montant (USD)", type: "number" },
              { name: "amountXaf", label: "Coût réel (FCFA)", type: "number", hint: "Le taux de change effectif est calculé automatiquement." },
              { name: "note", label: "Note (facultatif)", type: "text" },
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
