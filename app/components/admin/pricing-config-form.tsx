"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PricingConfigRow, PricingPreview, PricingSections } from "@yamboka/shared";
import { PricingPreviewTable } from "@/components/admin/pricing-preview-table";
import { Pill } from "@/components/admin/ui";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiPost } from "@/lib/api-client";

/**
 * Page « Configuration des calculs » : brouillon → aperçu → application.
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

const TABS = [
  { id: "marges", label: "Marges et protections" },
  { id: "taux", label: "Taux et frais" },
  { id: "packs", label: "Packs et achats" },
  { id: "plafonds", label: "Plafonds et alertes" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const GROUPS: { tab: TabId; title: string; fields: Field[] }[] = [
  {
    tab: "marges",
    title: "Marge visée et protections",
    fields: [
      { key: "marginPercent", label: "Marge visée (%)", kind: "decimal", hint: "Appliquée au coût fournisseur de chaque vidéo." },
      { key: "minMarginPercent", label: "Marge minimale acceptée (%)", kind: "decimal", hint: "En dessous, l’application exige une confirmation." },
      { key: "fxBufferPercent", label: "Marge de change (%)", kind: "decimal", hint: "Ajoutée au taux sortant retenu." },
      { key: "safetyMarginUsd", label: "Marge de sécurité ($)", kind: "decimal", hint: "Dollars jamais engagés sur le compte fournisseur." },
      { key: "bonusValuationPercent", label: "Bonus compté dans la valeur du crédit (%)", kind: "decimal", hint: "100 = cas prudent : le bonus compte sur chaque crédit." },
    ],
  },
  {
    tab: "taux",
    title: "Taux de change et frais du circuit de recharge",
    fields: [
      { key: "cardFcfaPerUsd", label: "Taux carte FCFA → $", kind: "decimal", hint: "Ne sert que tant qu’aucune recharge n’est mesurée." },
      { key: "circuitLossPercent", label: "Perte de circuit provisoire (%)", kind: "decimal", hint: "Valeur unique, provisoire. Ne s’ajoute JAMAIS à un r_out mesuré." },
      { key: "withdrawalFeePercent", label: "Frais de retrait SasPay (%)", kind: "decimal", hint: "1 % supposé, NON mesuré." },
      { key: "momoToCardFeePercent", label: "Frais MoMo → carte (%)", kind: "decimal" },
      { key: "topUpFeePercent", label: "Frais de recharge fournisseur (%)", kind: "decimal" },
    ],
  },
  {
    tab: "packs",
    title: "Achats et retraits",
    fields: [
      { key: "minPurchaseXaf", label: "Achat minimum (FCFA)", kind: "integer", hint: "En dessous, la marge nette d’un achat sur mesure ne serait plus positive." },
      { key: "minWithdrawalXaf", label: "Retrait minimum (FCFA)", kind: "integer", hint: "Minimum imposé par l’encaisseur." },
    ],
  },
  {
    tab: "plafonds",
    title: "Plafonds de dépense et validité des devis",
    fields: [
      { key: "dailyCapUsd", label: "Plafond quotidien, toute la plateforme ($)", kind: "decimal" },
      { key: "dailyUserCapUsd", label: "Plafond quotidien par client ($)", kind: "decimal" },
      { key: "quoteValiditySeconds", label: "Validité d’un devis affiché (secondes)", kind: "integer", hint: "600 = 10 minutes. Un devis déjà affiché reste honoré pendant ce délai." },
      { key: "provisional", label: "Configuration provisoire (scénario pessimiste appliqué)", kind: "boolean", hint: "À ne décocher qu’une fois le taux sortant réellement mesuré." },
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
  const [tab, setTab] = useState<TabId>("marges");
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

  async function rollback(versionId: string) {
    const reason = window.prompt("Motif du retour à cette version ?");
    if (!reason || reason.trim().length < 3) return;
    setBusy(true);
    setMsg(null);
    try {
      await apiPost("/admin/pricing/rollback", { versionId, note: reason.trim() });
      setMsg({ ok: true, text: "Retour effectué : une nouvelle version recopie l’ancienne, rien n’a été supprimé." });
      router.refresh();
    } catch (err) {
      setMsg({
        ok: false,
        text: err instanceof ApiError ? (err.details[0]?.message ?? err.message) : "Retour impossible.",
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

  return (
    <div className="space-y-6">
      {msg && (
        <Alert variant={msg.ok ? "default" : "destructive"}>
          <AlertDescription>{msg.text}</AlertDescription>
        </Alert>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)}>
        <TabsList
          variant="line"
          className="w-full justify-start gap-1 overflow-x-auto rounded-none border-b p-0 group-data-[orientation=horizontal]/tabs:h-auto"
        >
          {TABS.map((t) => {
            const count = GROUPS.filter((g) => g.tab === t.id)
              .flatMap((g) => g.fields)
              .filter((f) => initial[f.key] !== draft[f.key]).length;
            return (
              <TabsTrigger
                key={t.id}
                value={t.id}
                className="h-11 flex-none rounded-none px-3 group-data-[orientation=horizontal]/tabs:after:bottom-0 focus-visible:ring-inset"
              >
                {t.label}
                {count > 0 && (
                  <span className="grid min-w-5 place-items-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                    {count}
                    <span className="sr-only"> modification{count > 1 ? "s" : ""} non appliquée{count > 1 ? "s" : ""}</span>
                  </span>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {TABS.map((t) => (
          <TabsContent key={t.id} value={t.id} className="space-y-8 pt-6">
            {GROUPS.filter((g) => g.tab === t.id).map((g) => (
              <fieldset key={g.title} className="space-y-4">
                <legend className="mb-1 text-lg font-bold">{g.title}</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  {g.fields.map((f) => {
                    const id = `p-${f.key}`;
                    const value = draft[f.key];
                    return (
                      <div key={f.key} className="space-y-1.5">
                        {f.kind === "boolean" ? (
                          <label className="flex items-start gap-3 text-sm">
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
                            <Label htmlFor={id}>{f.label}</Label>
                            <Input
                              id={id}
                              inputMode="decimal"
                              value={String(value)}
                              onChange={(e) => set(f.key, e.target.value)}
                            />
                          </>
                        )}
                        {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
                      </div>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </TabsContent>
        ))}
      </Tabs>

      <fieldset className="space-y-2 rounded-3xl bg-card p-4 shadow-card">
        <legend className="px-1 text-lg font-bold">Motif</legend>
        <Label htmlFor="pricing-note">
          Pourquoi ce changement ? (obligatoire, conservé avec la version)
        </Label>
        <Textarea
          id="pricing-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Taux sortant mesuré sur la recharge du 20 novembre."
        />
        <div className="flex flex-wrap gap-2 pt-2">
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
              Annuler les changements
            </Button>
          )}
        </div>
        {!dirty && <p className="text-sm text-muted-foreground">Aucun changement en attente.</p>}
        {dirty && note.trim().length < 3 && (
          <p className="text-sm text-muted-foreground">Indiquez un motif pour pouvoir appliquer.</p>
        )}
        {dirty && preview === null && note.trim().length >= 3 && (
          <p className="text-sm text-muted-foreground">Regardez l’aperçu avant d’appliquer.</p>
        )}
      </fieldset>

      {preview && (
        <section aria-labelledby="apercu" className="space-y-4">
          <h2 id="apercu" className="text-xl font-bold">
            Aperçu avant / après
          </h2>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span>
              Taux retenu : {preview.pricingRateBefore} → <strong>{preview.pricingRateAfter}</strong> F/$
            </span>
            <span>
              Plancher du crédit : {preview.creditFloorBeforeFcfa} → <strong>{preview.creditFloorAfterFcfa}</strong> F
            </span>
          </div>

          {needsBelowCost && (
            <div className="space-y-2 rounded-3xl border border-destructive/40 bg-destructive/8 p-4">
              <p className="font-semibold text-destructive">
                Cette configuration vend sous le coût sur {preview.belowCostLabels.length} ligne(s).
              </p>
              <p className="text-sm text-muted-foreground">
                {preview.belowCostLabels.slice(0, 6).join(" ; ")}
                {preview.belowCostLabels.length > 6 ? " …" : ""}
              </p>
              <label className="flex items-start gap-3 text-sm font-medium">
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
            <div className="space-y-2 rounded-3xl border border-warning/40 bg-warning/8 p-4">
              {preview.bigPriceChange && (
                <p className="font-semibold">
                  Le prix change de plus de 20 % sur {preview.bigPriceChangeLabels.length} ligne(s).
                </p>
              )}
              {preview.underMinMargin && (
                <p className="font-semibold">
                  La marge passe sous le minimum ({Number(preview.after.minMarginPercent)} %) sur{" "}
                  {preview.underMinMarginLabels.length} ligne(s).
                </p>
              )}
              <label className="flex items-start gap-3 text-sm font-medium">
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

      <section aria-labelledby="historique" className="space-y-3">
        <h2 id="historique" className="text-xl font-bold">
          Historique des versions
        </h2>
        <p className="text-sm text-muted-foreground">
          Rien n’est jamais modifié ni supprimé : un retour en arrière crée une nouvelle version qui recopie
          l’ancienne. Chaque génération garde la version avec laquelle elle a été facturée.
        </p>
        <div className="overflow-x-auto rounded-3xl bg-card shadow-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>En vigueur depuis</TableHead>
                <TableHead>Marge</TableHead>
                <TableHead>Taux carte</TableHead>
                <TableHead>Perte circuit</TableHead>
                <TableHead>Bonus compté</TableHead>
                <TableHead>État</TableHead>
                <TableHead>Motif</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sections.history.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {new Date(v.effectiveFrom).toLocaleString("fr-FR")}
                  </TableCell>
                  <TableCell className="tabular-nums">{Number(v.marginPercent)} %</TableCell>
                  <TableCell className="tabular-nums">{Number(v.cardFcfaPerUsd)} F/$</TableCell>
                  <TableCell className="tabular-nums">{Number(v.circuitLossPercent)} %</TableCell>
                  <TableCell className="tabular-nums">{Number(v.bonusValuationPercent)} %</TableCell>
                  <TableCell>
                    {v.id === sections.current.id ? (
                      <Pill tone="ok">En vigueur</Pill>
                    ) : v.provisional ? (
                      <Pill tone="warn">Provisoire</Pill>
                    ) : (
                      <Pill>Archivée</Pill>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[18rem] truncate" title={v.note ?? ""}>
                    {v.note ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {v.id === sections.current.id ? (
                      <span className="text-sm text-muted-foreground">—</span>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => void rollback(v.id)}
                      >
                        Revenir à cette version
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
