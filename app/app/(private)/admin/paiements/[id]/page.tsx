import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { AdminPaymentDetail, AdminPaymentEventKind } from "@yamboka/shared";
import { Pill, PageHeader, StatusPill } from "@/components/admin/ui";
import { SettlePaymentDialog } from "@/components/admin/settle-payment-dialog";
import { VerifyPaymentButton } from "@/components/admin/verify-payment-button";
import { providerLabel } from "@/components/credits/labels";
import { requireUser } from "@/lib/auth";
import { formatDateTime, formatFcfa, formatMoney, formatNumber, formatPhone } from "@/lib/format";
import { serverGetOrNull } from "@/lib/server-api";

export const metadata: Metadata = { title: "Paiement — Administration" };

const KIND: Record<AdminPaymentEventKind, { tone: "neutral" | "info" | "ok" | "bad"; label: string }> = {
  created: { tone: "neutral", label: "Création" },
  webhook: { tone: "info", label: "Notification" },
  verification: { tone: "info", label: "Vérification" },
  credited: { tone: "ok", label: "Crédit" },
  failed: { tone: "bad", label: "Échec" },
  settled: { tone: "ok", label: "Régularisation" },
};

/** Conclusion d'une vérification, en français : le détail technique reste lisible dans la colonne « détail ». */
const OUTCOME: Record<string, string> = {
  success: "Succès confirmé",
  pending: "Toujours en attente",
  failed: "Échec confirmé",
  cancelled: "Annulé",
  unavailable: "Fournisseur injoignable",
  invalid_response: "Réponse inexploitable",
  amount_mismatch: "Montant incohérent",
  manual_proof: "Validation administrative sur preuve",
};

const SOURCE: Record<string, string> = {
  api: "Appel direct",
  callback: "Retour du client",
  webhook: "Notification du fournisseur",
  reconcile: "Réconciliation automatique",
  admin: "Administrateur",
};

export default async function AdminPaymentPage({ params }: PageProps<"/admin/paiements/[id]">) {
  await requireUser({ role: "ADMIN" });
  const { id } = await params;
  const p = await serverGetOrNull<AdminPaymentDetail>(`/admin/payments/${id}`);
  if (!p) notFound();
  const canVerify = p.status === "PENDING" || p.status === "INITIATED" || p.status === "FAILED";

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Paiement de ${formatFcfa(p.amount)}`}
        description={`${p.user.email} · ${p.packName} · ${providerLabel(p.provider)}`}
        actions={
          <>
            <Link href="/admin/paiements" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
              Retour au journal
            </Link>
            {canVerify && <VerifyPaymentButton id={p.id} />}
            {p.canSettle && <SettlePaymentDialog payment={p} />}
          </>
        }
      />

      {p.creditState === "NOT_CREDITED" && (
        <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm font-medium text-destructive">
          Paiement confirmé par le fournisseur mais crédits jamais attribués. Utilisez « Régulariser le paiement » :
          le fournisseur sera réinterrogé et les crédits ne peuvent être attribués qu’une seule fois.
        </p>
      )}

      {p.issue && (
        <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm font-medium text-destructive">
          {p.issue}
        </p>
      )}

      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["État", <StatusPill key="s" kind="payment" value={p.status} />],
          ["Fournisseur", `${providerLabel(p.provider)}${p.network ? ` · ${p.network}` : ""}`],
          ["Référence fournisseur", <span key="r" className="break-all font-mono text-xs">{p.externalReference ?? "—"}</span>],
          ["Numéro payeur", `${formatPhone(p.payerPhone)} (${p.operator})`],
          ["Prix affiché", formatFcfa(p.amount)],
          ["Montant envoyé", p.sentAmount != null ? formatFcfa(p.sentAmount) : "—"],
          ["Frais facturés au client", p.clientFee != null ? formatFcfa(p.clientFee) : p.fee ? `${formatFcfa(p.fee.fee)} (calculés)` : "—"],
          ["Total débité au client", p.debitedAmount != null ? formatFcfa(p.debitedAmount) : "—"],
          ["Crédits", `${formatNumber(p.credits)}${p.bonusCredits > 0 ? ` + ${formatNumber(p.bonusCredits)} offerts` : ""}`],
          ["Dernière vérification", p.lastCheckedAt ? formatDateTime(p.lastCheckedAt) : "—"],
          [
            "Attribution des crédits",
            p.creditState === "CREDITED" ? (
              <Pill key="c" tone="ok">Attribués</Pill>
            ) : p.creditState === "NOT_CREDITED" ? (
              <Pill key="c" tone="bad">Non attribués</Pill>
            ) : (
              "—"
            ),
          ],
          ["Date d’attribution", p.creditedAt ? formatDateTime(p.creditedAt) : "—"],
          [
            "Origine de l’attribution",
            p.creditOrigin === "MANUAL" ? `Manuelle${p.creditedBy ? ` · ${p.creditedBy}` : ""}` : p.creditOrigin === "AUTO" ? "Automatique" : "—",
          ],
          [
            "Tentatives de traitement",
            `${formatNumber(p.reconcileAttempts)}${p.lastReconcileError ? ` · dernière erreur : ${p.lastReconcileError}` : ""}`,
          ],
        ].map(([k, v]) => (
          <div key={String(k)} className="space-y-0.5 border-l-2 border-primary/40 pl-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{k}</dt>
            <dd className="font-medium">{v}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="chrono" className="space-y-3">
        <h2 id="chrono" className="text-xl font-bold">Historique</h2>
        <ol className="space-y-2">
          {p.timeline.map((e, i) => (
            <li key={`${e.at}-${i}`} className="flex flex-wrap items-start gap-x-3 gap-y-1 rounded-xl border bg-card p-3">
              <Pill tone={KIND[e.kind].tone}>{KIND[e.kind].label}</Pill>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{e.label}</p>
                {e.detail && <p className="text-sm text-muted-foreground">{e.detail}</p>}
              </div>
              <time dateTime={e.at} className="whitespace-nowrap text-sm text-muted-foreground">{formatDateTime(e.at)}</time>
            </li>
          ))}
        </ol>
        <p className="text-sm text-muted-foreground">Statut décidé par le fournisseur uniquement ; « Vérifier » l’interroge à nouveau.</p>
      </section>

      <section aria-labelledby="verifications" className="space-y-3">
        <h2 id="verifications" className="text-xl font-bold">Historique des vérifications</h2>
        {p.checks.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-card/50 p-4 text-sm text-muted-foreground">
            Aucune vérification enregistrée pour ce paiement.
          </p>
        ) : (
          <ol className="space-y-2">
            {p.checks.map((c, i) => (
              <li key={`${c.at}-${i}`} className="flex flex-wrap items-start gap-x-3 gap-y-1 rounded-xl border bg-card p-3">
                <Pill tone={c.kind === "MANUAL" ? "warn" : c.outcome === "success" ? "ok" : c.outcome === "pending" ? "info" : "bad"}>
                  {c.kind === "MANUAL" ? "Validation admin." : "Fournisseur"}
                </Pill>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{OUTCOME[c.outcome] ?? c.outcome}</p>
                  <p className="text-sm text-muted-foreground">
                    {SOURCE[c.source] ?? c.source}
                    {c.amount != null && c.currency ? ` · ${formatMoney(c.amount, c.currency)}` : ""}
                    {c.actor ? ` · ${c.actor}` : ""}
                    {c.proofReference ? ` · preuve : ${c.proofReference}` : ""}
                  </p>
                  {c.detail && <p className="text-sm text-muted-foreground">{c.detail}</p>}
                </div>
                <time dateTime={c.at} className="whitespace-nowrap text-sm text-muted-foreground">{formatDateTime(c.at)}</time>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
