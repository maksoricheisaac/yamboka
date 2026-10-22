import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { VerifyEmailCard } from "@/components/auth/verify-email-card";

export const metadata: Metadata = { title: "Confirmer mon adresse e-mail" };

export default function VerifyEmailPage() {
  return (
    <AuthCard title="Confirmer votre adresse e-mail" lead="Un dernier clic pour activer votre compte.">
      <Suspense fallback={<p role="status" className="text-muted-foreground">Chargement…</p>}>
        <VerifyEmailCard />
      </Suspense>
    </AuthCard>
  );
}
