import type { Metadata } from "next";
import type { AdminPreset } from "@yamboka/shared";
import { PresetsTable } from "@/components/admin/presets-table";
import { Empty, PageHeader } from "@/components/admin/ui";
import { requireUser } from "@/lib/auth";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Presets — Administration" };

export default async function PresetsPage() {
  await requireUser({ role: "ADMIN" });
  const presets = await serverGet<AdminPreset[]>("/admin/presets");

  return (
    <div className="space-y-6">
      <PageHeader title="Presets" />
      {presets.length === 0 ? <Empty title="Aucun preset" /> : <PresetsTable presets={presets} />}
    </div>
  );
}
