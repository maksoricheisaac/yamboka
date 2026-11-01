import { MailWarning } from "lucide-react";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/** Bandeau affiché tant que l'adresse e-mail n'est pas vérifiée (achat et création bloqués, UF-05). */
export function VerifyEmailBanner({ email }: { email: string }) {
  return (
    <Alert className="border-accent bg-accent/15">
      <MailWarning aria-hidden />
      <AlertTitle>Confirmez votre adresse e-mail</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>
          Un code de vérification est envoyé à <strong>{email}</strong>. Tant que l’adresse n’est pas confirmée, vous ne pouvez
          ni acheter de crédits ni créer de vidéo.
        </p>
        <Button asChild variant="outline">
          <Link href="/verifier-email">Saisir mon code</Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}
