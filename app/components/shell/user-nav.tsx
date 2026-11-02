"use client";

import { LogOut, Settings, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiPost } from "@/lib/api-client";

export interface NavUser {
  name: string;
  email: string;
  role: "USER" | "ADMIN";
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?"
  );
}

/**
 * Menu du compte, commun aux espaces client et administration : identité, profil, déconnexion.
 * C'est le SEUL endroit où se trouve la déconnexion. Menu Radix : ouverture au clic ou au clavier
 * (Entrée, Espace, flèche bas), navigation aux flèches, Échap pour fermer, focus rendu au déclencheur,
 * fermeture après chaque choix.
 */
export function UserNav({ user, profileHref, settingsHref }: { user: NavUser; profileHref: string; settingsHref?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    try {
      // Invalide la session côté serveur (révocation + effacement du cookie).
      await apiPost("/auth/logout");
    } finally {
      // Même si l'appel échoue (session déjà expirée), on repart de la page de connexion.
      router.replace("/connexion");
      router.refresh();
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Menu du compte de ${user.name}`}
        className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/15 text-sm font-bold text-primary outline-none ring-offset-background transition-colors hover:bg-primary/25 focus-visible:ring-3 focus-visible:ring-ring/60 data-[state=open]:bg-primary/25"
      >
        <span aria-hidden>{initials(user.name)}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64">
        <DropdownMenuLabel className="space-y-0.5">
          <span className="block truncate font-semibold">{user.name}</span>
          <span className="block truncate text-xs font-normal text-muted-foreground">{user.email}</span>
          {user.role === "ADMIN" && (
            <span className="mt-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              Administrateur
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={profileHref}>
            <UserRound aria-hidden /> Mon profil
          </Link>
        </DropdownMenuItem>
        {settingsHref && (
          <DropdownMenuItem asChild>
            <Link href={settingsHref}>
              <Settings aria-hidden /> Paramètres
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          variant="destructive"
          disabled={pending}
          onSelect={() => void logout()}
        >
          <LogOut aria-hidden /> {pending ? "Déconnexion…" : "Se déconnecter"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
