"use client";

import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";
import {
  GRANT_JUSTIFICATION_THRESHOLD,
  JUSTIFICATION_MIN,
  MANUAL_GRANT_MAX,
  type AdminUserDetail,
} from "@yamboka/shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { ApiError, apiPost } from "@/lib/api-client";

type UserPayment = AdminUserDetail["payments"][number];
type Kind = "SETTLEMENT" | "EXCEPTIONAL";
type Mode = "PROVIDER" | "MANUAL_PROOF";

/** Ligne du récapitulatif : libellé à gauche, valeur à droite. */
function Line({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

/**
 * Attribution de crédits à un client par un administrateur, en deux temps : saisie puis récapitulatif à confirmer.
 *
 * Deux cas, deux routes différentes côté serveur :
 * - « Régularisation d'un paiement » : le serveur interroge le fournisseur et n'attribue que s'il confirme le
 *   paiement au montant exact. Aucune quantité n'est saisie ici : elle vient du pack acheté.
 * - « Attribution exceptionnelle » : écriture ADMIN_ADJUST avec une référence unique, motif obligatoire.
 *
 * Ce formulaire n'est qu'une commodité : l'API revérifie le rôle, le motif, les quantités et l'unicité des
 * références. Rien ici ne peut être contourné en modifiant la requête envoyée.
 */
export function GrantCreditsDialog({ user }: { user: AdminUserDetail }) {
  const router = useRouter();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [kind, setKind] = useState<Kind>("EXCEPTIONAL");
  const [paymentId, setPaymentId] = useState("");
  const [mode, setMode] = useState<Mode>("PROVIDER");
  const [proofReference, setProofReference] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [justification, setJustification] = useState("");

  /** Seuls les paiements confirmés sans crédits attribués peuvent être régularisés. */
  const settleable = useMemo(
    () => user.payments.filter((p) => p.creditState === "NOT_CREDITED"),
    [user.payments],
  );
  const payment: UserPayment | undefined = settleable.find((p) => p.id === paymentId);
  const parsedAmount = Number(amount.replace(",", "."));
  const amountValid = Number.isInteger(parsedAmount) && parsedAmount !== 0 && Math.abs(parsedAmount) <= MANUAL_GRANT_MAX;
  const needsJustification =
    (kind === "EXCEPTIONAL" && Math.abs(parsedAmount) >= GRANT_JUSTIFICATION_THRESHOLD) ||
    (kind === "SETTLEMENT" && mode === "MANUAL_PROOF");

  function reset() {
    setStep("form");
    setError(null);
    setFieldErrors({});
    setKind("EXCEPTIONAL");
    setPaymentId("");
    setMode("PROVIDER");
    setProofReference("");
    setAmount("");
    setReason("");
    setJustification("");
  }

  const canReview =
    reason.trim().length >= 5 &&
    (!needsJustification || justification.trim().length >= JUSTIFICATION_MIN) &&
    (kind === "SETTLEMENT"
      ? !!payment && (mode !== "MANUAL_PROOF" || proofReference.trim().length >= 3)
      : amountValid);

  async function confirm() {
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      if (kind === "SETTLEMENT") {
        const res = await apiPost<{ credits: number; bonusCredits: number; balance: number; verifiedBy: string }>(
          `/admin/payments/${paymentId}/settle`,
          { mode, proofReference: proofReference.trim() || undefined, reason: reason.trim(), justification: justification.trim() || undefined },
        );
        toast.success(`Paiement régularisé : ${formatNumber(res.credits + res.bonusCredits)} crédits attribués.`);
      } else {
        const res = await apiPost<{ balance: number }>(`/admin/users/${user.id}/credits`, {
          amount: parsedAmount,
          reason: reason.trim(),
          justification: justification.trim() || undefined,
        });
        toast.success(`Nouveau solde : ${formatNumber(res.balance)} crédits.`);
      }
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
        <Button variant="outline" size="sm" type="button">
          Attribuer des crédits
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <div className="space-y-1">
          <DialogTitle>Attribuer des crédits</DialogTitle>
          <DialogDescription>
            {step === "form"
              ? "L’opération est enregistrée dans le registre de crédits et dans le journal d’audit."
              : "Vérifiez le récapitulatif avant de confirmer : une opération validée ne peut pas être annulée."}
          </DialogDescription>
        </div>

        <dl className="grid grid-cols-2 gap-2 rounded-xl border bg-muted/40 p-3 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Utilisateur</dt>
            <dd className="truncate font-medium">{user.email}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Solde actuel</dt>
            <dd className="font-medium tabular-nums">{formatNumber(user.credits)} crédits</dd>
          </div>
        </dl>

        {step === "form" ? (
          <form
            className="space-y-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (canReview) setStep("confirm");
            }}
          >
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">Type d’opération</legend>
              <div className="grid gap-2">
                <label className="flex items-start gap-2 rounded-lg border p-2.5 text-sm">
                  <input
                    type="radio"
                    name={`${uid}-kind`}
                    className="mt-1"
                    checked={kind === "SETTLEMENT"}
                    disabled={settleable.length === 0}
                    onChange={() => setKind("SETTLEMENT")}
                  />
                  <span>
                    <span className="font-medium">Régularisation d’un paiement</span>
                    <span className="block text-xs text-muted-foreground">
                      {settleable.length === 0
                        ? "Aucun paiement confirmé non crédité pour ce client."
                        : `${settleable.length} paiement(s) confirmé(s) sans crédits attribués. Le fournisseur est interrogé avant toute attribution.`}
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 rounded-lg border p-2.5 text-sm">
                  <input
                    type="radio"
                    name={`${uid}-kind`}
                    className="mt-1"
                    checked={kind === "EXCEPTIONAL"}
                    onChange={() => setKind("EXCEPTIONAL")}
                  />
                  <span>
                    <span className="font-medium">Attribution exceptionnelle</span>
                    <span className="block text-xs text-muted-foreground">
                      Geste commercial ou correction, sans paiement associé (mouvement ADMIN_ADJUST).
                    </span>
                  </span>
                </label>
              </div>
            </fieldset>

            {kind === "SETTLEMENT" ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor={`${uid}-payment`}>Paiement à régulariser</Label>
                  <select
                    id={`${uid}-payment`}
                    value={paymentId}
                    onChange={(e) => setPaymentId(e.target.value)}
                    className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                  >
                    <option value="">Choisir un paiement…</option>
                    {settleable.map((p) => (
                      <option key={p.id} value={p.id}>
                        {formatDateTime(p.createdAt)} · {formatMoney(p.amount, p.currency)} · {p.packName}
                      </option>
                    ))}
                  </select>
                </div>
                {payment && (
                  <div className="space-y-1 rounded-xl border bg-card p-3">
                    <Line label="Référence de la transaction" value={<span className="break-all font-mono text-xs">{payment.externalReference ?? "—"}</span>} />
                    <Line label="Montant payé" value={formatMoney(payment.amount, payment.currency)} />
                    <Line label="Pack acheté" value={payment.packName} />
                    <Line label="Crédits attendus" value={`${formatNumber(payment.credits)} crédits`} />
                  </div>
                )}
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
                  <p className="text-xs text-muted-foreground">
                    Le fournisseur est interrogé dans les deux cas. Un paiement qu’il déclare échoué reste refusé.
                  </p>
                </div>
                {mode === "MANUAL_PROOF" && (
                  <div className="space-y-1.5">
                    <Label htmlFor={`${uid}-proof`}>Référence de la preuve (relevé du compte marchand)</Label>
                    <Input id={`${uid}-proof`} value={proofReference} onChange={(e) => setProofReference(e.target.value)} aria-invalid={!!fieldErrors.proofReference} />
                    {fieldErrors.proofReference && <p role="alert" className="text-sm font-medium text-destructive">{fieldErrors.proofReference}</p>}
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor={`${uid}-amount`}>Quantité de crédits (négatif pour débiter)</Label>
                <Input id={`${uid}-amount`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={!!fieldErrors.amount} />
                <p className="text-xs text-muted-foreground">
                  Entier non nul, {formatNumber(MANUAL_GRANT_MAX)} au maximum. Le solde ne peut jamais devenir négatif.
                </p>
                {fieldErrors.amount && <p role="alert" className="text-sm font-medium text-destructive">{fieldErrors.amount}</p>}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor={`${uid}-reason`}>Motif (conservé dans le journal d’audit)</Label>
              <Textarea id={`${uid}-reason`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Au moins 5 caractères" aria-invalid={!!fieldErrors.reason} />
              {fieldErrors.reason && <p role="alert" className="text-sm font-medium text-destructive">{fieldErrors.reason}</p>}
            </div>

            {needsJustification && (
              <div className="space-y-1.5">
                <Label htmlFor={`${uid}-justification`}>Justification détaillée</Label>
                <Textarea id={`${uid}-justification`} value={justification} onChange={(e) => setJustification(e.target.value)} aria-invalid={!!fieldErrors.justification} />
                <p className="text-xs text-muted-foreground">
                  Obligatoire ({JUSTIFICATION_MIN} caractères minimum) au-delà de {formatNumber(GRANT_JUSTIFICATION_THRESHOLD)} crédits ou pour une validation administrative.
                </p>
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
              <Line label="Opération" value={kind === "SETTLEMENT" ? "Régularisation d’un paiement" : "Attribution exceptionnelle"} />
              <Line label="Utilisateur" value={user.email} />
              <Line label="Solde actuel" value={`${formatNumber(user.credits)} crédits`} />
              {kind === "SETTLEMENT" && payment ? (
                <>
                  <Line label="Référence de la transaction" value={<span className="break-all font-mono text-xs">{payment.externalReference ?? "—"}</span>} />
                  <Line label="Montant payé" value={formatMoney(payment.amount, payment.currency)} />
                  <Line label="Pack initialement acheté" value={payment.packName} />
                  <Line label="Crédits attendus" value={`${formatNumber(payment.credits)} crédits`} />
                  <Line label="Vérification" value={mode === "PROVIDER" ? "Confirmation du fournisseur" : "Validation administrative sur preuve"} />
                  {mode === "MANUAL_PROOF" && <Line label="Référence de preuve" value={proofReference} />}
                </>
              ) : (
                <>
                  <Line label="Crédits attribués" value={`${parsedAmount > 0 ? "+" : ""}${formatNumber(parsedAmount)}`} />
                  <Line label="Solde après opération" value={`${formatNumber(user.credits + parsedAmount)} crédits`} />
                </>
              )}
              <Line label="Motif" value={reason.trim()} />
              {justification.trim() && <Line label="Justification" value={justification.trim()} />}
            </div>

            {kind === "SETTLEMENT" && mode === "MANUAL_PROOF" && (
              <Alert role="alert">
                <AlertDescription>
                  Cette attribution sera tracée comme une validation administrative, et non comme une confirmation
                  du fournisseur. Vous en êtes responsable.
                </AlertDescription>
              </Alert>
            )}
            {kind === "EXCEPTIONAL" && Math.abs(parsedAmount) >= GRANT_JUSTIFICATION_THRESHOLD && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>
                  Montant important ({formatNumber(Math.abs(parsedAmount))} crédits) : confirmez que l’opération est autorisée.
                </AlertDescription>
              </Alert>
            )}
            {error && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setStep("form")} disabled={busy}>
                Modifier
              </Button>
              <Button type="button" onClick={confirm} disabled={busy}>
                {busy ? "Envoi…" : "Confirmer l’attribution"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
