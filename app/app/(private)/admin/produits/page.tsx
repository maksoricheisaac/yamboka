import type { Metadata } from "next";
import type { AdminProduct } from "@yamboka/shared";
import { ProductsTable } from "@/components/admin/products-table";
import { PageHeader, StatCard, StatGrid } from "@/components/admin/ui";
import { requireUser } from "@/lib/auth";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Produits — Administration" };

export default async function ProductsPage() {
  await requireUser({ role: "ADMIN" });
  const products = await serverGet<AdminProduct[]>("/admin/products");
  const active = products.filter((p) => p.active);
  const perSecond = active.filter((p) => p.billingUnit === "SECOND").length;

  return (
    <div className="space-y-6">
      <PageHeader title="Produits de génération" />
      <StatGrid>
        <StatCard label="Produits" value={products.length} hint={`${products.length - active.length} inactif${products.length - active.length > 1 ? "s" : ""}`} />
        <StatCard label="Produits actifs" value={active.length} hint="Proposés à la création" />
        <StatCard label="Actifs par facturation" value={`${perSecond} vidéo · ${active.length - perSecond} image`} hint="Vidéo : à la seconde. Image : à l’unité." />
      </StatGrid>
      <ProductsTable products={products} />
    </div>
  );
}
