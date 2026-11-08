"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { withParams } from "@/lib/pagination";

/**
 * En-tête de colonne triée PAR LE SERVEUR : le clic change `sort` et `dir` dans l'adresse (croissant, décroissant,
 * puis tri par défaut) et ramène à la première page. Contrairement au tri local, il porte sur toute la liste et non
 * sur la seule page affichée.
 */
export function ServerSortHeader({ id, title }: { id: string; title: string }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const active = sp.get("sort") === id;
  const dir = sp.get("dir") === "asc" ? "asc" : "desc";
  const params = Object.fromEntries(sp.entries());
  const next = !active ? { sort: id, dir: "asc" } : dir === "asc" ? { sort: id, dir: "desc" } : { sort: undefined, dir: undefined };
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <Link
      href={withParams(pathname, params, { ...next, page: undefined })}
      className="-mx-1 -my-2 inline-flex min-h-9 items-center gap-1.5 rounded px-1 font-semibold hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"
      aria-label={`Trier par ${title}`}
    >
      {title}
      <Icon className="size-3.5" aria-hidden />
    </Link>
  );
}
