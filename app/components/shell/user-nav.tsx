"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/app", label: "Tableau de bord", exact: true },
  { href: "/app/credits", label: "Crédits" },
  { href: "/app/achats", label: "Achats" },
];

/** Navigation de l'espace utilisateur : défilable horizontalement sur mobile, page courante signalée. */
export function UserNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Navigation de l’espace" className="border-b bg-background">
      <ul className="mx-auto flex w-full max-w-6xl gap-1 overflow-x-auto px-4 sm:px-6">
        {ITEMS.map((item) => {
          const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`inline-block whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
