import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

/**
 * Bouton d'envoi des formulaires d'authentification : pendant l'envoi il est désactivé (pas de double soumission),
 * affiche un indicateur et annonce l'état aux lecteurs d'écran.
 */
export function SubmitButton({
  loading,
  loadingLabel,
  disabled = false,
  children,
}: {
  loading: boolean;
  loadingLabel: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Button type="submit" size="lg" className="w-full rounded-full text-base" disabled={disabled || loading} aria-busy={loading}>
      {loading ? (
        <>
          <Loader2 className="animate-spin" aria-hidden />
          {loadingLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
