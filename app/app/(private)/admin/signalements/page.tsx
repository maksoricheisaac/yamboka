import type { Metadata } from "next";
import type { AdminReportRow, Page } from "@yamboka/shared";
import { ActionDialog } from "@/components/admin/action-dialog";
import { DataTable, Empty, FilterBar, FilterSelect, PageHeader, Pager, STATUS_OPTIONS, StatusPill, Td, Th, flat, listQuery } from "@/components/admin/ui";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Réclamations — Administration" };

export default async function ReportsPage({ searchParams }: PageProps<"/admin/signalements">) {
  await requireUser({ role: "ADMIN" });
  const sp = flat(await searchParams);
  const data = await serverGet<Page<AdminReportRow>>(`/admin/reports${listQuery(sp)}`);

  return (
    <div className="space-y-6">
      <PageHeader title="Réclamations et signalements" description="Traitez les signalements de contenus et les réclamations des clients. Chaque décision est consignée avec son motif." />
      <FilterBar reset="/admin/signalements">
        <FilterSelect label="État" name="status" value={sp.status} options={STATUS_OPTIONS.report} />
      </FilterBar>
      {data.items.length === 0 ? (
        <Empty title="Aucun signalement">Les signalements et réclamations envoyés par les clients apparaîtront ici. Le formulaire côté client sera ouvert avec le module de création.</Empty>
      ) : (
        <DataTable caption="Signalements et réclamations">
          <thead><tr><Th>Reçu le</Th><Th>Motif</Th><Th>Par</Th><Th>État</Th><Th className="text-right">Actions</Th></tr></thead>
          <tbody>
            {data.items.map((r) => (
              <tr key={r.id}>
                <Td className="whitespace-nowrap text-muted-foreground">{formatDateTime(r.createdAt)}</Td>
                <Td>
                  <span className="font-medium">{r.reason}</span>
                  {r.details && <span className="block text-xs text-muted-foreground">{r.details}</span>}
                  {r.resolution && <span className="block text-xs">Décision : {r.resolution}</span>}
                </Td>
                <Td>{r.reporter ?? "Anonyme"}</Td>
                <Td><StatusPill kind="report" value={r.status} /></Td>
                <Td className="text-right">
                  <ActionDialog
                    trigger="Traiter"
                    triggerLabel={`Traiter la réclamation « ${r.reason} »`}
                    title="Traiter ce signalement"
                    endpoint={`/admin/reports/${r.id}/handle`}
                    withReason={false}
                    fields={[
                      { name: "status", label: "Nouvel état", type: "select", options: [{ value: "IN_PROGRESS", label: "En cours" }, { value: "RESOLVED", label: "Résolu" }, { value: "REJECTED", label: "Rejeté" }], defaultValue: "RESOLVED" },
                      { name: "resolution", label: "Décision et motif (au moins 5 caractères)", type: "textarea" },
                    ]}
                  />
                </Td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
      <Pager page={data.page} total={data.total} pageSize={data.pageSize} path="/admin/signalements" params={sp} />
    </div>
  );
}
