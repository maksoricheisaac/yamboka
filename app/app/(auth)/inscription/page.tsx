import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { GoogleButton, OrSeparator } from "@/components/auth/google-button";
import { SignupForm } from "@/components/auth/signup-form";
import { getAuthProviders, getSessionUser } from "@/lib/server-api";

export const metadata: Metadata = { title: "Créer un compte" };

async function SignupContent() {
  if (await getSessionUser()) redirect("/app");
  const providers = await getAuthProviders();
  return (
    <AuthCard
      title="Créer un compte"
      lead="Des crédits de bienvenue vous sont offerts après la confirmation de votre adresse e-mail."
      footer={
        <>
          Déjà inscrit ?{" "}
          <Link href="/connexion" className="font-medium text-primary underline underline-offset-4">
            Se connecter
          </Link>
        </>
      }
    >
      {providers.google && (
        <>
          <GoogleButton label="S’inscrire avec Google" />
          <OrSeparator />
        </>
      )}
      <SignupForm />
    </AuthCard>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<p role="status" className="text-muted-foreground">Chargement…</p>}>
      <SignupContent />
    </Suspense>
  );
}
