"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { JUSTIFICATION_MIN, type AdminPaymentDetail } from "@yamboka/shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";
import { ApiError, apiPost } from "@/lib/api-client";
import { formatMoney, formatNumber } from "@/lib/format";

type Mode = "PROVIDER" | "MANUAL_PROOF";

function Line({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

/**
 * Régularise un paiement confirmé dont les crédits n'ont pas été attribués.
 *
 * Le bouton n'apparaît que lorsque l'API l'autorise (`canSettle`), mais c'est l'API qui décide : elle interroge
 * le fournisseur, refuse un paiement non confirmé ou d'un montant différent, et ne crédite jamais deux fois.
 */
export function SettlePaymentDialog({ payment }: { payment: AdminPaymentDetail }) {
  const router = useRouter();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<Mode>("PROVIDER");
  const [proofReference, setProofReference] = useState("");
  const [reason, setReason] = useState("");
  const [justification, setJustification] = useState("");

  const needsProof = mode === "MANUAL_PROOF";
  const canReview =
    reason.trim().length >= 5 &&
    (!needsProof || (proofReference.trim().length >= 3 && justification.trim().length >= JUSTIFICATION_MIN));

  function reset() {
    setStep("form");
    setError(null);
    setFieldErrors({});
    setMode("PROVIDER");
    setProofReference("");
    setReason("");
    setJustification("");
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const res = await apiPost<{ credits: number; bonusCredits: number; verifiedBy: string }>(
        `/admin/payments/${payment.id}/settle`,
        { mode, proofReference: proofReference.trim() || undefined, reason: reason.trim(), justification: justification.trim() || undefined },
      );
      toast.success(`${formatNumber(res.credits + res.bonusCredits)} crédits attribués au client.`);
      setOpen(false);
      reset();
      router.refresh();
    } catch (e) {
      setStep("form");
      if (e instanceof ApiError) {
        const mapped: Record<string, string> = {};
        for (const d of e.details) mapped[d.field] = d.message;
        setFieldErrors(mapped);
        setError(e.message);
      } else {
        setError("Une erreur est survenue. Veuillez réessayer.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" type="button">Régulariser le paiement</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <div className="space-y-1">
          <DialogTitle>Régulariser le paiement</DialogTitle>
          <DialogDescription>
            Le fournisseur est interrogé avant toute attribution. Les crédits ne peuvent être attribués qu’une seule fois.
          </DialogDescription>
        </div>

        <div className="space-y-1 rounded-xl border bg-muted/40 p-3">
          <Line label="Client" value={payment.user.email} />
          <Line label="Référence fournisseur" value={<span className="break-all font-mono text-xs">{payment.externalReference ?? "—"}</span>} />
          <Line label="Montant payé" value={formatMoney(payment.amount, payment.currency)} />
          <Line label="Pack acheté" value={payment.packName} />
          <Line label="Crédits attendus" value={`${formatNumber(payment.credits)} crédits`} />
        </div>

        {step === "form" ? (
          <form
            className="space-y-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (canReview) setStep("confirm");
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor={`${uid}-mode`}>Vérification</Label>
              <select
                id={`${uid}-mode`}
                value={mode}
                onChange={(e) => setMode(e.target.value as Mode)}
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
              >
                <option value="PROVIDER">Confirmation du fournisseur (recommandé)</option>
                <option value="MANUAL_PROOF">Validation administrative sur preuve (fournisseur injoignable)</option>
              </select>
            </div>

            {needsProof && (
              <div className="space-y-1.5">
                <Label htmlFor={`${uid}-proof`}>Référence de la preuve (relevé du compte marchand)</Label>
                <Input id={`${uid}-proof`} value={proofReference} onChange={(e) => setProofReference(e.target.value)} aria-invalid={!!fieldErrors.proofReference} />
                {fieldErrors.proofReference && <p role="alert" className="text-sm font-medium text-destructive">{fieldErrors.proofReference}</p>}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor={`${uid}-reason`}>Motif (conservé dans le journal d’audit)</Label>
              <Textarea id={`${uid}-reason`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Au moins 5 caractères" aria-invalid={!!fieldErrors.reason} />
              {fieldErrors.reason && <p role="alert" className="text-sm font-medium text-destructive">{fieldErrors.reason}</p>}
            </div>

            {needsProof && (
              <div className="space-y-1.5">
                <Label htmlFor={`${uid}-justification`}>Justification détaillée</Label>
                <Textarea id={`${uid}-justification`} value={justification} onChange={(e) => setJustification(e.target.value)} aria-invalid={!!fieldErrors.justification} />
                <p className="text-xs text-muted-foreground">{JUSTIFICATION_MIN} caractères minimum.</p>
                {fieldErrors.justification && <p role="alert" className="text-sm font-medium text-destructive">{fieldErrors.justification}</p>}
              </div>
            )}

            {error && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="outline">Annuler</Button>
              </DialogClose>
              <Button type="submit" disabled={!canReview}>Vérifier le récapitulatif</Button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1 rounded-xl border bg-card p-3">
              <Line label="Vérification" value={needsProof ? "Validation administrative sur preuve" : "Confirmation du fournisseur"} />
              {needsProof && <Line label="Référence de preuve" value={proofReference.trim()} />}
              <Line label="Crédits à attribuer" value={`${formatNumber(payment.credits)} crédits`} />
              <Line label="Motif" value={reason.trim()} />
              {justification.trim() && <Line label="Justification" value={justification.trim()} />}
            </div>
            {needsProof && (
              <Alert role="alert">
                <AlertDescription>
                  Cette attribution sera tracée comme une validation administrative, et non comme une confirmation
                  du fournisseur.
                </AlertDescription>
              </Alert>
            )}
            {error && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setStep("form")} disabled={busy}>Modifier</Button>
              <Button type="button" onClick={confirm} disabled={busy}>
                {busy ? "Envoi…" : "Confirmer la régularisation"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
