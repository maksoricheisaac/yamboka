"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { SessionInfo } from "@yamboka/shared";
import { Laptop, Loader2 } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { ApiError, apiGet, apiPost } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";

/** Appareils connectés au compte, avec la possibilité de fermer toutes les autres sessions (action confirmée). */
export function SessionsCard() {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const query = useQuery({ queryKey: ["sessions"], queryFn: () => apiGet<{ sessions: SessionInfo[] }>("/me/sessions") });

  const sessions = query.data?.sessions ?? [];
  const others = sessions.filter((s) => !s.current).length;

  async function revokeOthers() {
    setBusy(true);
    setError(null);
    try {
      await apiPost("/me/sessions/revoke-others");
      await queryClient.invalidateQueries({ queryKey: ["sessions"] });
      setConfirming(false);
      toast.success("Vos autres appareils ont été déconnectés.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Déconnexion impossible. Vérifiez votre connexion puis réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {query.isPending ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> Chargement des appareils…
        </p>
      ) : query.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Impossible de lister vos appareils pour le moment.
        </p>
      ) : (
        <ul className="divide-y rounded-3xl bg-card shadow-card">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-4 py-3">
              <Laptop className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{s.device}</p>
                <p className="text-xs text-muted-foreground">Connecté le {formatDateTime(s.createdAt)}</p>
              </div>
              {s.current && <span className="shrink-0 rounded-full bg-success/15 px-2.5 py-1 text-xs font-semibold text-success">Cet appareil</span>}
            </li>
          ))}
        </ul>
      )}

      <Button type="button" variant="outline" disabled={others === 0} onClick={() => setConfirming(true)}>
        Déconnecter mes autres appareils
      </Button>
      {others === 0 && !query.isPending && <p className="text-xs text-muted-foreground">Aucun autre appareil n’est connecté.</p>}

      <Dialog open={confirming} onOpenChange={(open) => !busy && setConfirming(open)}>
        <DialogContent>
          <DialogTitle>Déconnecter les autres appareils ?</DialogTitle>
          <DialogDescription>
            {others} appareil{others > 1 ? "s" : ""} perdr{others > 1 ? "ont" : "a"} l’accès à votre compte. Cet appareil reste connecté.
          </DialogDescription>
          {error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={busy}>
                Annuler
              </Button>
            </DialogClose>
            <Button type="button" variant="destructive" disabled={busy} onClick={() => void revokeOthers()}>
              {busy ? "Déconnexion…" : "Déconnecter"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
