import type { Metadata } from "next";
import type { AdminGenerationRow, AdminPreset, AdminProduct, Page } from "@yamboka/shared";
import { GenerationsTable } from "@/components/admin/generations-table";
import { PageHeader, flat, listQuery } from "@/components/admin/ui";
import { requireUser } from "@/lib/auth";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Générations — Administration" };

export default async function GenerationsPage({ searchParams }: PageProps<"/admin/generations">) {
  await requireUser({ role: "ADMIN" });
  const sp = flat(await searchParams);
  const [page, presets, products] = await Promise.all([
    serverGet<Page<AdminGenerationRow>>(`/admin/generations${listQuery(sp, ["presetId", "product"])}`),
    serverGet<AdminPreset[]>("/admin/presets"),
    serverGet<AdminProduct[]>("/admin/products"),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Générations et modération" description="Créations lancées par les clients, leur coût et leur état." />
      <GenerationsTable
        page={page}
        presets={presets.map((p) => ({ value: p.id, label: p.name }))}
        products={products.map((p) => ({ value: p.code, label: p.name }))}
      />
    </div>
  );
}
