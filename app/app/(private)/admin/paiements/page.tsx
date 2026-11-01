import { Download } from "lucide-react";
import type { Metadata } from "next";
import type { AdminPaymentRow, Page } from "@yamboka/shared";
import { PaymentsTable } from "@/components/admin/payments-table";
import { Empty, FilterBar, FilterDateRange, FilterField, FilterSelect, PageHeader, Pager, STATUS_OPTIONS, flat, listQuery } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Paiements — Administration" };

export default async function PaymentsPage({ searchParams }: PageProps<"/admin/paiements">) {
  await requireUser({ role: "ADMIN" });
  const sp = flat(await searchParams);
  const data = await serverGet<Page<AdminPaymentRow>>(`/admin/payments${listQuery(sp)}`);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Paiements"
        description="Journal des paiements Mobile Money. La vérification manuelle interroge le fournisseur : elle ne crédite que si celui-ci confirme le succès."
        actions={
          <Button asChild variant="outline">
            <a href={`/api/admin/finance/export.csv${listQuery(sp)}`}>
              <Download aria-hidden /> Exporter en CSV
            </a>
          </Button>
        }
      />
      <FilterBar reset="/admin/paiements">
        <FilterField label="E-mail ou référence" name="q" defaultValue={sp.q} />
        <FilterSelect label="Statut" name="status" value={sp.status} options={STATUS_OPTIONS.payment} />
        <FilterDateRange from={sp.from} to={sp.to} />
      </FilterBar>
      {data.items.length === 0 ? (
        <Empty title="Aucun paiement">Aucun paiement ne correspond à ces critères.</Empty>
      ) : (
        <PaymentsTable payments={data.items} />
      )}
      <Pager page={data.page} total={data.total} pageSize={data.pageSize} path="/admin/paiements" params={sp} />
    </div>
  );
}
