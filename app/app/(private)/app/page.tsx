import { CheckCircle2, Coins, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import { VerifyEmailBanner } from "@/components/auth/resend-verification";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Tableau de bord" };

export default async function DashboardPage() {
  const user = await requireUser();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Bonjour {user.firstName}</h1>
        <p className="mt-1 text-muted-foreground">Bienvenue sur Yamboka.</p>
      </div>

      {!user.emailVerified && <VerifyEmailBanner email={user.email} />}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription className="flex items-center gap-2">
              <Coins className="size-4" aria-hidden /> Votre solde
            </CardDescription>
            <CardTitle className="text-4xl">{user.credits} crédits</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {user.credits > 0
              ? "Vos crédits de bienvenue sont disponibles."
              : user.emailVerified
                ? "Aucun crédit pour le moment."
                : "Les crédits de bienvenue arrivent après la confirmation de votre e-mail."}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription className="flex items-center gap-2">
              <CheckCircle2 className="size-4" aria-hidden /> Votre compte
            </CardDescription>
            <CardTitle className="text-xl">{user.emailVerified ? "Adresse confirmée" : "Adresse à confirmer"}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">{user.email}</CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription className="flex items-center gap-2">
              <Sparkles className="size-4" aria-hidden /> Créations
            </CardDescription>
            <CardTitle className="text-xl">Bientôt disponibles</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            La création de vidéos et d’images et l’achat de crédits ouvrent prochainement.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
