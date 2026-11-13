import type { Metadata } from "next";
import type { AdminProduct } from "@yamboka/shared";
import { ProductsTable } from "@/components/admin/products-table";
import { PageHeader, StatCard, StatGrid } from "@/components/admin/ui";
import { requireUser } from "@/lib/auth";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Produits — Administration" };

export default async function ProductsPage() {
  await requireUser({ role: "ADMIN" });
  // La liste entière est chargée (quelques produits) : les indicateurs se calculent dessus, pas sur une page.
  const products = await serverGet<AdminProduct[]>("/admin/products");
  const active = products.filter((p) => p.active);
  const perSecond = products.filter((p) => p.billingUnit === "SECOND").length;

  return (
    <div className="space-y-6">
      <PageHeader title="Produits de génération" description="Ce que la création propose, son prix en crédits et son coût fournisseur." />
      <StatGrid>
        <StatCard label="Produits" value={products.length} hint="catalogue complet" />
        <StatCard label="Actifs" value={active.length} hint="proposés à la création" />
        <StatCard label="Inactifs" value={products.length - active.length} hint="jamais proposés" />
        <StatCard label="Par facturation" value={`${perSecond} vidéo · ${products.length - perSecond} image`} hint="vidéo à la seconde, image à l’unité" />
      </StatGrid>
      <ProductsTable products={products} />
    </div>
  );
}
