import { Download } from "lucide-react";
import type { Metadata } from "next";
import type { AdminCountryRow, AdminMethodRow, AdminPaymentRow, Page } from "@yamboka/shared";
import { PaymentsTable } from "@/components/admin/payments-table";
import { PageHeader, flat, listQuery } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Paiements — Administration" };

/** Filtres du journal qui sortent du jeu commun (q, statut, période, tri, pagination). */
const EXTRA = ["provider", "country", "method", "userId"];

export default async function PaymentsPage({ searchParams }: PageProps<"/admin/paiements">) {
  await requireUser({ role: "ADMIN" });
  const sp = flat(await searchParams);
  const query = listQuery(sp, EXTRA);
  const [page, countries, methods] = await Promise.all([
    serverGet<Page<AdminPaymentRow>>(`/admin/payments${query}`),
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
      <PaymentsTable
        page={page}
        countries={countries.items.map((c) => ({ value: c.iso, label: `${c.name} (${c.iso})` }))}
        methods={methods.items.map((m) => ({ value: m.code, label: m.name }))}
      />
    </div>
  );
}
