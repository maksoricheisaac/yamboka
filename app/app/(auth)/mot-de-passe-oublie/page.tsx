import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { ForgotForm } from "@/components/auth/forgot-form";

export const metadata: Metadata = { title: "Mot de passe oublié" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Mot de passe oublié"
      lead="Saisissez votre adresse e-mail : nous vous envoyons un lien valable 1 heure."
      footer={
        <Link href="/connexion" className="font-medium text-primary underline underline-offset-4">
          Retour à la connexion
        </Link>
      }
    >
      <ForgotForm />
    </AuthCard>
  );
}
