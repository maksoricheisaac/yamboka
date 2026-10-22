"use client";

import { MailWarning } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ApiError, apiPost } from "@/lib/api-client";

/** Bandeau affiché tant que l'adresse e-mail n'est pas vérifiée (achat et création bloqués, UF-05). */
export function VerifyEmailBanner({ email }: { email: string }) {
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function resend() {
    setPending(true);
    try {
      const res = await apiPost<{ message: string }>("/auth/resend-verification");
      setStatus({ kind: "ok", text: res.message });
    } catch (e) {
      setStatus({ kind: "error", text: e instanceof ApiError ? e.message : "Envoi impossible pour le moment." });
    } finally {
      setPending(false);
    }
  }

  return (
    <Alert className="border-accent bg-accent/15">
      <MailWarning aria-hidden />
      <AlertTitle>Confirmez votre adresse e-mail</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>
          Nous avons envoyé un lien à <strong>{email}</strong>. Tant que l’adresse n’est pas confirmée, vous ne pouvez
          ni acheter de crédits ni créer de vidéo.
        </p>
        <Button variant="outline" onClick={resend} disabled={pending}>
          {pending ? "Envoi…" : "Renvoyer le lien"}
        </Button>
        {status && (
          <p role="status" className={status.kind === "error" ? "font-medium text-destructive" : "font-medium"}>
            {status.text}
          </p>
        )}
      </AlertDescription>
    </Alert>
  );
}
