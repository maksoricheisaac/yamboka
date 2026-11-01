import { Coins, History } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { PackView } from "@yamboka/shared";
import { PurchaseForm } from "@/components/credits/purchase-form";
import { requireUser } from "@/lib/auth";
import { formatFcfa, formatNumber } from "@/lib/format";
import { publicGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Mes crédits" };

export default async function CreditsPage() {
  const user = await requireUser();
  const { packs } = await publicGet<{ packs: PackView[] }>("/catalog/packs");

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Mes crédits</h1>
        <div className="flex items-center gap-2">
          <p className="flex items-center gap-2 rounded-full border bg-card px-3.5 py-1.5 text-sm" aria-label="Solde actuel">
            <Coins className="size-4 text-primary" aria-hidden />
            <span className="font-bold">{formatNumber(user.credits)} crédits</span>
            <span className="text-muted-foreground">≈ {formatFcfa(user.credits * user.creditValueFcfa)}</span>
          </p>
          <Link href="/app/credits/historique" className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-primary outline-none hover:bg-primary/10 focus-visible:ring-3 focus-visible:ring-ring/60">
            <History className="size-4" aria-hidden /> Historique
          </Link>
        </div>
      </div>

      <section aria-labelledby="buy-title">
        <h2 id="buy-title" className="sr-only">Acheter des crédits</h2>
        <PurchaseForm packs={packs} defaultPhone={user.phone} emailVerified={user.emailVerified} />
      </section>
    </div>
  );
}
