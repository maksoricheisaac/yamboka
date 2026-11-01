import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { AdminUserDetail } from "@yamboka/shared";
import { ActionDialog } from "@/components/admin/action-dialog";
import { DataTable, Empty, LEDGER_LABELS, PageHeader, Pill, StatusPill, Td, Th } from "@/components/admin/ui";
import { requireUser } from "@/lib/auth";
import { formatDateTime, formatFcfa, formatNumber, formatPhone } from "@/lib/format";
import { serverGetOrNull } from "@/lib/server-api";

export const metadata: Metadata = { title: "Fiche client — Administration" };

export default async function UserDetailPage({ params }: PageProps<"/admin/utilisateurs/[id]">) {
  await requireUser({ role: "ADMIN" });
  const { id } = await params;
  const u = await serverGetOrNull<AdminUserDetail>(`/admin/users/${id}`);
  if (!u) notFound();
  const isAdmin = u.role === "ADMIN";

  return (
    <div className="space-y-8">
      <PageHeader
        title={`${u.firstName} ${u.lastName}`}
        description={u.email}
        actions={
          !isAdmin && (
            <>
              <ActionDialog
                trigger="Ajuster les crédits"
                title="Ajuster les crédits"
                description="Positif pour créditer, négatif pour débiter. Le solde ne peut jamais devenir négatif."
                endpoint={`/admin/users/${u.id}/credits`}
                fields={[{ name: "amount", label: "Nombre de crédits (ex. 20 ou -10)", type: "number" }]}
                submitLabel="Appliquer l’ajustement"
              />
              {u.status === "ACTIVE" ? (
                <>
                  <ActionDialog trigger="Suspendre" title="Suspendre ce compte" description="Les sessions en cours sont coupées. Le client est prévenu par e-mail." endpoint={`/admin/users/${u.id}/status`} fixed={{ action: "SUSPEND" }} submitLabel="Suspendre" destructive />
                  <ActionDialog trigger="Bannir" title="Bannir ce compte" description="Le compte est fermé et le client prévenu par e-mail. Réversible par réactivation." endpoint={`/admin/users/${u.id}/status`} fixed={{ action: "BAN" }} submitLabel="Bannir" destructive triggerVariant="destructive" />
                </>
              ) : (
                <ActionDialog trigger="Réactiver" title="Réactiver ce compte" endpoint={`/admin/users/${u.id}/status`} fixed={{ action: "REACTIVATE" }} submitLabel="Réactiver" triggerVariant="default" />
              )}
            </>
          )
        }
      />

      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Statut", <StatusPill key="s" kind="user" value={u.status} />],
          ["Rôle", isAdmin ? <Pill key="r" tone="info">Administrateur</Pill> : "Client"],
          ["Solde", `${formatNumber(u.credits)} crédits`],
          ["Adresse e-mail", u.emailVerified ? "Vérifiée" : "Non vérifiée"],
          ["Inscrit le", formatDateTime(u.createdAt)],
          ["Téléphone", u.phone ? formatPhone(u.phone) : "—"],
        ].map(([k, v]) => (
          <div key={String(k)} className="space-y-0.5 border-l-2 border-primary/40 pl-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{k}</dt>
            <dd className="font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      {isAdmin && <p className="rounded-xl border bg-card p-3 text-sm text-muted-foreground">Compte administrateur : pour le suspendre, retirez-lui d’abord le rôle dans « Administrateurs ».</p>}

      <section aria-labelledby="paiements" className="space-y-3">
        <h2 id="paiements" className="text-xl font-bold">Paiements</h2>
        {u.payments.length === 0 ? <Empty title="Aucun paiement" /> : (
          <DataTable caption="Paiements du client" minWidth="32rem">
            <thead><tr><Th>Date</Th><Th>Montant</Th><Th>Crédits</Th><Th>Opérateur</Th><Th>État</Th></tr></thead>
            <tbody>
              {u.payments.map((p) => (
                <tr key={p.id}>
                  <Td className="whitespace-nowrap">{formatDateTime(p.createdAt)}</Td>
                  <Td>{formatFcfa(p.amount)}</Td>
                  <Td>{formatNumber(p.credits)}</Td>
                  <Td>{p.operator}</Td>
                  <Td><StatusPill kind="payment" value={p.status} /></Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </section>

      <section aria-labelledby="generations" className="space-y-3">
        <h2 id="generations" className="text-xl font-bold">Générations</h2>
        {u.generations.length === 0 ? <Empty title="Aucune génération" /> : (
          <DataTable caption="Générations du client" minWidth="30rem">
            <thead><tr><Th>Date</Th><Th>Produit</Th><Th>Coût</Th><Th>État</Th></tr></thead>
            <tbody>
              {u.generations.map((g) => (
                <tr key={g.id}>
                  <Td className="whitespace-nowrap">{formatDateTime(g.createdAt)}</Td>
                  <Td>{g.product}</Td>
                  <Td>{formatNumber(g.creditsCost)} crédits</Td>
                  <Td><StatusPill kind="generation" value={g.status} /></Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </section>

      <section aria-labelledby="registre" className="space-y-3">
        <h2 id="registre" className="text-xl font-bold">Registre de crédits</h2>
        {u.ledger.length === 0 ? <Empty title="Aucun mouvement" /> : (
          <DataTable caption="Derniers mouvements de crédits" minWidth="32rem">
            <thead><tr><Th>Date</Th><Th>Type</Th><Th>Montant</Th><Th>Note</Th></tr></thead>
            <tbody>
              {u.ledger.map((l) => (
                <tr key={l.id}>
                  <Td className="whitespace-nowrap">{formatDateTime(l.createdAt)}</Td>
                  <Td>{LEDGER_LABELS[l.type] ?? l.type}</Td>
                  <Td className={`tabular-nums font-medium ${l.amount < 0 ? "text-destructive" : ""}`}>{l.amount > 0 ? `+${l.amount}` : l.amount}</Td>
                  <Td className="text-muted-foreground">{l.note ?? "—"}</Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </section>

      <section aria-labelledby="moderation" className="space-y-3">
        <h2 id="moderation" className="text-xl font-bold">Historique de modération</h2>
        {u.moderation.length === 0 ? <Empty title="Aucune action de modération" /> : (
          <ul className="space-y-2">
            {u.moderation.map((m) => (
              <li key={m.id} className="rounded-xl border bg-card p-3 text-sm">
                <span className="font-semibold">{m.action}</span> par {m.actor} · {formatDateTime(m.createdAt)}
                <span className="block text-muted-foreground">{m.reason}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
