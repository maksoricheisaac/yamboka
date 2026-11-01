"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ApiError, apiPost } from "@/lib/api-client";

/** Revérifie un paiement auprès du fournisseur ; le résultat réel (jamais supposé) est affiché sous le bouton. */
export function VerifyPaymentButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function verify() {
    setBusy(true);
    setResult(null);
    try {
      const res = await apiPost<{ status: string }>(`/admin/payments/${id}/verify`);
      setResult(`Statut chez le fournisseur : ${res.status}`);
      router.refresh();
    } catch (e) {
      setResult(e instanceof ApiError ? e.message : "Vérification impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1 text-right">
      <Button size="sm" variant="outline" onClick={verify} disabled={busy}>
        {busy ? "Vérification…" : "Vérifier"}
      </Button>
      {result && <p role="status" className="text-xs text-muted-foreground">{result}</p>}
    </div>
  );
}
