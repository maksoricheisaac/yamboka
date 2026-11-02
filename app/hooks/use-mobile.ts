import * as React from "react"

const MOBILE_BREAKPOINT = 1024

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

/** La barre latérale passe en tiroir sous 1024 px : en dessous, elle prenait un tiers de l'écran et écrasait les tableaux.
 * Vrai sous le point de rupture « mobile ». Faux au rendu serveur (le tiroir mobile ne s'affiche qu'après hydratation). */
export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.innerWidth < MOBILE_BREAKPOINT,
    () => false
  )
}
