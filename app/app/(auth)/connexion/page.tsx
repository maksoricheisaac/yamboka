import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { GoogleButton, OrSeparator } from "@/components/auth/google-button";
import { LoginForm } from "@/components/auth/login-form";
import { getAuthProviders, getSessionUser } from "@/lib/server-api";

export const metadata: Metadata = { title: "Connexion" };

async function LoginContent() {
  // Déjà connecté : inutile de montrer le formulaire.
  if (await getSessionUser()) redirect("/app");
  const providers = await getAuthProviders();
  return (
    <AuthCard
      title="Connexion"
      lead="Retrouvez vos crédits et vos créations."
      footer={
        <>
          Pas encore de compte ?{" "}
          <Link href="/inscription" className="font-medium text-primary underline underline-offset-4">
            Créer un compte
          </Link>
        </>
      }
    >
      {providers.google && (
        <>
          <GoogleButton />
          <OrSeparator />
        </>
      )}
      <LoginForm />
    </AuthCard>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<p role="status" className="text-muted-foreground">Chargement…</p>}>
      <LoginContent />
    </Suspense>
  );
}
