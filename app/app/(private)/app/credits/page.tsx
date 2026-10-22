import { Coins } from "lucide-react";
import type { Metadata } from "next";
import type { PackView } from "@yamboka/shared";
import { LedgerList } from "@/components/credits/ledger-list";
import { PurchaseForm } from "@/components/credits/purchase-form";
import { requireUser } from "@/lib/auth";
import { formatFcfa, formatNumber } from "@/lib/format";
import { publicGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Mes crédits" };

export default async function CreditsPage() {
  const user = await requireUser();
  const { packs } = await publicGet<{ packs: PackView[] }>("/catalog/packs");

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Mes crédits</h1>
          <p className="mt-1 text-muted-foreground">1 crédit = {formatFcfa(user.creditValueFcfa)}. Le prix s’affiche toujours avant de payer.</p>
        </div>
        <p className="flex items-center gap-3 rounded-2xl border bg-card px-5 py-3 shadow-soft" aria-label="Solde actuel">
          <Coins className="size-6 text-primary" aria-hidden />
          <span>
            <span className="block font-heading text-3xl font-bold leading-none">{formatNumber(user.credits)} crédits</span>
            <span className="text-sm text-muted-foreground">≈ {formatFcfa(user.credits * user.creditValueFcfa)}</span>
          </span>
        </p>
      </div>

      <section aria-labelledby="buy-title" className="space-y-5">
        <h2 id="buy-title" className="text-2xl font-bold">
          Acheter des crédits
        </h2>
        <PurchaseForm packs={packs} defaultPhone={user.phone} emailVerified={user.emailVerified} />
      </section>

      <section aria-labelledby="ledger-title" className="space-y-5">
        <h2 id="ledger-title" className="text-2xl font-bold">
          Historique des mouvements
        </h2>
        <LedgerList />
      </section>
    </div>
  );
}
