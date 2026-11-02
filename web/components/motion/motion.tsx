"use client";

import { LazyMotion, MotionConfig, domAnimation, m, type Variants } from "motion/react";
import type { ReactNode } from "react";

/**
 * Animations du site : un seul fournisseur, des variantes réutilisables.
 *  - `LazyMotion` + `m` : seul le sous-ensemble d'animations de base est chargé (bundle réduit).
 *  - `MotionConfig reducedMotion="user"` : avec « réduire les animations » (système), les déplacements et
 *    mises à l'échelle sont désactivés automatiquement.
 *  - Le contenu n'est JAMAIS masqué en attendant une animation (pas d'opacité 0) : il reste lisible sans
 *    JavaScript, pour les robots et sur connexion lente. On n'anime que des déplacements courts.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}

const EASE = [0.22, 1, 0.36, 1] as const;

export const variants = {
  /** Apparition au défilement : montée courte. */
  rise: {
    hidden: { y: 18 },
    show: { y: 0, transition: { duration: 0.5, ease: EASE } },
  },
  /** Conteneur qui échelonne ses enfants. */
  stagger: {
    hidden: {},
    show: { transition: { staggerChildren: 0.08 } },
  },
  /** Hero : même montée, un peu plus lente, déclenchée au chargement. */
  hero: {
    hidden: { y: 14 },
    show: { y: 0, transition: { duration: 0.6, ease: EASE } },
  },
} satisfies Record<string, Variants>;

/** Section révélée une fois, au défilement. */
export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <m.div
      className={className}
      variants={variants.rise}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-60px" }}
      transition={{ delay }}
    >
      {children}
    </m.div>
  );
}

/** Liste dont les éléments apparaissent l'un après l'autre (une seule fois). */
export function Stagger({ children, className, as = "ul" }: { children: ReactNode; className?: string; as?: "ul" | "ol" | "div" }) {
  const Tag = m[as];
  return (
    <Tag className={className} variants={variants.stagger} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }}>
      {children}
    </Tag>
  );
}

export function StaggerItem({ children, className, as = "li" }: { children: ReactNode; className?: string; as?: "li" | "div" | "article" }) {
  const Tag = m[as];
  return (
    <Tag className={className} variants={variants.rise}>
      {children}
    </Tag>
  );
}

/** Entrée du hero au chargement (pas au défilement). */
export function HeroItem({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <m.div className={className} variants={variants.hero} initial="hidden" animate="show" transition={{ delay }}>
      {children}
    </m.div>
  );
}

/** Carte légèrement soulevée au survol/au toucher : retour d'état discret. */
export function HoverLift({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <m.div className={className} whileHover={{ y: -4 }} whileTap={{ scale: 0.99 }} transition={{ duration: 0.2, ease: EASE }}>
      {children}
    </m.div>
  );
}

/** Bouton d'appel à l'action : réaction discrète à l'appui. */
export function TapScale({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <m.span className={`inline-flex ${className ?? ""}`} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} transition={{ duration: 0.15 }}>
      {children}
    </m.span>
  );
}
