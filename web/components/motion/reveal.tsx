"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/**
 * Apparition douce au défilement. Seule la position est animée : le contenu reste toujours visible
 * (sans JavaScript, pour les robots, et avec « réduire les animations »).
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ y: 16 }}
      whileInView={{ y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
