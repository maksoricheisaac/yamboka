import type { Metadata } from "next";
import Link from "next/link";
import type { PaymentView } from "@yamboka/shared";
import { OPERATOR_LABELS } from "@/components/credits/labels";
import { StatusBadge } from "@/components/credits/status-badge";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { formatDateTime, formatFcfa, formatNumber } from "@/lib/format";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Mes achats" };

export default async function PurchasesPage() {
  await requireUser();
  const { payments } = await serverGet<{ payments: PaymentView[] }>("/payments");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Mes achats</h1>
        <p className="mt-1 text-muted-foreground">Vos achats de crédits, avec leur état et un reçu pour chaque achat réussi.</p>
      </div>

      {payments.length === 0 ? (
        <div className="space-y-4 rounded-2xl border bg-card p-8 text-center">
          <p className="text-muted-foreground">Vous n’avez encore rien acheté.</p>
          <Button asChild>
            <Link href="/app/credits">Acheter des crédits</Link>
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-card">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <caption className="sr-only">Historique de vos achats de crédits</caption>
            <thead className="border-b bg-muted/60">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Date</th>
                <th scope="col" className="px-4 py-3 font-semibold">Pack</th>
                <th scope="col" className="px-4 py-3 font-semibold">Montant</th>
                <th scope="col" className="px-4 py-3 font-semibold">Opérateur</th>
                <th scope="col" className="px-4 py-3 font-semibold">État</th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  <span className="sr-only">Détail</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDateTime(p.createdAt)}</td>
                  <td className="px-4 py-3">
                    {p.packName}
                    <span className="block text-xs text-muted-foreground">{formatNumber(p.credits)} crédits</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-medium">{formatFcfa(p.amountFcfa)}</td>
                  <td className="px-4 py-3">{OPERATOR_LABELS[p.operator]}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={p.status === "SUCCESS" ? `/app/achats/${p.id}` : `/app/credits/paiement/${p.id}`}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {p.status === "SUCCESS" ? "Reçu" : p.status === "PENDING" || p.status === "INITIATED" ? "Suivre" : "Détail"}
                      <span className="sr-only"> de l’achat du {formatDateTime(p.createdAt)}</span>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
