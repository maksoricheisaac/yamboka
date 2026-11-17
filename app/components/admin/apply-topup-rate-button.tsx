"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PricingPreview } from "@yamboka/shared";
import { PricingPreviewTable } from "@/components/admin/pricing-preview-table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiGet, apiPost } from "@/lib/api-client";

/**
 * Application du taux sortant mesuré d'une recharge à la grille (T5).
 *
 * Saisir une recharge ne change AUCUN prix : le taux reste en attente. Ce bouton ouvre l'aperçu
 * avant / après, modèle par modèle, puis applique seulement sur confirmation et avec un motif.
 */
export function ApplyTopUpRateButton({
  topUpId,
  rOut,
}: {
  topUpId: string;
  rOut: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<PricingPreview | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      setPreview(
        await apiGet<PricingPreview>(`/admin/finance/topups/${topUpId}/rate-preview`),
      );
    } catch (err) {
      setError(
        err instanceof ApiError ? (err.details[0]?.message ?? err.message) : "Aperçu impossible.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/admin/finance/topups/${topUpId}/apply-rate`, { note: note.trim() });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiError ? (err.details[0]?.message ?? err.message) : "Application impossible.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next && preview === null) void load();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          En attente · voir l’effet
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[min(92vw,72rem)]">
        <div className="space-y-1.5">
          <DialogTitle>Appliquer le taux mesuré {rOut} F/$ ?</DialogTitle>
          <DialogDescription>
            Ce taux est mesuré sur un retrait réel. Tant qu’il n’est pas appliqué, la grille garde le taux
            provisoire et aucun prix n’a changé. L’appliquer change les prix de toute la plateforme pour les
            nouveaux devis.
          </DialogDescription>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {preview && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Taux retenu : {preview.pricingRateBefore} → <strong>{preview.pricingRateAfter}</strong> F/$ ·
              plancher du crédit : {preview.creditFloorBeforeFcfa} → {preview.creditFloorAfterFcfa} F
            </p>
            {preview.sellsBelowCost && (
              <Alert variant="destructive">
                <AlertDescription>
                  Attention : avec ce taux, {preview.belowCostLabels.length} ligne(s) se vendraient sous
                  leur coût. Revoyez la marge avant d’appliquer.
                </AlertDescription>
              </Alert>
            )}
            <div className="max-h-[50vh] overflow-y-auto">
              <PricingPreviewTable rows={preview.rows} />
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor={`note-${topUpId}`}>Motif (obligatoire)</Label>
          <Textarea
            id={`note-${topUpId}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Taux mesuré sur le retrait du 20 novembre."
          />
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button
            type="button"
            disabled={busy || note.trim().length < 3 || preview === null}
            onClick={() => void apply()}
          >
            Appliquer ce taux
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
