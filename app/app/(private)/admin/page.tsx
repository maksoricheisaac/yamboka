import type { Metadata } from "next";

export const metadata: Metadata = { title: "Administration" };

export default function AdminHomePage() {
  return (
    <div className="space-y-3">
      <h1 className="text-3xl font-bold">Administration</h1>
      <p className="max-w-2xl text-muted-foreground">
        L’accès administrateur est actif et protégé. Le tableau de bord, la modération, les clients, l’offre et la
        gestion seront ajoutés avec la navigation latérale dans un lot dédié.
      </p>
    </div>
  );
}
