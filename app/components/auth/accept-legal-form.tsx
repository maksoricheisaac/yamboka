"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ApiError, apiPost } from "@/lib/api-client";
import { SITE_URL } from "@/lib/site";

/** Écran d'acceptation obligatoire (inscription Google, ou nouvelle version majeure des textes). */
export function AcceptLegalForm() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      await apiPost("/me/legal-acceptances");
      router.replace("/app");
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Une erreur est survenue. Veuillez réessayer.");
      setPending(false);
    }
  }

  return (
    <div className="space-y-5">
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex items-start gap-3">
        <Checkbox id="accept" checked={checked} onCheckedChange={(v) => setChecked(v === true)} className="mt-0.5 size-5" />
        <label htmlFor="accept" className="text-sm leading-snug">
          J’ai lu et j’accepte les{" "}
          <a href={`${SITE_URL}/conditions-utilisation`} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline underline-offset-4">
            conditions d’utilisation
          </a>{" "}
          et la{" "}
          <a href={`${SITE_URL}/charte-utilisation`} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline underline-offset-4">
            charte d’utilisation
          </a>
          .
        </label>
      </div>
      <Button size="lg" className="w-full" onClick={submit} disabled={!checked || pending}>
        {pending ? "Enregistrement…" : "Continuer"}
      </Button>
    </div>
  );
}
