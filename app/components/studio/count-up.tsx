"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Nombre qui s’incrémente une fois à l’affichage. Le HTML initial contient déjà la valeur finale (rendu serveur,
 * lecteurs d’écran) ; avec « réduire les animations », elle reste telle quelle.
 */
export function CountUp({ to, duration = 1100, className }: { to: number; duration?: number; className?: string }) {
  const [shown, setShown] = useState<number | null>(null);
  const done = useRef(false);

  useEffect(() => {
    if (done.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    done.current = true;
    const start = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      const k = Math.min(1, (now - start) / duration);
      setShown(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [to, duration]);

  return <span className={`tabular-nums ${className ?? ""}`}>{(shown ?? to).toLocaleString("fr-FR")}</span>;
}
