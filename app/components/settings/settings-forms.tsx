"use client";

import type { EmailPrefKey, PreferencesView } from "@yamboka/shared";
import { Loader2, MailWarning } from "lucide-react";
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

      <ul className="divide-y rounded-3xl bg-card shadow-card">
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
