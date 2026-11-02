import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { VerifyEmailCard } from "@/components/auth/verify-email-card";
import { getAuthProviders, getSessionUser } from "@/lib/server-api";

export const metadata: Metadata = { title: "Confirmer mon adresse e-mail" };

async function Content({ searchParams }: { searchParams: Promise<{ envoi?: string }> }) {
  const user = await getSessionUser();
  // Le code se saisit connecté : sans session, on passe d'abord par la connexion.
  if (!user) redirect("/connexion?suivant=/app");
  if (user.emailVerified) redirect(user.role === "ADMIN" ? "/admin" : "/app");
  const [{ envoi }, { emailOtp }] = await Promise.all([searchParams, getAuthProviders()]);
  return <VerifyEmailCard email={user.email} initialCooldown={emailOtp.resendCooldownSeconds} codeLength={emailOtp.length} ttlMinutes={emailOtp.ttlMinutes} sent={envoi !== "echec"} />;
}

export default function VerifyEmailPage({ searchParams }: PageProps<"/verifier-email">) {
  return (
    <AuthCard title="Confirmez votre adresse e-mail" lead="Saisissez le code reçu pour activer votre compte.">
      <Suspense fallback={<p role="status" className="text-muted-foreground">Chargement…</p>}>
        <Content searchParams={searchParams as Promise<{ envoi?: string }>} />
      </Suspense>
    </AuthCard>
  );
}
