import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { PaymentReceipt, PaymentView } from "@yamboka/shared";
import { OPERATOR_LABELS } from "@/components/credits/labels";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { formatDateTime, formatFcfa, formatNumber, formatPhone } from "@/lib/format";
import { serverGetOrNull } from "@/lib/server-api";

export const metadata: Metadata = { title: "Reçu" };

export default async function ReceiptPage({ params }: PageProps<"/app/achats/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const payment = await serverGetOrNull<{ payment: PaymentView }>(`/payments/${id}`);
  if (!payment) notFound();
  // Un reçu n'existe que pour un achat réussi : sinon, on renvoie vers le suivi du paiement.
  if (payment.payment.status !== "SUCCESS") redirect(`/app/credits/paiement/${id}`);
  const res = await serverGetOrNull<{ receipt: PaymentReceipt }>(`/payments/${id}/receipt`);
  if (!res) notFound();
  const r = res.receipt;

  return (
    <article className="mx-auto max-w-xl space-y-6 rounded-2xl border bg-card p-6 shadow-soft sm:p-8" aria-labelledby="receipt-title">
      <header className="space-y-1">
        <p className="text-sm font-semibold uppercase tracking-wider text-primary">Reçu</p>
        <h1 id="receipt-title" className="text-3xl font-bold">
          {r.receiptNumber}
        </h1>
        <p className="text-muted-foreground">{formatDateTime(r.creditedAt ?? r.createdAt)}</p>
      </header>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3">
        <dt className="text-muted-foreground">Client</dt>
        <dd className="font-medium">{user.firstName} {user.lastName}</dd>
        <dt className="text-muted-foreground">Pack</dt>
        <dd className="font-medium">{r.packName}</dd>
        <dt className="text-muted-foreground">Crédits</dt>
        <dd className="font-medium">
          {formatNumber(r.credits)}
          {r.bonusCredits > 0 && <span className="text-muted-foreground"> (dont {r.bonusCredits} offerts)</span>}
        </dd>
        <dt className="text-muted-foreground">Montant payé</dt>
        <dd className="font-heading text-xl font-bold">{formatFcfa(r.amountFcfa)}</dd>
        <dt className="text-muted-foreground">Paiement</dt>
        <dd className="font-medium">
          {OPERATOR_LABELS[r.operator]} — {formatPhone(r.payerPhone)}
        </dd>
        <dt className="text-muted-foreground">Référence</dt>
        <dd className="break-all font-mono text-xs">{r.reference}</dd>
      </dl>
      {r.simulated && (
        <p className="rounded-lg border border-accent bg-accent/15 p-3 text-sm">
          Reçu de <strong>démonstration</strong> : ce paiement a été simulé, aucun argent réel n’a été échangé.
        </p>
      )}
      <Button asChild variant="outline">
        <Link href="/app/achats">Retour à mes achats</Link>
      </Button>
    </article>
  );
}
