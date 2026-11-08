import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { PAGE_SIZES, pageWindow, withParams, type Params } from "@/lib/pagination";

const BTN =
  "inline-flex h-10 min-w-10 items-center justify-center rounded-lg border px-3 text-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/60";

/**
 * Pagination SERVEUR commune à toutes les listes : la page affichée est celle que l'API a renvoyée (méta `page`,
 * `pageSize`, `total`). Chaque contrôle est un lien : fonctionne sans JavaScript, conserve les filtres, se partage
 * par adresse. Changer de taille ramène à la première page. Sur mobile, la barre passe à la ligne (cibles de 40 px).
 */
export function Pager({ page, total, pageSize, path, params }: { page: number; total: number; pageSize: number; path: string; params: Params }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  const href = (p: number) => withParams(path, params, { page: p > 1 ? String(p) : undefined });
  return (
    <nav aria-label="Pagination" className="flex flex-col gap-3 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <p className="text-muted-foreground" aria-live="polite">
        {total === 0 ? "0 résultat" : `${first}–${last} sur ${total} résultat${total > 1 ? "s" : ""}`} · page {page} sur {pages}
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Par page</span>
          {PAGE_SIZES.map((n) => (
            <Link
              key={n}
              href={withParams(path, params, { pageSize: n === 20 ? undefined : String(n), page: undefined })}
              aria-current={n === pageSize ? "true" : undefined}
              className={cn(BTN, "px-2", n === pageSize ? "border-primary bg-primary/10 font-semibold text-primary" : "bg-card text-muted-foreground hover:text-foreground")}
            >
              {n}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {page > 1 ? (
            <Link href={href(page - 1)} rel="prev" aria-label="Page précédente" className={cn(BTN, "bg-card")}>
              <ChevronLeft className="size-4" aria-hidden />
            </Link>
          ) : (
            <span aria-disabled="true" className={cn(BTN, "opacity-40")}>
              <ChevronLeft className="size-4" aria-hidden />
            </span>
          )}
          {pageWindow(page, pages).map((n, i) =>
            n === "…" ? (
              <span key={`gap-${i}`} aria-hidden className="px-1 text-muted-foreground">
                …
              </span>
            ) : (
              <Link
                key={n}
                href={href(n)}
                aria-label={`Page ${n}`}
                aria-current={n === page ? "page" : undefined}
                className={cn(BTN, n === page ? "border-primary bg-primary font-semibold text-primary-foreground" : "bg-card hover:bg-muted")}
              >
                {n}
              </Link>
            ),
          )}
          {page < pages ? (
            <Link href={href(page + 1)} rel="next" aria-label="Page suivante" className={cn(BTN, "bg-card")}>
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          ) : (
            <span aria-disabled="true" className={cn(BTN, "opacity-40")}>
              <ChevronRight className="size-4" aria-hidden />
            </span>
          )}
        </div>
      </div>
    </nav>
  );
}
