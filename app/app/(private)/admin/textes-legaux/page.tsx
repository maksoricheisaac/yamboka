import type { Metadata } from "next";
import type { LegalVersionRow } from "@yamboka/shared";
import { ActionDialog } from "@/components/admin/action-dialog";
import { PageHeader, Pill } from "@/components/admin/ui";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Textes légaux — Administration" };

const TYPES = [
  { value: "CGU", label: "Conditions d’utilisation" },
  { value: "CHARTE", label: "Charte d’utilisation" },
  { value: "CONFIDENTIALITE", label: "Politique de confidentialité" },
] as const;

export default async function LegalPage() {
  await requireUser({ role: "ADMIN" });
  const docs = await serverGet<LegalVersionRow[]>("/admin/legal");

  return (
    <div className="space-y-8">
      <PageHeader
        title="Textes légaux"
        description="Chaque publication crée une nouvelle version ; les anciennes sont conservées. Une version majeure impose une nouvelle acceptation aux utilisateurs."
      />
      {TYPES.map((t) => {
        const versions = docs.filter((d) => d.type === t.value);
        const latest = versions[0];
        return (
          <section key={t.value} aria-labelledby={`t-${t.value}`} className="space-y-3 rounded-2xl border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id={`t-${t.value}`} className="text-lg font-bold">
                {t.label} {latest && <Pill tone="info">version {latest.version}</Pill>}
              </h2>
              <ActionDialog
                trigger="Publier une nouvelle version"
                title={`Nouvelle version — ${t.label}`}
                description="Le texte publié remplace la version en vigueur. Faites-le relire par un juriste avant publication."
                endpoint="/admin/legal"
                fixed={{ type: t.value }}
                fields={[
                  { name: "content", label: "Texte complet", type: "textarea", defaultValue: latest?.content },
                  { name: "major", label: "Version majeure (nouvelle acceptation exigée)", type: "select", options: [{ value: "false", label: "Non — correction mineure" }, { value: "true", label: "Oui — nouvelle acceptation exigée" }], defaultValue: "false" },
                ]}
                submitLabel="Publier"
              />
            </div>
            {latest ? (
              <details>
                <summary className="cursor-pointer text-sm font-medium text-primary">Lire le texte en vigueur (publié le {formatDateTime(latest.publishedAt)})</summary>
                <p className="mt-2 whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm">{latest.content}</p>
              </details>
            ) : (
              <p className="text-sm text-muted-foreground">Aucune version publiée.</p>
            )}
            {versions.length > 1 && (
              <p className="text-xs text-muted-foreground">
                Historique : {versions.map((v) => `v${v.version}${v.major ? " (majeure)" : ""}`).join(", ")}
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
