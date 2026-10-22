import type { PaymentStatus } from "@yamboka/shared";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { PAYMENT_LABELS } from "./labels";

/** L'état n'est jamais porté par la seule couleur : une icône et un texte l'accompagnent. */
export function StatusBadge({ status }: { status: PaymentStatus }) {
  const { text, tone } = PAYMENT_LABELS[status];
  const Icon = tone === "ok" ? CheckCircle2 : tone === "error" ? XCircle : Clock;
  const color =
    tone === "ok"
      ? "bg-success/15 text-success"
      : tone === "error"
        ? "bg-destructive/10 text-destructive"
        : "bg-accent/25 text-accent-foreground";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${color}`}>
      <Icon className="size-3.5" aria-hidden />
      {text}
    </span>
  );
}
