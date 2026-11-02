"use client";

import { ArrowLeft, ArrowRight, Check, CheckCircle2, CircleAlert, CircleX, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { adminPasswordSchema, SETUP_SECRET_HEADER, type SessionUser, type SetupCheckItem, type SetupDiagnostic, type SetupSummary } from "@yamboka/shared";
import { Field } from "@/components/auth/field";
import { PasswordInput } from "@/components/auth/password-input";
import { LogoMark } from "@/components/logo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api-client";
import { SITE_URL } from "@/lib/site";

const STEPS = [
  { label: "Vérification", hint: "Secret et diagnostic du serveur" },
  { label: "Administrateur", hint: "Votre compte, protégé" },
  { label: "Configuration", hint: "Données de base et e-mails" },
  { label: "Finalisation", hint: "Tout est prêt" },
] as const;

const PASSWORD_RULES = [
  { label: "12 caractères minimum", test: (v: string) => v.length >= 12 },
  { label: "Une minuscule", test: (v: string) => /[a-z]/.test(v) },
  { label: "Une majuscule", test: (v: string) => /[A-Z]/.test(v) },
  { label: "Un chiffre", test: (v: string) => /\d/.test(v) },
  { label: "Un symbole", test: (v: string) => /[^A-Za-z0-9]/.test(v) },
] as const;

/** Appel protégé par le secret d'installation (en-tête dédié, jamais stocké : il reste en mémoire le temps de l'assistant). */
async function setupCall<T>(path: string, secret: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", [SETUP_SECRET_HEADER]: secret },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Connexion impossible. Vérifiez votre réseau puis réessayez.");
  }
  const data = (await res.json().catch(() => null)) as { code?: string; message?: string; details?: { field: string; message: string }[] } | null;
  if (!res.ok) {
    throw new ApiError(res.status, data?.code ?? "ERROR", data?.message ?? "Une erreur est survenue.", Array.isArray(data?.details) ? data.details : []);
  }
  return data as T;
}

const TONES = {
  ok: { Icon: CheckCircle2, text: "text-success", bg: "bg-success/10", label: "OK" },
  warning: { Icon: CircleAlert, text: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10", label: "À surveiller" },
  error: { Icon: CircleX, text: "text-destructive", bg: "bg-destructive/10", label: "Erreur" },
} as const;

function Check_({ item, index = 0 }: { item: SetupCheckItem; index?: number }) {
  const t = TONES[item.state];
  return (
    <li
      className="flex gap-3 rounded-xl border p-3 animate-in fade-in slide-in-from-bottom-2 fill-mode-both sm:p-4"
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${t.bg}`}>
        <t.Icon className={`size-5 ${t.text}`} aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-2 font-medium">
          {item.label}
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${t.bg} ${t.text}`}>{t.label}</span>
        </p>
        <p className="mt-0.5 break-words text-sm text-muted-foreground">{item.detail}</p>
      </div>
    </li>
  );
}

function StepHeader({ title, lead }: { title: string; lead: string }) {
  return (
    <div className="space-y-1">
      <h2 tabIndex={-1} className="text-xl font-bold outline-none sm:text-2xl">{title}</h2>
      <p className="text-sm text-muted-foreground sm:text-base">{lead}</p>
    </div>
  );
}

function Strength({ value }: { value: string }) {
  const passed = PASSWORD_RULES.filter((r) => r.test(value)).length;
  const level = value.length === 0 ? 0 : passed <= 2 ? 1 : passed <= 4 ? 2 : 3;
  const colors = ["bg-muted", "bg-destructive", "bg-amber-500", "bg-success"];
  const names = ["", "Faible", "Moyen", "Solide"];
  return (
    <div className="space-y-2" aria-live="polite">
      <div className="flex items-center gap-2">
        <div className="grid flex-1 grid-cols-3 gap-1" aria-hidden>
          {[1, 2, 3].map((n) => (
            <span key={n} className={`h-1.5 rounded-full transition-colors duration-300 ${level >= n ? colors[level] : "bg-muted"}`} />
          ))}
        </div>
        <span className="w-14 text-right text-xs font-medium text-muted-foreground">{names[level]}</span>
      </div>
      <ul className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs min-[420px]:grid-cols-2">
        {PASSWORD_RULES.map((r) => {
          const ok = r.test(value);
          return (
            <li key={r.label} className={`flex items-center gap-1.5 transition-colors ${ok ? "text-success" : "text-muted-foreground"}`}>
              {ok ? <Check className="size-3.5" aria-hidden /> : <span className="grid size-3.5 place-items-center" aria-hidden><span className="size-1.5 rounded-full bg-current opacity-50" /></span>}
              {r.label}
              <span className="sr-only">{ok ? " : respecté" : " : manquant"}</span>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">Trois types de caractères sur quatre suffisent, en plus des 12 caractères.</p>
    </div>
  );
}

export function SetupWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [secret, setSecret] = useState("");
  const [diag, setDiag] = useState<SetupDiagnostic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", password: "", confirmPassword: "", acceptLegal: false });
  const [result, setResult] = useState<{ user: SessionUser; summary: SetupSummary } | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const first = useRef(true);

  // Après un changement d'étape, le focus passe au titre de l'étape (lecteurs d'écran, clavier) sans faire défiler la page.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    panel.current?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    panel.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [step]);

  const fail = (e: unknown) => {
    if (e instanceof ApiError) {
      const mapped: Record<string, string> = {};
      for (const d of e.details) mapped[d.field] = d.message;
      setFieldErrors(mapped);
      setError(Object.keys(mapped).length ? "Corrigez les champs signalés." : e.message);
      if (e.code === "SETUP_LOCKED") router.refresh();
    } else setError("Une erreur est survenue. Veuillez réessayer.");
  };

  async function runCheck(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setDiag(await setupCall<SetupDiagnostic>("/setup/check", secret));
    } catch (err) {
      setDiag(null);
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function createAdmin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    // Même règle que le serveur, pour un retour immédiat (le serveur revérifie tout).
    const pw = adminPasswordSchema.safeParse(form.password);
    if (!pw.success) return setFieldErrors({ password: pw.error.issues[0].message });
    if (form.password !== form.confirmPassword) return setFieldErrors({ confirmPassword: "Les mots de passe ne correspondent pas." });
    setBusy(true);
    try {
      const res = await setupCall<{ user: SessionUser; summary: SetupSummary }>("/setup/complete", secret, form);
      setSecret(""); // le secret n'est plus utile : on ne le garde pas en mémoire
      setResult(res);
      setStep(2);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  const progress = ((step + (step === 3 ? 1 : 0.5)) / STEPS.length) * 100;

  return (
    <div className="w-full max-w-4xl overflow-hidden rounded-3xl border bg-card shadow-soft lg:grid lg:grid-cols-[19rem_1fr]">
      {/* Panneau de marque : bandeau compact sur mobile, colonne avec stepper vertical à partir de lg */}
      <aside className="relative isolate overflow-hidden bg-primary p-5 text-primary-foreground sm:p-6 lg:p-8">
        <span aria-hidden className="absolute -right-10 -top-10 -z-10 size-40 animate-float rounded-full bg-accent/30 blur-2xl" />
        <span aria-hidden className="absolute -bottom-16 -left-10 -z-10 size-48 animate-float rounded-full bg-background/10 blur-2xl [animation-delay:2s]" />
        <div className="flex items-center justify-between gap-3 lg:block">
          <a href={SITE_URL} className="inline-flex items-center gap-2.5 rounded-md font-heading text-lg font-bold" aria-label="Yamboka, retour au site">
            <span className="rounded-[0.6rem] bg-background p-0.5"><LogoMark size={28} /></span>
            Yamboka
          </a>
          <a href={SITE_URL} className="text-xs text-primary-foreground/80 underline-offset-4 hover:underline lg:mt-2 lg:block lg:text-sm">Retour au site</a>
        </div>
        <h1 className="mt-5 text-2xl font-bold leading-tight lg:mt-10 lg:text-3xl">Installation de Yamboka</h1>
        <p className="mt-2 hidden text-sm text-primary-foreground/80 sm:block">Créez le premier administrateur en quelques étapes sécurisées.</p>

        {/* Mobile / tablette : barre de progression */}
        <div className="mt-4 lg:hidden">
          <p className="mb-2 flex justify-between text-xs font-medium text-primary-foreground/90">
            <span>Étape {step + 1} sur {STEPS.length}</span>
            <span>{STEPS[step].label}</span>
          </p>
          <div className="h-1.5 overflow-hidden rounded-full bg-background/25" role="progressbar" aria-valuemin={0} aria-valuemax={STEPS.length} aria-valuenow={step + 1} aria-label="Progression de l’installation">
            <div className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {/* Desktop : stepper vertical */}
        <ol aria-label="Étapes de l’installation" className="relative mt-10 hidden space-y-6 lg:block">
          <span aria-hidden className="absolute bottom-3 left-[1.05rem] top-3 w-px bg-background/25" />
          <span aria-hidden className="absolute left-[1.05rem] top-3 w-px bg-accent transition-[height] duration-500 ease-out" style={{ height: `${(step / (STEPS.length - 1)) * 87}%` }} />
          {STEPS.map((s, i) => {
            const done = i < step;
            return (
              <li key={s.label} aria-current={i === step ? "step" : undefined} className="relative flex items-start gap-3">
                <span
                  className={`grid size-9 shrink-0 place-items-center rounded-full border-2 text-sm font-bold transition-all duration-300 ${
                    done ? "border-accent bg-accent text-accent-foreground" : i === step ? "scale-110 border-accent bg-primary text-accent ring-4 ring-accent/25" : "border-background/30 bg-primary text-primary-foreground/60"
                  }`}
                >
                  {done ? <Check className="size-4" aria-hidden /> : i + 1}
                </span>
                <span className={`pt-0.5 transition-opacity ${i > step ? "opacity-60" : ""}`}>
                  <span className="block font-semibold"><span className="sr-only">Étape {i + 1} : </span>{s.label}</span>
                  <span className="block text-xs text-primary-foreground/75">{s.hint}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </aside>

      <div ref={panel} className="min-w-0 p-5 sm:p-8 lg:p-10">
        {error && (
          <Alert variant="destructive" role="alert" className="mb-6 animate-in fade-in slide-in-from-top-2">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div key={step} className="animate-in fade-in slide-in-from-right-4 duration-300">
          {step === 0 && (
            <form onSubmit={runCheck} className="space-y-6" noValidate>
              <StepHeader title="Vérifions votre serveur" lead="Saisissez le secret d’installation défini sur le serveur. Il protège cet assistant tant que la plateforme n’est pas initialisée." />
              <Field id="secret" label="Secret d’installation" hint="Variable SETUP_SECRET du serveur (24 caractères minimum).">
                <PasswordInput id="secret" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} />
              </Field>
              <Button type="submit" size="lg" className="h-12 w-full sm:w-auto" disabled={busy || secret.length < 8}>
                {busy ? <><Loader2 className="animate-spin" aria-hidden /> Vérification…</> : <><ShieldCheck aria-hidden /> Vérifier l’installation</>}
              </Button>
              {diag && (
                <div className="space-y-4">
                  <ul className="space-y-2" aria-label="Résultat du diagnostic">
                    {diag.items.map((i, n) => <Check_ key={i.key} item={i} index={n} />)}
                  </ul>
                  {!diag.canContinue && <p role="alert" className="text-sm font-medium text-destructive">Corrigez les erreurs ci-dessus sur le serveur, puis relancez la vérification.</p>}
                  <div className="flex justify-end">
                    <Button type="button" size="lg" className="h-12 w-full sm:w-auto" disabled={!diag.canContinue} onClick={() => setStep(1)}>
                      Continuer <ArrowRight aria-hidden />
                    </Button>
                  </div>
                </div>
              )}
            </form>
          )}

          {step === 1 && (
            <form onSubmit={createAdmin} className="space-y-6" noValidate>
              <StepHeader title="Créez l’administrateur" lead="Ce compte gère toute la plateforme : choisissez un mot de passe solide, qui n’est utilisé nulle part ailleurs." />
              <div className="grid gap-5 sm:grid-cols-2">
                <Field id="firstName" label="Prénom" error={fieldErrors.firstName}>
                  <Input id="firstName" autoComplete="given-name" value={form.firstName} onChange={set("firstName")} aria-invalid={!!fieldErrors.firstName} />
                </Field>
                <Field id="lastName" label="Nom" error={fieldErrors.lastName}>
                  <Input id="lastName" autoComplete="family-name" value={form.lastName} onChange={set("lastName")} aria-invalid={!!fieldErrors.lastName} />
                </Field>
              </div>
              <Field id="email" label="Adresse e-mail" error={fieldErrors.email}>
                <Input id="email" type="email" inputMode="email" autoComplete="email" value={form.email} onChange={set("email")} aria-invalid={!!fieldErrors.email} />
              </Field>
              <div className="space-y-3">
                <Field id="password" label="Mot de passe" error={fieldErrors.password}>
                  <PasswordInput id="password" autoComplete="new-password" value={form.password} onChange={set("password")} aria-invalid={!!fieldErrors.password} />
                </Field>
                <Strength value={form.password} />
              </div>
              <Field id="confirmPassword" label="Confirmer le mot de passe" error={fieldErrors.confirmPassword}>
                <PasswordInput id="confirmPassword" autoComplete="new-password" value={form.confirmPassword} onChange={set("confirmPassword")} aria-invalid={!!fieldErrors.confirmPassword} />
              </Field>
              <div className="flex items-start gap-3 rounded-xl border p-3">
                <Checkbox id="acceptLegal" checked={form.acceptLegal} onCheckedChange={(v) => setForm({ ...form, acceptLegal: v === true })} className="mt-0.5 size-5" />
                <label htmlFor="acceptLegal" className="text-sm leading-snug">
                  J’accepte les <a href={`${SITE_URL}/conditions-utilisation`} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline underline-offset-4">conditions d’utilisation</a> et la <a href={`${SITE_URL}/charte-utilisation`} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline underline-offset-4">charte d’utilisation</a>.
                </label>
              </div>
              {fieldErrors.acceptLegal && <p role="alert" className="text-sm font-medium text-destructive">{fieldErrors.acceptLegal}</p>}
              <p className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">Cette étape crée le compte administrateur et initialise les données de base (devise, packs, produits, paramètres, textes légaux) en une seule opération. Elle ne peut être faite qu’une fois.</p>
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                <Button type="button" variant="ghost" size="lg" className="h-12" onClick={() => { setError(null); setFieldErrors({}); setStep(0); }} disabled={busy}>
                  <ArrowLeft aria-hidden /> Retour
                </Button>
                <Button type="submit" size="lg" className="h-12" disabled={busy || !form.acceptLegal}>
                  {busy ? <><Loader2 className="animate-spin" aria-hidden /> Initialisation…</> : "Créer l’administrateur et initialiser"}
                </Button>
              </div>
            </form>
          )}

          {step === 2 && result && (
            <div className="space-y-6">
              <StepHeader title="Configuration initiale" lead="Voici ce qui a été préparé sur votre plateforme." />
              <ul className="space-y-2">
                <Check_ index={0} item={{ key: "base", label: "Données de base", state: "ok", detail: `${result.summary.baseData.packs} packs, ${result.summary.baseData.products} produits, ${result.summary.baseData.settings} paramètres, ${result.summary.baseData.legalDocuments} textes légaux (créés s’ils n’existaient pas).` }} />
                <Check_ index={1} item={{ key: "email", label: "E-mails", state: result.summary.email.ok ? "ok" : "warning", detail: result.summary.email.detail }} />
                <Check_ index={2} item={{ key: "providers", label: "Fournisseurs", state: "warning", detail: "Paiement et génération en simulation (phase 1)." }} />
              </ul>
              <div className="flex justify-end">
                <Button size="lg" className="h-12 w-full sm:w-auto" onClick={() => setStep(3)}>Continuer <ArrowRight aria-hidden /></Button>
              </div>
            </div>
          )}

          {step === 3 && result && (
            <div className="space-y-6">
              <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:text-left">
                <span className="relative grid size-16 shrink-0 place-items-center rounded-full bg-success/15">
                  <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-success/20 [animation-iteration-count:2]" />
                  <svg viewBox="0 0 24 24" className="relative size-9 text-success" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M5 12.5 10 17.5 19 7" strokeDasharray="30" className="animate-draw" />
                  </svg>
                </span>
                <div>
                  <h2 tabIndex={-1} className="text-xl font-bold sm:text-2xl">Installation terminée</h2>
                  <p className="text-sm text-muted-foreground sm:text-base">Yamboka est prêt. Vous êtes connecté en tant qu’administrateur.</p>
                </div>
              </div>
              <dl className="divide-y rounded-xl border px-4 text-sm">
                <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:justify-between sm:gap-3"><dt className="text-muted-foreground">Administrateur</dt><dd className="font-medium">{result.user.firstName} {result.user.lastName}</dd></div>
                <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:justify-between sm:gap-3"><dt className="text-muted-foreground">Connexion</dt><dd className="break-all font-medium">{result.summary.adminEmail}</dd></div>
                <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:justify-between sm:gap-3"><dt className="text-muted-foreground">Assistant</dt><dd className="font-medium">Verrouillé définitivement</dd></div>
              </dl>
              <p className="rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">Pensez à retirer <code className="rounded bg-background px-1">SETUP_SECRET</code> des variables du serveur : il ne sert plus.</p>
              <Button size="lg" className="h-12 w-full sm:w-auto" onClick={() => { router.replace("/admin"); router.refresh(); }}>
                <Sparkles aria-hidden /> Ouvrir l’administration
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
