import type { Metadata } from "next";
import type { AdminAccount } from "@yamboka/shared";
import { ActionDialog } from "@/components/admin/action-dialog";
import { AdminsTable } from "@/components/admin/admins-table";
import { PageHeader } from "@/components/admin/ui";
import { requireUser } from "@/lib/auth";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Administrateurs — Administration" };

export default async function AdminsPage() {
  const me = await requireUser({ role: "ADMIN" });
  const admins = await serverGet<AdminAccount[]>("/admin/admins");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Administrateurs"
        actions={
          <ActionDialog
            trigger="Ajouter un administrateur"
            triggerVariant="default"
            title="Ajouter un administrateur"
            description="Compte existant, e-mail vérifié."
            endpoint="/admin/admins"
            fields={[{ name: "email", label: "Adresse e-mail du compte", type: "text" }]}
            submitLabel="Donner l’accès"
          />
        }
      />
      <AdminsTable admins={admins} meId={me.id} />
    </div>
  );
}
