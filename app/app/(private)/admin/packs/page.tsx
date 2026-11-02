import type { Metadata } from "next";
import type { AdminPack } from "@yamboka/shared";
import { ActionDialog } from "@/components/admin/action-dialog";
import { PacksTable } from "@/components/admin/packs-table";
import { PageHeader, Pill, StatCard, StatGrid } from "@/components/admin/ui";
import { requireUser } from "@/lib/auth";
import { formatFcfa } from "@/lib/format";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Packs de crédits — Administration" };

export default async function PacksPage() {
  await requireUser({ role: "ADMIN" });
  const packs = await serverGet<AdminPack[]>("/admin/packs");
  const active = packs.filter((p) => p.active);
  const publicPacks = active.filter((p) => p.publicVisible);
  const underMargin = active.filter((p) => p.belowThreshold).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Packs de crédits"
        description="Tous les packs restent disponibles à l’achat dans l’espace client. Les pages publiques n’en affichent que trois : choisissez-les ici."
        actions={
          <ActionDialog
            trigger="Nouveau pack"
            triggerVariant="default"
            title="Nouveau pack"
            description="Le pack est créé inactif et non public. Il doit passer le contrôle de marge pour être publié."
            endpoint="/admin/packs"
            fields={[
              { name: "name", label: "Nom", type: "text" },
              { name: "price", label: "Prix (FCFA)", type: "number" },
              { name: "credits", label: "Crédits de base", type: "number" },
              { name: "bonusPercent", label: "Bonus (%)", type: "number", defaultValue: 0 },
            ]}
            submitLabel="Créer le pack"
          />
        }
      />

      <StatGrid>
        <StatCard label="Packs" value={packs.length} hint={`${packs.length - active.length} inactif${packs.length - active.length > 1 ? "s" : ""}`} />
        <StatCard label="Packs actifs (vendus)" value={active.length} hint={underMargin > 0 ? `${underMargin} sous la marge minimale` : "Tous au-dessus de la marge minimale"} />
        <StatCard label="Offres publiques" value={`${publicPacks.length} / 3`} hint="Affichées sur la page Tarifs" />
      </StatGrid>

      <section aria-labelledby="public" className="space-y-2 rounded-2xl border bg-card p-4">
        <h2 id="public" className="font-semibold">Offre affichée sur les pages publiques ({publicPacks.length}/3)</h2>
        {publicPacks.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun pack public : la page Tarifs n’affiche aucune offre.</p>
        ) : (
          <ul className="flex flex-wrap gap-2 text-sm">
            {publicPacks.map((p) => (
              <li key={p.id}>
                <Pill tone={p.featured ? "ok" : "neutral"}>{p.name} · {formatFcfa(p.priceFcfa)}{p.featured ? " · recommandé" : ""}</Pill>
              </li>
            ))}
          </ul>
        )}
      </section>

      <PacksTable packs={packs} />
      <p className="text-xs text-muted-foreground">
        Marge = (crédits × valeur perçue du crédit − coût fournisseur − commission) ÷ revenu, calculée sur le produit actif le moins rentable (10 s de vidéo, ou 1 image). Seuil, taux de change et frais : « Paramètres ».
      </p>
    </div>
  );
}
