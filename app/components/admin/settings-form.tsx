"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiPatch, apiPost } from "@/lib/api-client";

type Value = string | number | boolean;
interface Def {
  key: string;
  label: string;
  hint?: string;
  kind: "number" | "boolean" | "text" | "select";
  options?: { value: string; label: string }[];
}

/** Onglets : un seul formulaire, un seul motif, un seul bouton d'enregistrement pour tous les onglets. */
const TABS = [
  { id: "general", label: "Général" },
  { id: "rentabilite", label: "Rentabilité" },
  { id: "generation", label: "Génération" },
  { id: "fichiers", label: "Fichiers" },
  { id: "securite", label: "Sécurité" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const GROUPS: { tab: TabId; title: string; fields: Def[] }[] = [
  {
    tab: "general",
    title: "Mode maintenance",
    fields: [
      { key: "maintenanceMode", label: "Activer le mode maintenance", kind: "boolean", hint: "Annonce la maintenance (bandeau) ; le blocage des nouvelles créations s’appliquera à l’ouverture de la génération." },
      { key: "maintenanceMessage", label: "Message affiché aux clients", kind: "text" },
    ],
  },
  {
    tab: "rentabilite",
    title: "Rentabilité (règles de marge)",
    fields: [
      { key: "minMarginPercent", label: "Marge minimale (%)", kind: "number" },
      { key: "usdToXafRate", label: "Taux USD → FCFA", kind: "number" },
      { key: "fxFeePercent", label: "Frais de change (%)", kind: "number" },
      { key: "openpayCommissionPercent", label: "Commission OpenPay (%)", kind: "number" },
      { key: "regenOverheadPercent", label: "Surcoût de regénération (%)", kind: "number" },
    ],
  },
  {
    tab: "rentabilite",
    title: "Crédits",
    fields: [
      { key: "purchasedCreditsExpiryMonths", label: "Validité des crédits achetés (mois)", kind: "number" },
    ],
  },
  {
    tab: "generation",
    title: "Limites de génération et seuils d’alerte",
    fields: [
      { key: "maxConcurrentGenerationsPerUser", label: "Générations simultanées par client", kind: "number" },
      { key: "maxConcurrentGenerationsGlobal", label: "Générations simultanées au total", kind: "number" },
      { key: "providerBalanceAlertUsd", label: "Alerte solde fournisseur (USD)", kind: "number" },
      { key: "failureRateAlertPercent", label: "Alerte taux d’échec (%)", kind: "number" },
    ],
  },
  {
    tab: "fichiers",
    title: "Conservation des fichiers",
    fields: [
      { key: "inputRetentionDays", label: "Fichiers envoyés : conservation (jours)", kind: "number" },
      { key: "outputRetentionDays", label: "Créations : conservation (jours)", kind: "number" },
      { key: "deletionReminderDays", label: "Rappel avant suppression (jours)", kind: "number" },
    ],
  },
  {
    tab: "securite",
    title: "Sécurité de connexion",
    fields: [
      {
        key: "loginOtpMode",
        label: "Confirmer la connexion par code e-mail",
        kind: "select",
        options: [
          { value: "off", label: "Jamais (mot de passe seul)" },
          { value: "admin", label: "Administrateurs uniquement" },
          { value: "all", label: "Tous les comptes avec mot de passe" },
        ],
        hint: "Exige que l’envoi d’e-mails fonctionne. Les comptes Google ne sont pas concernés.",
      },
    ],
  },
];

export function SettingsForm({ initial, emailProvider }: { initial: Record<string, Value>; emailProvider: "console" | "smtp" }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, Value>>(initial);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<TabId>("general");

  const changed = Object.fromEntries(Object.entries(values).filter(([k, v]) => initial[k] !== v));
  const dirty = Object.keys(changed).length > 0;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await apiPatch("/admin/settings", { values: changed, reason: reason.trim() });
      setReason("");
      setMsg({ ok: true, text: "Paramètres enregistrés et consignés au journal d’audit." });
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError ? (err.details[0]?.message ?? err.message) : "Enregistrement impossible." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-8" noValidate>
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)}>
        <TabsList variant="line" className="w-full justify-start gap-1 overflow-x-auto rounded-none border-b p-0 group-data-[orientation=horizontal]/tabs:h-auto">
          {TABS.map((t) => {
            const count = GROUPS.filter((g) => g.tab === t.id).flatMap((g) => g.fields).filter((f) => f.key in changed).length;
            return (
              <TabsTrigger key={t.id} value={t.id} className="h-11 flex-none rounded-none px-3 group-data-[orientation=horizontal]/tabs:after:bottom-0 focus-visible:ring-inset">
                {t.label}
                {count > 0 && (
                  <span className="grid min-w-5 place-items-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                    {count}<span className="sr-only"> modification{count > 1 ? "s" : ""} non enregistrée{count > 1 ? "s" : ""}</span>
                  </span>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>
        {TABS.map((t) => (
          <TabsContent key={t.id} value={t.id} className="space-y-8 pt-6">
            {t.id === "general" && (
              <section aria-labelledby="fournisseurs" className="space-y-3">
                <h2 id="fournisseurs" className="text-lg font-bold">Fournisseurs</h2>
                <EmailTestPanel provider={emailProvider} />
                <p className="text-sm text-muted-foreground">Paiement (OpenPay) et génération (Higgsfield) : simulés en phase 1 ; les clés se configurent dans les variables d’environnement du serveur, jamais ici.</p>
              </section>
            )}
            {GROUPS.filter((g) => g.tab === t.id).map((g) => (
            <fieldset key={g.title} className="space-y-4">
              <legend className="mb-1 text-lg font-bold">{g.title}</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                {g.fields.map((f) => {
                  const id = `s-${f.key}`;
                  const v = values[f.key];
                  return (
                    <div key={f.key} className={`space-y-1.5 ${f.kind === "text" ? "sm:col-span-2" : ""}`}>
                      {f.kind === "boolean" ? (
                        <label className="flex items-start gap-3 text-sm">
                          <input id={id} type="checkbox" checked={Boolean(v)} onChange={(e) => setValues({ ...values, [f.key]: e.target.checked })} className="mt-0.5 size-5" />
                          <span className="font-medium">{f.label}</span>
                        </label>
                      ) : (
                        <>
                          <Label htmlFor={id}>{f.label}</Label>
                          {f.kind === "select" ? (
                            <select id={id} value={String(v)} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm">
                              {f.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                          ) : (
                            <Input
                              id={id}
                              inputMode={f.kind === "number" ? "decimal" : undefined}
                              value={String(v ?? "")}
                              onChange={(e) => setValues({ ...values, [f.key]: f.kind === "number" ? Number(e.target.value.replace(",", ".")) || 0 : e.target.value })}
                            />
                          )}
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

      <div className={`space-y-3 border-t pt-6 ${dirty ? "sticky bottom-0 z-10 -mx-4 bg-background/95 px-4 pb-4 backdrop-blur md:-mx-6 md:px-6" : ""}`}>
        <div className="space-y-1.5">
          <Label htmlFor="settings-reason">Motif de la modification (conservé dans le journal d’audit)</Label>
          <Textarea id="settings-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Au moins 5 caractères" />
        </div>
        {msg && (
          <Alert variant={msg.ok ? "default" : "destructive"} role={msg.ok ? "status" : "alert"}>
            <AlertDescription>{msg.text}</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={!dirty || busy || reason.trim().length < 5}>
            {busy ? "Enregistrement…" : dirty ? `Enregistrer ${Object.keys(changed).length} modification(s)` : "Aucune modification"}
          </Button>
          {dirty && reason.trim().length < 5 && <p className="text-sm text-muted-foreground">Indiquez un motif d’au moins 5 caractères pour enregistrer.</p>}
        </div>
      </div>
    </form>
  );
}

/** Test de la configuration e-mail : vérifie la connexion SMTP puis envoie un message à l'administrateur connecté. */
export function EmailTestPanel({ provider }: { provider: "console" | "smtp" }) {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ ok: boolean; detail: string } | null>(null);

  async function run() {
    setBusy(true);
    setRes(null);
    try {
      setRes(await apiPost<{ ok: boolean; detail: string }>("/admin/email/test"));
    } catch (e) {
      setRes({ ok: false, detail: e instanceof ApiError ? e.message : "Test impossible." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4">
      <p className="text-sm">
        Envoi d’e-mails : <strong>{provider === "smtp" ? "SMTP (envoi réel)" : "console (aucun e-mail réel)"}</strong>. Variables : <code className="rounded bg-muted px-1">EMAIL_PROVIDER</code>, <code className="rounded bg-muted px-1">SMTP_*</code> (serveur, non modifiables ici).
      </p>
      <Button type="button" variant="outline" onClick={run} disabled={busy}>{busy ? "Test en cours…" : "Tester l’envoi d’e-mails"}</Button>
      {res && (
        <Alert variant={res.ok ? "default" : "destructive"} role={res.ok ? "status" : "alert"}>
          <AlertDescription>{res.detail}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
