"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";

export type UrlPatch = Record<string, string | undefined>;

/**
 * Critères de consultation d'une liste paginée par l'API, portés par l'ADRESSE (source unique de vérité) :
 * recherche, filtres, tri, page et taille de page. Ils survivent au rafraîchissement et se partagent par lien ;
 * le composant serveur refait la requête à chaque changement.
 *
 * Seuls ces états sont synchronisés : la visibilité des colonnes reste locale au tableau, elle ne regarde personne
 * d'autre que l'écran courant.
 */
export function useUrlTableState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  /** Écrit les paramètres donnés ; une valeur vide retire le paramètre. Tout changement de critère ramène page 1. */
  const patch = useCallback(
    (changes: UrlPatch, options: { keepPage?: boolean } = {}) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value === undefined || value === "") next.delete(key);
        else next.set(key, value);
      }
      if (!options.keepPage) next.delete("page");
      const qs = next.toString();
      startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    },
    [pathname, router, searchParams],
  );

  const get = useCallback((key: string) => searchParams.get(key) ?? undefined, [searchParams]);

  return { pending, patch, get };
}
