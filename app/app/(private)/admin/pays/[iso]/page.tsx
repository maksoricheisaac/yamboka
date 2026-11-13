import type { Metadata } from "next";
import type { AdminCountryDetail } from "@yamboka/shared";
import { CATALOG_STATUS_LABELS } from "@yamboka/shared";
import { ActionDialog } from "@/components/admin/action-dialog";
import { CountryMethodsTable } from "@/components/admin/country-methods-table";
import { CountryStatusPill } from "@/components/admin/country-status";
import { PageHeader, StatCard, StatGrid } from "@/components/admin/ui";
import { requireUser } from "@/lib/auth";
import { flagOf } from "@/lib/flags";
import { formatMoney } from "@/lib/format";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Fiche pays — Administration" };

const STATUS_OPTIONS = (["ACTIVE", "COMING_SOON", "DISABLED"] as const).map((s) => ({ value: s, label: CATALOG_STATUS_LABELS[s] }));

export default async function CountryPage({ params }: PageProps<"/admin/pays/[iso]">) {
  await requireUser({ role: "ADMIN" });
  const { iso } = await params;
  const c = await serverGet<AdminCountryDetail>(`/admin/countries/${encodeURIComponent(iso)}`);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${flagOf(c.iso)} ${c.name}`}
        description={`${c.iso} · devise ${c.currency}${c.dialCode ? ` · indicatif ${c.dialCode}` : ""}${c.feeNote ? ` · frais indicatifs SasPay : ${c.feeNote}` : ""}`}
        actions={
          <ActionDialog
            trigger="Changer le statut du pays"
            triggerVariant="default"
            title={`Statut de ${c.name}`}
            description="Un pays inactif bloque tous ses moyens."
            endpoint={`/admin/countries/${c.iso}/status`}
            fields={[{ name: "status", label: "Nouveau statut", type: "select", defaultValue: c.status, options: STATUS_OPTIONS }]}
          />
        }
      />

      <StatGrid>
        <StatCard label="Statut" value={<CountryStatusPill status={c.status} />} />
        <StatCard label="Moyens actifs" value={`${c.activeMethodCount} / ${c.methodCount}`} />
        <StatCard
          label={`Tarification ${c.currency}`}
          value={c.sellable ? "Configurée" : "À configurer"}
          hint={c.sellable ? undefined : "Sans prix du crédit (avec bornes) ou pack dans cette devise, le pays ne peut pas être ouvert."}
        />
      </StatGrid>

      <section aria-labelledby="methods" className="space-y-3">
        <h2 id="methods" className="text-xl font-bold">Moyens de paiement</h2>
        <CountryMethodsTable iso={c.iso} name={c.name} methods={c.methods} />
      </section>

      <section aria-labelledby="pricing" className="space-y-3 rounded-3xl bg-card shadow-card p-4">
        <h2 id="pricing" className="text-xl font-bold">Devise et tarification</h2>
        {c.pricing.cfa ? (
          <p className="text-sm text-muted-foreground">Franc CFA : prix du crédit réglé dans <strong>Paramètres</strong>{c.pricing.creditValue != null && <> ({formatMoney(c.pricing.creditValue, c.currency)})</>}.</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {c.pricing.creditValue != null ? <>{formatMoney(c.pricing.creditValue, c.currency)} le crédit{c.pricing.minAmount != null && c.pricing.maxAmount != null && <>, achat de {formatMoney(c.pricing.minAmount, c.currency)} à {formatMoney(c.pricing.maxAmount, c.currency)}</>}{c.pricing.active ? "" : " (désactivée)"}.</> : <>Prix du crédit en {c.currency} non défini.</>}
            </p>
            <ActionDialog
              trigger="Configurer la tarification"
              triggerVariant="default"
              title={`Tarification en ${c.currency}`}
              description="Montants entiers dans la devise."
              endpoint={`/admin/countries/${c.iso}/pricing`}
              fields={[
                { name: "creditValue", label: `Prix d’un crédit (${c.currency})`, type: "number", defaultValue: c.pricing.creditValue ?? undefined },
                { name: "minAmount", label: `Achat minimum (${c.currency})`, type: "number", defaultValue: c.pricing.minAmount ?? undefined, required: false },
                { name: "maxAmount", label: `Achat maximum (${c.currency})`, type: "number", defaultValue: c.pricing.maxAmount ?? undefined, required: false },
                { name: "active", label: "Tarification", type: "select", defaultValue: "true", options: [{ value: "true", label: "Active" }, { value: "false", label: "Désactivée" }] },
              ]}
            />
          </>
        )}
      </section>
    </div>
  );
}
