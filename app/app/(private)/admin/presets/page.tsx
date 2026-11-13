import type { Metadata } from "next";
import type { AdminPreset } from "@yamboka/shared";
import { PresetsTable } from "@/components/admin/presets-table";
import { PageHeader, StatCard, StatGrid } from "@/components/admin/ui";
import { requireUser } from "@/lib/auth";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Presets — Administration" };

export default async function PresetsPage() {
  await requireUser({ role: "ADMIN" });
  // La liste entière est chargée : les indicateurs portent sur tous les presets, pas sur la page affichée.
  const presets = await serverGet<AdminPreset[]>("/admin/presets");
  const visible = presets.filter((p) => p.visible).length;
  const categories = [...new Set(presets.map((p) => p.category))].sort();
  const featured = presets.filter((p) => p.featured).length;

  return (
    <div className="space-y-6">
      <PageHeader title="Presets" description="Styles proposés à la création, leur publication et leur mise en avant." />
      <StatGrid>
        <StatCard label="Presets" value={presets.length} hint="catalogue complet" />
        <StatCard label="Publiés" value={visible} hint="visibles à la création" />
        <StatCard label="Non publiés" value={presets.length - visible} hint="brouillons et retirés" />
        <StatCard
          label="Catégories"
          value={categories.length}
          hint={categories.length > 0 ? `${categories.join(", ")} · ${featured} à la une` : "aucune"}
        />
      </StatGrid>
      <PresetsTable presets={presets} />
    </div>
  );
}
