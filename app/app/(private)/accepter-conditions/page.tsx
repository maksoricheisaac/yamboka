import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AcceptLegalForm } from "@/components/auth/accept-legal-form";
import { AuthCard } from "@/components/auth/auth-card";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Conditions d’utilisation" };

async function AcceptContent() {
  const user = await requireUser({ allowUnacceptedLegal: true });
  if (user.legalAccepted) redirect("/app");
  return (
    <AuthCard
      title="Un dernier pas"
      lead="Pour utiliser Yamboka, vous devez accepter les conditions d’utilisation et la charte d’utilisation responsable."
    >
      <AcceptLegalForm />
    </AuthCard>
  );
}

export default function AcceptLegalPage() {
  return (
    <main className="flex min-h-dvh flex-1 items-center justify-center bg-secondary/40 px-4 py-10">
      <Suspense fallback={<p role="status" className="text-muted-foreground">Chargement…</p>}>
        <AcceptContent />
      </Suspense>
    </main>
  );
}
