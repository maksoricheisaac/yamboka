"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { apiPost } from "@/lib/api-client";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    try {
      await apiPost("/auth/logout");
    } finally {
      // Même si l'appel échoue (session déjà expirée), on repart de la page de connexion.
      router.replace("/connexion");
      router.refresh();
    }
  }

  return (
    <Button variant="ghost" onClick={logout} disabled={pending}>
      <LogOut aria-hidden />
      <span className="hidden sm:inline">{pending ? "Déconnexion…" : "Se déconnecter"}</span>
      <span className="sr-only sm:hidden">Se déconnecter</span>
    </Button>
  );
}
