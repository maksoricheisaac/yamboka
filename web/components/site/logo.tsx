import Link from "next/link";
import { SITE } from "@/content/site";

/** Marque provisoire : monogramme « Y » en cadre vidéo + mot-symbole. À remplacer par le logo définitif. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`inline-flex items-center gap-2.5 rounded-md font-heading text-xl font-bold tracking-tight ${className}`}
      aria-label={`${SITE.name} — accueil`}
    >
      <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
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
      {SITE.name}
    </Link>
  );
}
