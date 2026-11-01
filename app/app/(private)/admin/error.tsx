"use client";

import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Erreur de chargement d'une page d'administration : message clair, sans détail interne, avec nouvel essai. */
export default function AdminError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-md space-y-4 rounded-2xl border bg-card p-8 text-center">
      <TriangleAlert className="mx-auto size-8 text-destructive" aria-hidden />
      <h1 className="text-xl font-bold">Données indisponibles</h1>
      <p className="text-sm text-muted-foreground">
        Impossible de charger cette page pour le moment. Vérifiez que l’API est joignable, puis réessayez. Si votre rôle a changé, reconnectez-vous.
      </p>
      <Button onClick={reset}>Réessayer</Button>
    </div>
  );
}
