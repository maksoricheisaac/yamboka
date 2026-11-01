import type { Metadata } from "next";
import type { AdminAccount } from "@yamboka/shared";
import { ActionDialog } from "@/components/admin/action-dialog";
import { DataTable, PageHeader, Td, Th } from "@/components/admin/ui";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Administrateurs — Administration" };

export default async function AdminsPage() {
  const me = await requireUser({ role: "ADMIN" });
  const admins = await serverGet<AdminAccount[]>("/admin/admins");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Administrateurs"
        description="Comptes autorisés à accéder à l’administration. Le rôle ne s’obtient jamais par l’inscription : il est accordé ici, à un compte existant dont l’e-mail est vérifié."
        actions={
          <ActionDialog
            trigger="Ajouter un administrateur"
            triggerVariant="default"
            title="Ajouter un administrateur"
            description="La personne doit déjà avoir un compte Yamboka actif, avec une adresse e-mail vérifiée."
            endpoint="/admin/admins"
            fields={[{ name: "email", label: "Adresse e-mail du compte", type: "text" }]}
            submitLabel="Donner l’accès"
          />
        }
      />
      <DataTable caption="Comptes administrateurs" minWidth="32rem">
        <thead><tr><Th>Nom</Th><Th>E-mail</Th><Th>Depuis le</Th><Th className="text-right">Actions</Th></tr></thead>
        <tbody>
          {admins.map((a) => (
            <tr key={a.id}>
              <Td className="font-medium">{a.firstName} {a.lastName}{a.id === me.id && <span className="ml-2 text-xs text-muted-foreground">(vous)</span>}</Td>
              <Td>{a.email}</Td>
              <Td className="whitespace-nowrap text-muted-foreground">{formatDateTime(a.createdAt)}</Td>
              <Td className="text-right">
                {a.id !== me.id && (
                  <ActionDialog trigger="Retirer l’accès" triggerLabel={`Retirer l’accès de ${a.email}`} title={`Retirer l’accès de ${a.email}`} description="Le compte redevient un compte client. Il reste toujours au moins un administrateur." endpoint={`/admin/admins/${a.id}/demote`} submitLabel="Retirer l’accès" destructive />
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}
