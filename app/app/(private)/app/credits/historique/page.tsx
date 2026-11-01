import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { LedgerList } from "@/components/credits/ledger-list";
import { requireUser } from "@/lib/auth";
import { formatNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Historique des crédits" };

export default async function LedgerPage() {
  const user = await requireUser();
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="space-y-1">
        <Link href="/app/credits" className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline">
          <ArrowLeft className="size-3.5" aria-hidden /> Mes crédits
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h1 className="text-3xl font-bold">Historique</h1>
          <p className="text-sm text-muted-foreground">Solde actuel : <strong className="text-foreground">{formatNumber(user.credits)} crédits</strong></p>
        </div>
        <p className="text-muted-foreground">Achats, créations, remboursements et bonus, tels qu’enregistrés sur votre compte.</p>
      </div>
      <LedgerList />
    </div>
  );
}
