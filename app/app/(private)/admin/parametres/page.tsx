import type { Metadata } from "next";
import type { SettingsView } from "@yamboka/shared";
import { SettingsForm } from "@/components/admin/settings-form";
import { PageHeader } from "@/components/admin/ui";
import { requireUser } from "@/lib/auth";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Paramètres — Administration" };

export default async function SettingsPage() {
  await requireUser({ role: "ADMIN" });
  const settings = await serverGet<SettingsView>("/admin/settings");

  return (
    <div className="space-y-8">
      <PageHeader title="Paramètres" description="Paramètres opérationnels, seuils et règles de rentabilité. Chaque modification exige un motif et est consignée avec l’ancienne et la nouvelle valeur." />
      <SettingsForm initial={settings.values} emailProvider={settings.email.provider} />
    </div>
  );
}
