import type { CreationView } from "@yamboka/shared";
import { CheckCircle2, Loader2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

/** Statut d'une création, en mots simples et jamais par la seule couleur (icône + texte). */
export function StatusPill({ creation, className }: { creation: Pick<CreationView, "status">; className?: string }) {
  if (creation.status === "COMPLETED") {
    return (
      <span className={cn("inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success", className)}>
        <CheckCircle2 className="size-3.5" aria-hidden /> Prête
      </span>
    );
  }
  if (creation.status === "FAILED") {
    return (
      <span className={cn("inline-flex items-center gap-1 rounded-full bg-destructive/12 px-2 py-0.5 text-xs font-semibold text-destructive", className)}>
        <RotateCcw className="size-3.5" aria-hidden /> Échec · crédits restitués
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full bg-accent/35 px-2 py-0.5 text-xs font-semibold text-accent-foreground", className)}>
      <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> En cours
    </span>
  );
}
