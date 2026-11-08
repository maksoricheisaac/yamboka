import type { PaymentView } from "@yamboka/shared";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { providerLabel } from "./labels";
import { StatusBadge } from "./status-badge";

/** Achats de crédits avec leur état, leur moyen de paiement et le reçu (achats réussis). Cartes : pas de tableau à faire défiler. */
export function PurchasesList({ payments }: { payments: PaymentView[] }) {
  if (payments.length === 0) {
    return (
      <div className="space-y-4 rounded-2xl border bg-card p-8 text-center">
        <p className="text-muted-foreground">Vous n’avez encore rien acheté.</p>
        <Button asChild>
          <Link href="/app/credits">Acheter des crédits</Link>
        </Button>
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {payments.map((p) => {
        const open = p.status === "PENDING" || p.status === "INITIATED";
        return (
          <li key={p.id} className="rounded-2xl border bg-card p-3.5">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
              <div className="min-w-0">
                <p className="font-medium">
                  {p.packName} <span className="text-muted-foreground">· {formatNumber(p.credits)} crédits</span>
                </p>
                <p className="text-xs text-muted-foreground">{formatDateTime(p.createdAt)}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold tabular-nums">{formatMoney(p.amountFcfa, p.currency)}</p>
                <StatusBadge status={p.status} />
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t pt-2 text-xs text-muted-foreground">
              <p>
                {p.methodLabel} · {providerLabel(p.provider)}
                {p.reference && <span className="ml-1 break-all font-mono">· {p.reference}</span>}
              </p>
              <Link href={p.status === "SUCCESS" ? `/app/credits/recu/${p.id}` : `/app/credits/paiement/${p.id}`} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                {p.status === "SUCCESS" ? "Voir le reçu" : open ? "Suivre le paiement" : "Détail"}
                <span className="sr-only"> de l’achat du {formatDateTime(p.createdAt)}</span>
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
