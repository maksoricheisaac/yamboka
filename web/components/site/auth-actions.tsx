"use client";

import { Button } from "@/components/ui/button";
import { adminSpaceUrl, loginUrl, signupUrl, userSpaceUrl } from "@/content/site";
import { useAuthState } from "./auth-session";

/** Destination et libellé de l'espace privé : mêmes intitulés que l'application (« Mon espace », « Administration »). */
function useSpace() {
  const auth = useAuthState();
  if (auth.status !== "user") return null;
  return auth.role === "ADMIN"
    ? { href: adminSpaceUrl, label: "Administration" }
    : { href: userSpaceUrl, label: "Mon espace" };
}

/** Actions de la barre (écrans ≥ sm). Pendant la vérification : une réserve invisible, sans bouton trompeur. */
export function HeaderAuthActions() {
  const auth = useAuthState();
  const space = useSpace();

  if (auth.status === "loading") {
    return <div aria-hidden className="hidden h-9 w-44 sm:block" />;
  }
  if (space) {
    return (
      <Button asChild className="hidden sm:inline-flex">
        <a href={space.href}>{space.label}</a>
      </Button>
    );
  }
  return (
    <>
      <Button asChild variant="ghost" className="hidden sm:inline-flex">
        <a href={loginUrl}>Se connecter</a>
      </Button>
      <Button asChild className="hidden sm:inline-flex">
        <a href={signupUrl}>Commencer</a>
      </Button>
    </>
  );
}

/** Actions du menu mobile. */
export function MobileAuthActions() {
  const auth = useAuthState();
  const space = useSpace();

  if (auth.status === "loading") return <div aria-hidden className="h-[5.5rem]" />;
  if (space) {
    return (
      <Button asChild size="lg">
        <a href={space.href}>{space.label}</a>
      </Button>
    );
  }
  return (
    <>
      <Button asChild size="lg">
        <a href={signupUrl}>Créer un compte</a>
      </Button>
      <Button asChild size="lg" variant="outline">
        <a href={loginUrl}>Se connecter</a>
      </Button>
    </>
  );
}
