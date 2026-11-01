import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import type { SetupStatus } from "@yamboka/shared";
import { AuthCard } from "@/components/auth/auth-card";
import { SetupWizard } from "@/components/setup/setup-wizard";
import { Button } from "@/components/ui/button";
import { publicGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Installation de Yamboka" };

/** L'état est lu côté serveur : une fois la plateforme initialisée, le formulaire n'est même plus envoyé au navigateur. */
async function Content() {
  let status: SetupStatus | null = null;
  try {
    status = await publicGet<SetupStatus>("/setup/status");
  } catch {
    status = null;
  }
  if (!status) {
    return <Wrapped><p role="alert" className="text-sm font-medium text-destructive">Le serveur n’est pas joignable. Vérifiez que l’API est démarrée.</p></Wrapped>;
  }
  if (status.initialized) {
    return (
      <Wrapped>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">La plateforme est déjà initialisée : l’assistant d’installation est verrouillé et ne peut pas être rouvert.</p>
        <Button asChild size="lg" className="w-full"><Link href="/connexion">Aller à la connexion</Link></Button>
      </div>
      </Wrapped>
    );
  }
  if (!status.secretConfigured) {
    return (
      <Wrapped>
      <p role="alert" className="text-sm">
        L’assistant est indisponible : la variable <code className="rounded bg-muted px-1">SETUP_SECRET</code> n’est pas définie sur le serveur (24 caractères minimum). Définissez-la, redémarrez l’API, puis rechargez cette page.
      </p>
      </Wrapped>
    );
  }
  return <SetupWizard />;
}

function Wrapped({ children }: { children: React.ReactNode }) {
  return (
    <AuthCard title="Installation de Yamboka" lead="Créez le premier administrateur en quelques étapes sécurisées.">
      {children}
    </AuthCard>
  );
}

export default function InstallationPage() {
  return (
    <Suspense fallback={<Wrapped><p role="status" className="text-muted-foreground">Chargement…</p></Wrapped>}>
      <Content />
    </Suspense>
  );
}
