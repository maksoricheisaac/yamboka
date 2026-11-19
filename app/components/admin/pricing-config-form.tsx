"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PricingConfigRow, PricingPreview, PricingSections } from "@yamboka/shared";
import { PricingPreviewTable } from "@/components/admin/pricing-preview-table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiPost } from "@/lib/api-client";

/**
 * Réglages des calculs : brouillon → aperçu → application.
 *
 * Aucun paramètre de calcul ne passe par le code. Appliquer une version prend effet immédiatement, sans
 * redéploiement. L'aperçu est obligatoire dans les faits : c'est lui qui dit si la version vend sous le
 * coût, et le serveur refuse l'application tant que la confirmation correspondante n'est pas cochée.
 */

type Field = {
  key: keyof Draft;
  label: string;
  hint?: string;
  kind: "decimal" | "integer" | "boolean";
};

interface Draft {
  marginPercent: string;
  bonusValuationPercent: string;
  fxBufferPercent: string;
  safetyMarginUsd: string;
  minMarginPercent: string;
  cardFcfaPerUsd: string;
  circuitLossPercent: string;
  withdrawalFeePercent: string;
  momoToCardFeePercent: string;
  topUpFeePercent: string;
  minWithdrawalXaf: string;
  minPurchaseXaf: string;
  dailyCapUsd: string;
  dailyUserCapUsd: string;
  quoteValiditySeconds: string;
  provisional: boolean;
}

/** Quatre groupes à la suite : moins de clics qu'un second niveau d'onglets, et tout se relit d'un coup. */
const GROUPS: { title: string; note: string; fields: Field[] }[] = [
  {
    title: "Marges et protections",
    note: "Ce que chaque vidéo doit rapporter au-delà de son coût.",
    fields: [
      { key: "marginPercent", label: "Marge visée (%)", kind: "decimal" },
      { key: "minMarginPercent", label: "Marge minimale (%)", kind: "decimal", hint: "En dessous : confirmation exigée." },
      { key: "fxBufferPercent", label: "Marge de change (%)", kind: "decimal" },
      { key: "safetyMarginUsd", label: "Marge de sécurité ($)", kind: "decimal", hint: "Jamais engagée chez le fournisseur." },
      { key: "bonusValuationPercent", label: "Bonus compté (%)", kind: "decimal", hint: "100 = cas prudent." },
    ],
  },
  {
    title: "Taux et frais du circuit",
    note: "Le coût du trajet FCFA → dollars, tant qu'aucune recharge n'est mesurée.",
    fields: [
      { key: "cardFcfaPerUsd", label: "Taux carte (F/$)", kind: "decimal" },
      { key: "circuitLossPercent", label: "Perte de circuit (%)", kind: "decimal", hint: "Ne s’ajoute jamais à un taux mesuré." },
      { key: "withdrawalFeePercent", label: "Frais de retrait (%)", kind: "decimal", hint: "Supposé, non mesuré." },
      { key: "momoToCardFeePercent", label: "Frais MoMo → carte (%)", kind: "decimal" },
      { key: "topUpFeePercent", label: "Frais de recharge (%)", kind: "decimal" },
    ],
  },
  {
    title: "Achats et retraits",
    note: "Montants en dessous desquels une opération n'est plus rentable.",
    fields: [
      { key: "minPurchaseXaf", label: "Achat minimum (FCFA)", kind: "integer" },
      { key: "minWithdrawalXaf", label: "Retrait minimum (FCFA)", kind: "integer", hint: "Imposé par l’encaisseur." },
    ],
  },
  {
    title: "Plafonds et devis",
    note: "Garde-fous de dépense et durée de validité d'un prix affiché.",
    fields: [
      { key: "dailyCapUsd", label: "Plafond quotidien, plateforme ($)", kind: "decimal" },
      { key: "dailyUserCapUsd", label: "Plafond quotidien par client ($)", kind: "decimal" },
      { key: "quoteValiditySeconds", label: "Validité d’un devis (s)", kind: "integer", hint: "600 = 10 minutes." },
      { key: "provisional", label: "Configuration provisoire", kind: "boolean", hint: "À décocher une fois le taux sortant mesuré." },
    ],
  },
];

function draftOf(c: PricingConfigRow): Draft {
  return {
    marginPercent: c.marginPercent,
    bonusValuationPercent: c.bonusValuationPercent,
    fxBufferPercent: c.fxBufferPercent,
    safetyMarginUsd: c.safetyMarginUsd,
    minMarginPercent: c.minMarginPercent,
    cardFcfaPerUsd: c.cardFcfaPerUsd,
    circuitLossPercent: c.circuitLossPercent,
    withdrawalFeePercent: c.withdrawalFeePercent,
    momoToCardFeePercent: c.momoToCardFeePercent,
    topUpFeePercent: c.topUpFeePercent,
    minWithdrawalXaf: String(c.minWithdrawalXaf),
    minPurchaseXaf: String(c.minPurchaseXaf),
    dailyCapUsd: c.dailyCapUsd,
    dailyUserCapUsd: c.dailyUserCapUsd,
    quoteValiditySeconds: String(c.quoteValiditySeconds),
    provisional: c.provisional,
  };
}

/** Corps envoyé à l'API : seulement ce qui a changé, plus le motif et les confirmations. */
function bodyOf(
  draft: Draft,
  initial: Draft,
  note: string,
  confirm: { belowCost: boolean; bigChange: boolean },
): Record<string, unknown> {
  const body: Record<string, unknown> = { note };
  for (const [key, value] of Object.entries(draft)) {
    if (initial[key as keyof Draft] === value) continue;
    body[key] = value;
  }
  if (confirm.belowCost) body.confirmBelowCost = true;
  if (confirm.bigChange) body.confirmBigChange = true;
  return body;
}

export function PricingConfigForm({ sections }: { sections: PricingSections }) {
  const router = useRouter();
  const initial = draftOf(sections.current);
  const [draft, setDraft] = useState<Draft>(initial);
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<PricingPreview | null>(null);
  const [confirmBelowCost, setConfirmBelowCost] = useState(false);
  const [confirmBigChange, setConfirmBigChange] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const changed = Object.entries(draft).filter(([k, v]) => initial[k as keyof Draft] !== v);
  const dirty = changed.length > 0;

  const set = (key: keyof Draft, value: string | boolean) => {
    setDraft({ ...draft, [key]: value });
    // Toute modification périme l'aperçu : l'appliquer sur la foi d'un aperçu obsolète serait pire que rien.
    setPreview(null);
    setConfirmBelowCost(false);
    setConfirmBigChange(false);
  };

  async function run(action: "preview" | "apply") {
    setBusy(true);
    setMsg(null);
    try {
      const body = bodyOf(draft, initial, note.trim(), {
        belowCost: confirmBelowCost,
        bigChange: confirmBigChange,
      });
      if (action === "preview") {
        setPreview(await apiPost<PricingPreview>("/admin/pricing/preview", body));
      } else {
        const res = await apiPost<{ appliedAt: string }>("/admin/pricing/apply", body);
        setMsg({
          ok: true,
          text: `Version appliquée le ${new Date(res.appliedAt).toLocaleString("fr-FR")}. Les nouveaux devis l’utilisent déjà.`,
        });
        setPreview(null);
        setNote("");
        router.refresh();
      }
    } catch (err) {
      setMsg({
        ok: false,
        text: err instanceof ApiError ? (err.details[0]?.message ?? err.message) : "Opération impossible.",
      });
    } finally {
      setBusy(false);
    }
  }

  const needsBelowCost = preview?.sellsBelowCost ?? false;
  const needsBigChange = (preview?.bigPriceChange ?? false) || (preview?.underMinMargin ?? false);
  const canApply =
    dirty &&
    note.trim().length >= 3 &&
    preview !== null &&
    (!needsBelowCost || confirmBelowCost) &&
    (!needsBigChange || confirmBigChange);

  /** Ce qu'il reste à faire pour pouvoir appliquer, en une phrase et une seule à la fois. */
  const blocker = !dirty
    ? "Aucun changement en attente."
    : note.trim().length < 3
      ? "Indiquez un motif pour pouvoir appliquer."
      : preview === null
        ? "Regardez l’aperçu avant d’appliquer."
        : null;

  return (
    <div className="space-y-6">
      {msg && (
        <Alert variant={msg.ok ? "default" : "destructive"}>
          <AlertDescription>{msg.text}</AlertDescription>
        </Alert>
      )}

      {GROUPS.map((g) => {
        const count = g.fields.filter((f) => initial[f.key] !== draft[f.key]).length;
        return (
          <fieldset key={g.title} className="rounded-2xl bg-card p-4 shadow-card">
            <legend className="flex items-center gap-2 px-1">
              <span className="text-sm font-semibold">{g.title}</span>
              {count > 0 && (
                <span className="grid min-w-5 place-items-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                  {count}
                  <span className="sr-only"> modification{count > 1 ? "s" : ""} non appliquée{count > 1 ? "s" : ""}</span>
                </span>
              )}
            </legend>
            <p className="mb-3 text-xs text-muted-foreground">{g.note}</p>
            <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              {g.fields.map((f) => {
                const id = `p-${f.key}`;
                const value = draft[f.key];
                const touched = initial[f.key] !== value;
                return (
                  <div key={f.key} className="space-y-1">
                    {f.kind === "boolean" ? (
                      <label className="flex items-start gap-2.5 pt-5 text-sm">
                        <input
                          id={id}
                          type="checkbox"
                          checked={Boolean(value)}
                          onChange={(e) => set(f.key, e.target.checked)}
                          className="mt-0.5 size-5"
                        />
                        <span className="font-medium">{f.label}</span>
                      </label>
                    ) : (
                      <>
                        <Label htmlFor={id} className="text-xs text-muted-foreground">
                          {f.label}
                        </Label>
                        <Input
                          id={id}
                          inputMode="decimal"
                          value={String(value)}
                          onChange={(e) => set(f.key, e.target.value)}
                          className={`h-9 tabular-nums ${touched ? "border-primary" : ""}`}
                        />
                      </>
                    )}
                    {f.hint && <p className="text-xs text-muted-foreground/80">{f.hint}</p>}
                  </div>
                );
              })}
            </div>
          </fieldset>
        );
      })}

      <div className="space-y-3 rounded-2xl bg-card p-4 shadow-card">
        <Label htmlFor="pricing-note" className="text-sm font-semibold">
          Motif du changement
        </Label>
        <Textarea
          id="pricing-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Taux sortant mesuré sur la recharge du 20 novembre."
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" disabled={!dirty || busy} onClick={() => void run("preview")}>
            {busy ? "…" : "Voir l’aperçu"}
          </Button>
          <Button type="button" disabled={!canApply || busy} onClick={() => void run("apply")}>
            Appliquer
          </Button>
          {dirty && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setDraft(initial);
                setPreview(null);
              }}
            >
              Annuler
            </Button>
          )}
          {blocker && <p className="text-sm text-muted-foreground">{blocker}</p>}
        </div>
      </div>

      {preview && (
        <section aria-labelledby="apercu" className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 id="apercu" className="text-sm font-semibold">
              Aperçu avant / après
            </h3>
            <p className="text-xs tabular-nums text-muted-foreground">
              Taux {preview.pricingRateBefore} → <strong className="text-foreground">{preview.pricingRateAfter}</strong> F/$
              {" · "}
              Plancher {preview.creditFloorBeforeFcfa} → <strong className="text-foreground">{preview.creditFloorAfterFcfa}</strong> F
            </p>
          </div>

          {needsBelowCost && (
            <div className="space-y-2 rounded-2xl border border-destructive/40 bg-destructive/8 p-4">
              <p className="text-sm font-semibold text-destructive">
                Vend sous le coût sur {preview.belowCostLabels.length} ligne(s).
              </p>
              <p className="text-xs text-muted-foreground">
                {preview.belowCostLabels.slice(0, 6).join(" ; ")}
                {preview.belowCostLabels.length > 6 ? " …" : ""}
              </p>
              <label className="flex items-start gap-2.5 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={confirmBelowCost}
                  onChange={(e) => setConfirmBelowCost(e.target.checked)}
                  className="mt-0.5 size-5"
                />
                Je confirme vouloir appliquer malgré la vente à perte.
              </label>
            </div>
          )}

          {needsBigChange && (
            <div className="space-y-2 rounded-2xl border border-warning/40 bg-warning/8 p-4">
              {preview.bigPriceChange && (
                <p className="text-sm font-semibold">
                  Le prix change de plus de 20 % sur {preview.bigPriceChangeLabels.length} ligne(s).
                </p>
              )}
              {preview.underMinMargin && (
                <p className="text-sm font-semibold">
                  La marge passe sous le minimum ({Number(preview.after.minMarginPercent)} %) sur{" "}
                  {preview.underMinMarginLabels.length} ligne(s).
                </p>
              )}
              <label className="flex items-start gap-2.5 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={confirmBigChange}
                  onChange={(e) => setConfirmBigChange(e.target.checked)}
                  className="mt-0.5 size-5"
                />
                Je confirme ces variations.
              </label>
            </div>
          )}

          <PricingPreviewTable rows={preview.rows} />
        </section>
      )}
    </div>
  );
}
