import type { Metadata } from "next";
import type { AdminCountryDetail } from "@yamboka/shared";
import { CATALOG_STATUS_LABELS } from "@yamboka/shared";
import { ActionDialog } from "@/components/admin/action-dialog";
import { CountryStatusPill } from "@/components/admin/country-status";
import { PageHeader, Pill, StatCard, StatGrid } from "@/components/admin/ui";
import { requireUser } from "@/lib/auth";
import { flagOf } from "@/lib/flags";
import { formatMoney } from "@/lib/format";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Fiche pays — Administration" };

const STATUS_OPTIONS = (["ACTIVE", "COMING_SOON", "DISABLED"] as const).map((s) => ({ value: s, label: CATALOG_STATUS_LABELS[s] }));
const TYPE_LABELS = { MOBILE_MONEY: "Mobile money", CARD: "Carte bancaire", BANK_TRANSFER: "Virement" } as const;

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
        <div className="relative overflow-x-auto rounded-2xl border bg-card">
          <table className="w-full min-w-[48rem] text-left text-sm">
            <caption className="sr-only">Moyens de paiement de {c.name}</caption>
            <thead>
              <tr className="[&>th]:border-b [&>th]:bg-muted [&>th]:px-4 [&>th]:py-3 [&>th]:font-semibold">
                <th scope="col">Moyen</th>
                <th scope="col">Type</th>
                <th scope="col">Réseau SasPay</th>
                <th scope="col">Statut</th>
                <th scope="col" className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {c.methods.map((m) => (
                <tr key={m.id} className="[&>td]:border-b [&>td]:px-4 [&>td]:py-3 [&>td]:align-top">
                  <td className="font-medium">
                    {m.name}
                    {m.feeNote && <span className="block text-xs font-normal text-muted-foreground">Frais indicatifs : {m.feeNote}</span>}
                    {m.note && <span className="block text-xs font-normal text-muted-foreground">{m.note}</span>}
                  </td>
                  <td>{TYPE_LABELS[m.type]}</td>
                  <td className="font-mono text-xs">{m.saspayNetwork ?? "—"}</td>
                  <td>
                    <CountryStatusPill status={m.status} />
                    {m.blocker && (
                      <span className="mt-1 block max-w-64 text-xs text-muted-foreground">
                        <Pill tone="neutral">Non activable</Pill> {m.blocker}
                      </span>
                    )}
                  </td>
                  <td className="text-right">
                    <ActionDialog
                      trigger="Statut"
                      triggerLabel={`Changer le statut de ${m.name}`}
                      title={`${m.name} · ${c.name}`}
                      description={m.blocker ? `Ce moyen ne peut pas être activé : ${m.blocker}` : "Statut propre à ce moyen dans ce pays."}
                      endpoint={`/admin/countries/${c.iso}/methods/${m.methodCode}/status`}
                      fields={[{ name: "status", label: "Nouveau statut", type: "select", defaultValue: m.status, options: STATUS_OPTIONS }]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="pricing" className="space-y-3 rounded-2xl border bg-card p-4">
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
