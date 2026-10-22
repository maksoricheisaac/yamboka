import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * Faux au rendu serveur et avant l'hydratation, vrai ensuite.
 * Les boutons d'envoi des formulaires restent désactivés jusque-là : sans cela, un envoi natif avant
 * l'hydratation (connexion lente) enverrait les champs, mot de passe compris, dans l'URL.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
