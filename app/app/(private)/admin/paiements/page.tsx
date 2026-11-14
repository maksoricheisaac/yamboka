import { Download } from "lucide-react";
import type { Metadata } from "next";
import type { AdminCountryRow, AdminMethodRow, AdminPaymentRow, AdminPaymentStats, Page } from "@yamboka/shared";
import { PaymentsTable } from "@/components/admin/payments-table";
import { PageHeader, StatCard, StatGrid, flat, listQuery } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Paiements — Administration" };

/** Filtres du journal qui sortent du jeu commun (q, statut, période, tri, pagination). */
const EXTRA = ["provider", "country", "method", "userId", "anomaly"];

export default async function PaymentsPage({ searchParams }: PageProps<"/admin/paiements">) {
  await requireUser({ role: "ADMIN" });
  const sp = flat(await searchParams);
  const query = listQuery(sp, EXTRA);
  const [page, stats, countries, methods] = await Promise.all([
    serverGet<Page<AdminPaymentRow>>(`/admin/payments${query}`),
    serverGet<AdminPaymentStats>(`/admin/payments/stats${query}`),
    serverGet<Page<AdminCountryRow>>("/admin/countries?pageSize=100"),
    serverGet<Page<AdminMethodRow>>("/admin/payment-methods?pageSize=100"),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Paiements"
        description="Journal des paiements, leur état chez le fournisseur et leur vérification."
        actions={
          <Button asChild variant="outline">
            <a href={`/api/admin/finance/export.csv${query}`}>
              <Download aria-hidden /> Exporter en CSV
            </a>
          </Button>
        }
      />
      <StatGrid>
        <StatCard label="paiements" value={stats.total} />
        <StatCard label="réussis" value={stats.success} />
        <StatCard label="en attente" value={stats.pending} />
        <StatCard label="échoués ou annulés" value={stats.failed} />
        <StatCard label="confirmés non crédités" value={stats.confirmedNotCredited} hint="à régulariser" />
        <StatCard label="régularisés manuellement" value={stats.manuallySettled} />
      </StatGrid>

      <PaymentsTable
        page={page}
        countries={countries.items.map((c) => ({ value: c.iso, label: `${c.name} (${c.iso})` }))}
        methods={methods.items.map((m) => ({ value: m.code, label: m.name }))}
      />
    </div>
  );
}
