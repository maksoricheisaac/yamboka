import { Coins, History } from "lucide-react";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import Link from "next/link";
import type { PricingView } from "@yamboka/shared";
import { PurchaseFlow } from "@/components/credits/purchase-flow";
import { requireUser } from "@/lib/auth";
import { COUNTRY_COOKIE, GEO_HEADERS, pickCountry } from "@/lib/country";
import { formatMoney, formatNumber } from "@/lib/format";
import { publicGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Crédits" };

export default async function CreditsPage() {
  const user = await requireUser();
  const [pricing, jar, h] = await Promise.all([publicGet<PricingView>("/catalog/pricing"), cookies(), headers()]);
  const ip = GEO_HEADERS.map((name) => h.get(name)).find((v) => v && v !== "XX" && v !== "T1") ?? null;
  const { iso, source } = pickCountry(pricing.countries, { choice: jar.get(COUNTRY_COOKIE)?.value, ip, phone: user.phone });

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Crédits</h1>
        <div className="flex items-center gap-2">
          <p className="flex items-center gap-2 rounded-full border bg-card px-3.5 py-1.5 text-sm" aria-label="Solde actuel">
            <Coins className="size-4 text-primary" aria-hidden />
            <span className="font-bold">{formatNumber(user.credits)} crédits</span>
            <span className="text-muted-foreground">≈ {formatMoney(user.credits * user.creditValueFcfa, "XAF")}</span>
          </p>
          <Link href="/app/credits/historique" className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-primary outline-none hover:bg-primary/10 focus-visible:ring-3 focus-visible:ring-ring/60">
            <History className="size-4" aria-hidden /> Historique
          </Link>
        </div>
      </div>

      <section aria-labelledby="buy-title">
        <h2 id="buy-title" className="sr-only">Acheter des crédits</h2>
        {pricing.countries.length === 0 ? (
          <p className="rounded-2xl border bg-card p-6 text-center text-muted-foreground">L’achat de crédits n’est pas disponible pour le moment. Réessayez bientôt.</p>
        ) : (
          <PurchaseFlow
            countries={pricing.countries}
            initialCountry={iso}
            countrySource={source}
            balance={user.credits}
            defaultPhone={user.phone}
            emailVerified={user.emailVerified}
            rates={pricing.rates}
          />
        )}
      </section>
    </div>
  );
}
