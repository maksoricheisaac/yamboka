"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const HeroScene = dynamic(() => import("./hero-scene"), { ssr: false });

type Capability = "pending" | "full" | "static" | "none";

function detectCapability(): Capability {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return "none";
  } catch {
    return "none";
  }
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  const modest = (nav.deviceMemory ?? 8) <= 2 || (navigator.hardwareConcurrency ?? 8) <= 2;
  const saveData = nav.connection?.saveData === true;
  // Appareil modeste ou économie de données : aucune scène 3D, la composition HTML suffit.
  if (modest || saveData) return "none";
  return reduced ? "static" : "full";
}

const subscribeNone = () => () => {};

/**
 * Scène décorative chargée à la demande. Sans WebGL, sur appareil modeste ou en économie de données,
 * rien n'est chargé : l'aperçu HTML du hero reste seul. Le rendu est suspendu hors écran.
 */
export function HeroSceneLoader({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  // Lecture d'une capacité du navigateur : "pending" au rendu serveur, valeur réelle après hydratation.
  const capability = useSyncExternalStore(subscribeNone, detectCapability, () => "pending" as Capability);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.05 });
    io.observe(el);
    const onVisibility = () => setVisible((v) => (document.hidden ? false : v));
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <div ref={ref} aria-hidden className={className}>
      {(capability === "full" || capability === "static") && (
        <HeroScene animate={capability === "full" && visible} />
      )}
    </div>
  );
}
