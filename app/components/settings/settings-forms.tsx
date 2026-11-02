"use client";

import type { EmailPrefKey, PreferencesView } from "@yamboka/shared";
import { BadgeCheck, Loader2, MailWarning } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toaster";
import { ApiError, apiPatch } from "@/lib/api-client";

const EVENTS: { key: EmailPrefKey; title: string; text: string }[] = [
  { key: "generationReady", title: "Création terminée", text: "Un e-mail avec un lien direct dès que votre image ou votre vidéo est prête." },
  { key: "generationFailed", title: "Création échouée", text: "Un e-mail si une création n’aboutit pas." },
  { key: "paymentConfirmed", title: "Paiement confirmé", text: "Votre reçu par e-mail à chaque achat de crédits." },
  { key: "creditsRefunded", title: "Crédits remboursés", text: "Un e-mail quand des crédits vous sont restitués." },
];

/**
 * Préférences d'e-mail. Un interrupteur ne change qu'APRÈS la confirmation du serveur : pendant l'enregistrement
 * il est bloqué et affiche l'attente, en cas d'échec il reste sur sa valeur d'origine avec un message.
 */
export function NotificationPrefs({ initial }: { initial: PreferencesView }) {
  const [prefs, setPrefs] = useState(initial.emailPrefs);
  const [saving, setSaving] = useState<EmailPrefKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function change(key: EmailPrefKey, value: boolean) {
    setSaving(key);
    setError(null);
    try {
      const saved = await apiPatch<PreferencesView>("/preferences", { emailPrefs: { [key]: value } });
      setPrefs(saved.emailPrefs);
      toast.success("Préférence enregistrée.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Enregistrement impossible. Vérifiez votre connexion puis réessayez.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <section aria-labelledby="notif-title" className="space-y-3">
      <div>
        <h2 id="notif-title" className="font-heading text-lg font-bold">Notifications par e-mail</h2>
        <p className="text-sm text-muted-foreground">
          Les notifications dans l’application (la cloche) restent actives dans tous les cas. Ici, vous choisissez seulement les e-mails.
        </p>
      </div>

      {!initial.emailVerified && (
        <Alert className="border-accent bg-accent/15" role="status">
          <MailWarning className="size-4" aria-hidden />
          <AlertDescription>
            Votre adresse e-mail n’est pas confirmée : aucun e-mail de notification ne sera envoyé tant qu’elle ne l’est pas.{" "}
            <Link href="/verifier-email" className="font-medium underline">Confirmer mon adresse</Link>
          </AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <ul className="divide-y rounded-2xl border bg-card">
        {EVENTS.map((ev) => (
          <li key={ev.key}>
            <label htmlFor={`pref-${ev.key}`} className="flex min-h-16 cursor-pointer items-center gap-4 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{ev.title}</span>
                <span className="block text-sm text-muted-foreground">{ev.text}</span>
              </span>
              {saving === ev.key && <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none" aria-label="Enregistrement…" />}
              <Switch
                id={`pref-${ev.key}`}
                checked={prefs[ev.key]}
                disabled={saving !== null}
                onCheckedChange={(v) => void change(ev.key, v)}
                aria-label={`E-mail : ${ev.title}`}
              />
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function AccountSummary({ name, email, emailVerified, phone }: { name: string; email: string; emailVerified: boolean; phone: string | null }) {
  return (
    <section aria-labelledby="account-title" className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <h2 id="account-title" className="font-heading text-lg font-bold">Compte</h2>
        <Link href="/app/profil" className="text-sm font-medium text-primary underline-offset-4 hover:underline">Modifier mon profil et mon mot de passe</Link>
      </div>
      <dl className="divide-y rounded-2xl border bg-card px-4 text-sm">
        <div className="flex items-baseline justify-between gap-4 py-2.5"><dt className="text-muted-foreground">Nom</dt><dd className="font-medium">{name}</dd></div>
        <div className="flex items-baseline justify-between gap-4 py-2.5">
          <dt className="text-muted-foreground">Adresse e-mail</dt>
          <dd className="flex min-w-0 items-center gap-2 font-medium">
            <span className="truncate">{email}</span>
            {emailVerified ? <span className="inline-flex shrink-0 items-center gap-1 text-xs text-success"><BadgeCheck className="size-3.5" aria-hidden /> Confirmée</span> : <span className="shrink-0 text-xs text-destructive">Non confirmée</span>}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 py-2.5"><dt className="text-muted-foreground">Téléphone</dt><dd className="font-medium">{phone ?? "Non renseigné"}</dd></div>
      </dl>
    </section>
  );
}
