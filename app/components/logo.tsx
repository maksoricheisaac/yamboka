import Link from "next/link";

/** Pastille de marque provisoire (monogramme « Y » en cadre vidéo) : à remplacer par le logo définitif. */
export function LogoMark({ size = 30, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <rect width="32" height="32" rx="9" className="fill-primary" />
      <path
        d="M9 9.5 16 18l7-8.5M16 18v6"
        className="stroke-primary-foreground"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="24.5" cy="8" r="2.4" className="fill-accent" />
    </svg>
  );
}

export function Logo({ href = "/app", className = "" }: { href?: string; className?: string }) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-2.5 rounded-md font-heading text-xl font-bold tracking-tight ${className}`}
      aria-label="Yamboka"
    >
      <LogoMark />
      Yamboka
    </Link>
  );
}
