"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PaymentView, SimulationOutcome } from "@yamboka/shared";
import { CheckCircle2, Clock, FlaskConical, Loader2, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { formatFcfa, formatNumber, formatPhone } from "@/lib/format";
import { OPERATOR_LABELS } from "./labels";

const POLL_MS = 3000;
/** On interroge toutes les 3 s pendant 5 minutes au plus (cahier des tâches), puis on s'arrête. */
const POLL_MAX_MS = 5 * 60 * 1000;

const SIMULATIONS: { outcome: SimulationOutcome; callbacks?: number; label: string; hint: string }[] = [
  { outcome: "success", label: "Confirmer le paiement", hint: "Le client valide sur son téléphone." },
  { outcome: "failed", label: "Refuser", hint: "Le paiement échoue (solde insuffisant, code erroné…)." },
  { outcome: "cancelled", label: "Annuler", hint: "Le client annule la demande." },
  { outcome: "success", callbacks: 3, label: "Succès avec 3 callbacks", hint: "Le fournisseur renvoie plusieurs fois la même confirmation." },
  { outcome: "forged_callback", callbacks: 2, label: "Faux callback", hint: "Un callback arrive alors que rien n’a été payé." },
  { outcome: "provider_error", label: "Panne du fournisseur", hint: "Le fournisseur ne répond plus." },
  { outcome: "invalid_response", label: "Réponse invalide", hint: "Le fournisseur répond n’importe quoi." },
];

export function PaymentTracker({ initial }: { initial: PaymentView }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [startedAt] = useState(() => Date.now());
  const [timedOut, setTimedOut] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const { data: payment } = useQuery({
    queryKey: ["payment", initial.id],
    queryFn: async () => (await apiGet<{ payment: PaymentView }>(`/payments/${initial.id}`)).payment,
    initialData: initial,
    refetchInterval: (query) => {
      const p = query.state.data;
      const open = p?.status === "PENDING" || p?.status === "INITIATED";
      return open && Date.now() - startedAt < POLL_MAX_MS ? POLL_MS : false;
    },
  });

  const open = payment.status === "PENDING" || payment.status === "INITIATED";

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => setTimedOut(true), POLL_MAX_MS);
    return () => clearTimeout(t);
  }, [open]);

  // Dès que le paiement aboutit, on rafraîchit l'en-tête (solde) et l'historique.
  useEffect(() => {
    if (payment.status === "SUCCESS") {
      void queryClient.invalidateQueries({ queryKey: ["ledger"] });
      router.refresh();
    }
  }, [payment.status, queryClient, router]);

  const simulate = useMutation({
    mutationFn: (s: (typeof SIMULATIONS)[number]) =>
      apiPost<{ payment: PaymentView }>(`/payments/${initial.id}/simulate`, {
        outcome: s.outcome,
        callbacks: s.callbacks ?? 1,
      }).then((r) => ({ payment: r.payment, hint: s.hint })),
    onSuccess: ({ payment: next, hint }) => {
      queryClient.setQueryData(["payment", initial.id], next);
      setNote(`Simulation envoyée — ${hint}`);
    },
    onError: (e) => setNote(e instanceof ApiError ? e.message : "La simulation a échoué."),
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-4 rounded-2xl border bg-card p-6 shadow-soft" aria-live="polite">
        {open && (
          <>
            <div className="flex items-center gap-3">
              {timedOut ? <Clock className="size-7 text-muted-foreground" aria-hidden /> : <Loader2 className="size-7 animate-spin text-primary" aria-hidden />}
              <h1 className="text-2xl font-bold">
                {timedOut ? "Toujours en attente de confirmation" : "En attente de votre confirmation"}
              </h1>
            </div>
            {timedOut ? (
              <p className="text-muted-foreground">
                Nous n’avons pas encore reçu la confirmation. Si vous avez payé, vos crédits seront ajoutés dès qu’elle arrivera : vous
                pouvez quitter cette page. Vous pouvez aussi suivre l’achat dans <Link href="/app/achats" className="font-medium text-primary underline">vos achats</Link>.
              </p>
            ) : (
              <ol className="list-decimal space-y-1.5 pl-5 text-muted-foreground">
                <li>
                  Une demande de paiement de <strong className="text-foreground">{formatFcfa(payment.amountFcfa)}</strong> arrive sur le{" "}
                  <strong className="text-foreground">{formatPhone(payment.payerPhone)}</strong> ({OPERATOR_LABELS[payment.operator]}).
                </li>
                <li>Validez-la avec votre code secret.</li>
                <li>Cette page se met à jour toute seule dès que le paiement est confirmé.</li>
              </ol>
            )}
          </>
        )}

        {payment.status === "SUCCESS" && (
          <>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="size-7 text-success" aria-hidden />
              <h1 className="text-2xl font-bold">Paiement confirmé</h1>
            </div>
            <p className="text-lg">
              <strong>{formatNumber(payment.credits)} crédits</strong> ont été ajoutés à votre compte
              {payment.bonusCredits > 0 && <> (dont {payment.bonusCredits} offerts avec le pack {payment.packName})</>}.
            </p>
            <div className="flex flex-wrap gap-3 pt-1">
              <Button asChild>
                <Link href="/app/credits">Retour à mes crédits</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/app/achats/${payment.id}`}>Voir le reçu</Link>
              </Button>
            </div>
          </>
        )}

        {(payment.status === "FAILED" || payment.status === "CANCELLED") && (
          <>
            <div className="flex items-center gap-3">
              <XCircle className="size-7 text-destructive" aria-hidden />
              <h1 className="text-2xl font-bold">{payment.status === "CANCELLED" ? "Paiement annulé" : "Paiement échoué"}</h1>
            </div>
            <p className="text-muted-foreground">
              {payment.failureReason ?? "Le paiement n’a pas abouti."} Aucun crédit n’a été ajouté et rien n’a été débité par Yamboka.
            </p>
            <Button asChild>
              <Link href="/app/credits">Réessayer</Link>
            </Button>
          </>
        )}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t pt-4 text-sm">
          <dt className="text-muted-foreground">Pack</dt>
          <dd className="font-medium">{payment.packName}</dd>
          <dt className="text-muted-foreground">Montant</dt>
          <dd className="font-medium">{formatFcfa(payment.amountFcfa)}</dd>
          <dt className="text-muted-foreground">Crédits</dt>
          <dd className="font-medium">{formatNumber(payment.credits)}</dd>
          <dt className="text-muted-foreground">Référence</dt>
          <dd className="break-all font-mono text-xs">{payment.reference ?? "—"}</dd>
        </dl>
      </div>

      {payment.simulated && (
        <section aria-labelledby="simu-title" className="space-y-4 rounded-2xl border-2 border-dashed border-accent bg-accent/10 p-5">
          <div className="flex items-center gap-2">
            <FlaskConical className="size-5" aria-hidden />
            <h2 id="simu-title" className="font-heading text-lg font-bold">
              Mode simulation
            </h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Aucun argent réel n’est échangé. Ces boutons jouent le rôle du client sur son téléphone et du fournisseur de paiement, pour
            tester chaque cas.
          </p>
          {note && (
            <p role="status" className="rounded-lg bg-background p-3 text-sm font-medium">
              {note}
            </p>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            {SIMULATIONS.map((s) => (
              <Button
                key={s.label}
                variant={s.outcome === "success" && !s.callbacks ? "default" : "outline"}
                disabled={simulate.isPending || !open}
                onClick={() => simulate.mutate(s)}
                title={s.hint}
              >
                {s.label}
              </Button>
            ))}
          </div>
          {!open && <Alert><AlertDescription>Ce paiement est terminé : la simulation n’est plus possible.</AlertDescription></Alert>}
        </section>
      )}
    </div>
  );
}
