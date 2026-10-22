"use client";

import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ApiError, apiPost } from "@/lib/api-client";

type State = "idle" | "loading" | "done" | "error";

/**
 * La validation se fait par un clic (POST), jamais au simple chargement de la page : certains
 * antivirus et messageries ouvrent les liens automatiquement et consommeraient le jeton à usage unique.
 */
export function VerifyEmailCard() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState("");

  if (!token) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>
          Ce lien est incomplet. Ouvrez le lien depuis l’e-mail reçu, ou demandez-en un nouveau depuis{" "}
          <Link href="/app" className="font-medium underline">votre espace</Link>.
        </AlertDescription>
      </Alert>
    );
  }

  async function confirm() {
    setState("loading");
    try {
      await apiPost("/auth/verify-email", { token });
      setState("done");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : "Une erreur est survenue. Veuillez réessayer.");
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div className="space-y-4">
        <Alert role="status">
          <CheckCircle2 aria-hidden />
          <AlertDescription>Votre adresse e-mail est confirmée. Merci !</AlertDescription>
        </Alert>
        <Button asChild size="lg" className="w-full">
          <Link href="/app">Accéder à mon espace</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {state === "error" && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            {message} Connectez-vous pour recevoir un nouveau lien depuis{" "}
            <Link href="/app" className="font-medium underline">votre espace</Link>.
          </AlertDescription>
        </Alert>
      )}
      <Button size="lg" className="w-full" onClick={confirm} disabled={state === "loading"}>
        {state === "loading" ? "Vérification…" : "Confirmer mon adresse e-mail"}
      </Button>
    </div>
  );
}
