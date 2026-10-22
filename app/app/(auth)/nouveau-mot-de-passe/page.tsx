import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { ResetForm } from "@/components/auth/reset-form";

export const metadata: Metadata = { title: "Nouveau mot de passe" };

export default function ResetPasswordPage() {
  return (
    <AuthCard title="Nouveau mot de passe" lead="Choisissez un mot de passe d’au moins 8 caractères.">
      <Suspense fallback={<p role="status" className="text-muted-foreground">Chargement…</p>}>
        <ResetForm />
      </Suspense>
    </AuthCard>
  );
}
