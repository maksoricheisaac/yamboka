"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { SITE } from "@/content/site";

/** Rôles exposés par GET /auth/me (même valeurs que @yamboka/shared). */
export type SiteRole = "USER" | "ADMIN";

/** loading : réponse de l'API pas encore reçue (on n'affiche aucun bouton) ; guest : visiteur ; user : session vérifiée. */
export type AuthState = { status: "loading" } | { status: "guest" } | { status: "user"; role: SiteRole };

const AuthContext = createContext<AuthState>({ status: "loading" });

export function useAuthState(): AuthState {
  return useContext(AuthContext);
}

async function fetchAuthState(signal: AbortSignal): Promise<AuthState> {
  try {
    // L'identité n'est jamais déduite de la présence d'un cookie : c'est l'API qui valide la session.
    const res = await fetch(`${SITE.apiUrl}/v1/auth/me`, { credentials: "include", cache: "no-store", signal });
    if (!res.ok) return { status: "guest" };
    const data = (await res.json()) as { user?: { role?: SiteRole } };
    const role = data.user?.role;
    return role === "USER" || role === "ADMIN" ? { status: "user", role } : { status: "guest" };
  } catch (error) {
    if (signal.aborted) throw error;
    // API injoignable ou cookie non transmis (autre domaine) : le visiteur voit les actions de connexion.
    return { status: "guest" };
  }
}

/**
 * État d'authentification du site public. Le site est statique : la session ne peut être connue que dans le navigateur,
 * en interrogeant l'API. Revérifié au retour sur l'onglet et à la restauration depuis le cache de navigation (bouton
 * Précédent après une déconnexion), pour ne jamais garder de boutons périmés.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const controller = useRef<AbortController | null>(null);

  const refresh = useCallback(() => {
    controller.current?.abort();
    const next = new AbortController();
    controller.current = next;
    fetchAuthState(next.signal)
      .then((result) => {
        // Évite un rendu inutile quand rien n'a changé (retours d'onglet fréquents).
        setState((prev) => (prev.status === result.status && (prev.status !== "user" || (result.status === "user" && prev.role === result.role)) ? prev : result));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      controller.current?.abort();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [refresh]);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
