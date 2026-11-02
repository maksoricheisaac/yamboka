"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { USER_TABS } from "@/lib/nav";

/**
 * Barre d'onglets du bas, réservée au mobile : les cinq actions fréquentes sans ouvrir le menu.
 * Hauteur fixe (4 rem) ; le contenu réserve la même place (voir AppShell) et respecte la zone sûre des iPhone.
 */
export function BottomTabs() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-background/85 lg:hidden"
    >
      <ul className="mx-auto grid h-16 max-w-xl grid-cols-5">
        {USER_TABS.map((tab) => {
          const active = tab.exact ? pathname === tab.href : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className="group flex h-full flex-col items-center justify-center gap-0.5 text-[0.7rem] font-medium text-muted-foreground outline-none transition-colors focus-visible:bg-muted aria-[current=page]:text-primary"
              >
                <span className="grid h-7 w-12 place-items-center rounded-full transition-colors group-aria-[current=page]:bg-primary/12 group-active:scale-95">
                  <tab.icon className="size-5" aria-hidden />
                </span>
                {tab.title}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
